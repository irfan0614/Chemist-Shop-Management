const express = require('express');
const { query } = require('../db/pool');
const { authMiddleware, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/reports/dashboard-summary - Live Operational KPIs from PostgreSQL
router.get('/dashboard-summary', async (req, res) => {
  const shopId = tenantShopId(req);

  try {
    const [
      todaySalesRes,
      paymentModesRes,
      batchesRes,
      lowStockRes,
      balancesRes,
      todayPurchasesRes,
      recentSalesRes,
      shopRes,
    ] = await Promise.all([
      // 1. Today sales totals
      query(
        `SELECT COUNT(*)::int as bill_count,
                COALESCE(SUM(total_amount), 0)::float as total_sales,
                COALESCE(SUM(gst_total), 0)::float as total_gst
         FROM sales_invoices
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND invoice_date = CURRENT_DATE AND status != 'CANCELLED'`,
        [shopId]
      ),

      // 2. Payment modes breakdown today
      query(
        `SELECT payment_mode, COALESCE(SUM(total_amount), 0)::float as total
         FROM sales_invoices
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND invoice_date = CURRENT_DATE AND status != 'CANCELLED'
         GROUP BY payment_mode`,
        [shopId]
      ),

      // 3. Batches statistics
      query(
        `SELECT COUNT(*)::int as total_batches,
                COALESCE(SUM(current_stock), 0)::int as total_units,
                COALESCE(SUM(current_stock * purchase_cost), 0)::float as cost_valuation,
                COALESCE(SUM(current_stock * mrp), 0)::float as mrp_valuation,
                COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE)::int as expired_count,
                COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE AND expiry_date <= (CURRENT_DATE + interval '90 days'))::int as near_expiry_count
         FROM medicine_batches
         WHERE ($1::uuid IS NULL OR shop_id = $1)`,
        [shopId]
      ),

      // 4. Medicines & Low stock count
      query(
        `SELECT COUNT(*)::int as total_medicines,
                COUNT(*) FILTER (
                  WHERE (
                    SELECT COALESCE(SUM(b.current_stock), 0)
                    FROM medicine_batches b
                    WHERE b.medicine_id = m.id AND NOT b.is_blocked
                  ) <= m.reorder_level
                )::int as low_stock_count
         FROM medicines m
         WHERE ($1::uuid IS NULL OR m.shop_id = $1) AND m.is_active = true`,
        [shopId]
      ),

      // 5. Khata balances (Receivables & Payables)
      query(
        `SELECT (SELECT COALESCE(SUM(current_balance), 0)::float FROM customers WHERE ($1::uuid IS NULL OR shop_id = $1)) as customer_receivables,
                (SELECT COALESCE(SUM(current_balance), 0)::float FROM suppliers WHERE ($1::uuid IS NULL OR shop_id = $1)) as supplier_payables`,
        [shopId]
      ),

      // 6. Today inward purchases
      query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total
         FROM purchases
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND purchase_date = CURRENT_DATE`,
        [shopId]
      ),

      // 7. Recent 5 sales
      query(
        `SELECT id, invoice_no as "invoiceNo", customer_name as "customerName",
                total_amount::float as total, payment_mode as "paymentMode",
                created_at as time
         FROM sales_invoices
         WHERE ($1::uuid IS NULL OR shop_id = $1)
         ORDER BY created_at DESC LIMIT 5`,
        [shopId]
      ),

      // 8. Shop details
      query('SELECT * FROM shops WHERE id = $1', [shopId]),
    ]);

    const todayStats = todaySalesRes.rows[0] || { bill_count: 0, total_sales: 0, total_gst: 0 };
    const batchStats = batchesRes.rows[0] || { total_batches: 0, total_units: 0, cost_valuation: 0, mrp_valuation: 0, expired_count: 0, near_expiry_count: 0 };
    const medStats = lowStockRes.rows[0] || { total_medicines: 0, low_stock_count: 0 };
    const balanceStats = balancesRes.rows[0] || { customer_receivables: 0, supplier_payables: 0 };

    let cashSales = 0, upiSales = 0, cardSales = 0, creditSales = 0;
    paymentModesRes.rows.forEach((p) => {
      if (p.payment_mode === 'CASH') cashSales = p.total;
      if (p.payment_mode === 'UPI') upiSales = p.total;
      if (p.payment_mode === 'CARD') cardSales = p.total;
      if (p.payment_mode === 'CREDIT') creditSales = p.total;
    });

    const currentShop = shopRes.rows[0] || null;

    res.json({
      todaysSales: todayStats.total_sales,
      todaysBillsCount: todayStats.bill_count,
      cashSales,
      upiSales,
      cardSales,
      creditSales,
      estimatedGrossProfit: Math.max(0, todayStats.total_sales * 0.20), // approx 20% margin
      totalMedicines: medStats.total_medicines,
      totalBatches: batchStats.total_batches,
      totalUnitsInStock: batchStats.total_units,
      totalStockValuation: batchStats.cost_valuation,
      totalStockMrpValuation: batchStats.mrp_valuation,
      lowStockCount: medStats.low_stock_count,
      nearExpiryCount: batchStats.near_expiry_count,
      expiredCount: batchStats.expired_count,
      customerReceivables: balanceStats.customer_receivables,
      supplierPayables: balanceStats.supplier_payables,
      todaysPurchases: todayPurchasesRes.rows[0]?.total || 0,
      recentBills: recentSalesRes.rows,
      shop: currentShop
        ? {
            id: currentShop.id,
            name: currentShop.shop_name,
            shopName: currentShop.shop_name,
            plan: currentShop.subscription_plan,
            drugLicenseExpiry: currentShop.dl_expiry_date,
            subscriptionExpiry: currentShop.subscription_expires_at,
            dlNumber20b: currentShop.dl_number_20b,
            dlNumber21b: currentShop.dl_number_21b,
          }
        : null,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to generate dashboard metrics: ' + err.message });
  }
});

// GET /api/reports/gst-summary - GSTR-1 Tax Rate Slab & HSN Summary from DB
router.get('/gst-summary', async (req, res) => {
  const shopId = tenantShopId(req);
  const { startDate, endDate } = req.query;

  try {
    let dateFilter = '';
    const params = [shopId];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND si.invoice_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND si.invoice_date <= $${params.length}`;
    }

    const [ratesRes, hsnRes, totalsRes] = await Promise.all([
      // 1. Rate Slabs
      query(
        `SELECT sii.gst_rate as rate,
                COALESCE(SUM(sii.total_amount - sii.gst_amount), 0)::float as taxable,
                COALESCE(SUM(sii.gst_amount / 2), 0)::float as cgst,
                COALESCE(SUM(sii.gst_amount / 2), 0)::float as sgst,
                COALESCE(SUM(sii.gst_amount), 0)::float as "totalTax"
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON sii.invoice_id = si.id
         WHERE ($1::uuid IS NULL OR si.shop_id = $1) AND si.status != 'CANCELLED' ${dateFilter}
         GROUP BY sii.gst_rate
         ORDER BY sii.gst_rate ASC`,
        params
      ),

      // 2. HSN Summary
      query(
        `SELECT m.hsn_code as "hsnCode",
                MAX(m.generic_name) as description,
                COALESCE(SUM(sii.qty), 0)::int as "totalQty",
                COALESCE(SUM(sii.total_amount - sii.gst_amount), 0)::float as "taxableAmount",
                COALESCE(SUM(sii.gst_amount), 0)::float as "totalTax"
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON sii.invoice_id = si.id
         JOIN medicines m ON sii.medicine_id = m.id
         WHERE ($1::uuid IS NULL OR si.shop_id = $1) AND si.status != 'CANCELLED' ${dateFilter}
         GROUP BY m.hsn_code
         ORDER BY "taxableAmount" DESC`,
        params
      ),

      // 3. Totals
      query(
        `SELECT COUNT(si.id)::int as total_invoices,
                COALESCE(SUM(si.total_amount), 0)::float as total_sales
         FROM sales_invoices si
         WHERE ($1::uuid IS NULL OR si.shop_id = $1) AND si.status != 'CANCELLED' ${dateFilter}`,
        params
      ),
    ]);

    res.json({
      rates: ratesRes.rows,
      hsnSummary: hsnRes.rows,
      totalInvoices: totalsRes.rows[0]?.total_invoices || 0,
      totalSales: totalsRes.rows[0]?.total_sales || 0,
    });
  } catch (err) {
    console.error('GST summary error:', err);
    res.status(500).json({ error: 'Failed to generate tax report: ' + err.message });
  }
});

module.exports = router;
