const express = require('express');
const { memStore } = require('../db/pool');
const router = express.Router();

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
}

// GET /api/reports/dashboard-summary - Live Operational KPIs
router.get('/dashboard-summary', (req, res) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysBills = memStore.sales_invoices.filter((b) => b.invoice_date === todayStr);

  const todaysSales = todaysBills.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
  const todaysGst = todaysBills.reduce((sum, b) => sum + (Number(b.gst_total) || 0), 0);

  // Payment breakdown
  const cashSales = todaysBills.filter((b) => b.payment_mode === 'CASH').reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const upiSales = todaysBills.filter((b) => b.payment_mode === 'UPI').reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const cardSales = todaysBills.filter((b) => b.payment_mode === 'CARD').reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const creditSales = todaysBills.filter((b) => b.payment_mode === 'CREDIT').reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

  // Estimated gross profit today = Selling Price - Purchase Cost of sold items
  let todaysCost = 0;
  for (const bill of todaysBills) {
    for (const item of bill.items || []) {
      todaysCost += (Number(item.purchaseCost) || 0) * (Number(item.qty) || 0);
    }
  }
  const estimatedGrossProfit = Math.max(0, todaysSales - todaysGst - todaysCost);

  // Inventory stats
  let totalMedicines = memStore.medicines.filter((m) => m.is_active !== false).length;
  let totalBatches = memStore.batches.length;
  let totalUnitsInStock = 0;
  let totalStockValuation = 0;
  let totalStockMrpValuation = 0;
  let lowStockCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  for (const b of memStore.batches) {
    const qty = Number(b.current_stock) || 0;
    const cost = Number(b.purchase_cost) || 0;
    const mrp = Number(b.mrp) || 0;
    totalUnitsInStock += qty;
    totalStockValuation += qty * cost;
    totalStockMrpValuation += qty * mrp;

    const days = getDaysUntil(b.expiry_date);
    if (days < 0) {
      expiredCount++;
    } else if (days <= 90) {
      nearExpiryCount++;
    }
  }

  for (const m of memStore.medicines) {
    const medBatches = memStore.batches.filter((b) => b.medicine_id === m.id && !b.is_blocked);
    const stock = medBatches.reduce((s, b) => s + (Number(b.current_stock) || 0), 0);
    if (stock <= (m.reorder_level || 15)) {
      lowStockCount++;
    }
  }

  // Outstanding balances
  const customerReceivables = memStore.customers.reduce((sum, c) => sum + (Number(c.current_balance) || 0), 0);
  const supplierPayables = memStore.suppliers.reduce((sum, s) => sum + (Number(s.current_balance) || 0), 0);

  // Today purchases
  const todaysPurchases = memStore.purchases
    .filter((p) => p.purchase_date === todayStr)
    .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);

  // Recent 5 sales
  const recentBills = memStore.sales_invoices.slice(0, 5).map((b) => ({
    id: b.id,
    invoiceNo: b.invoice_no,
    customerName: b.customer_name,
    total: b.total_amount,
    paymentMode: b.payment_mode,
    time: b.created_at,
  }));

  res.json({
    todaysSales,
    todaysBillsCount: todaysBills.length,
    todaysPurchases,
    estimatedGrossProfit,
    cashSales,
    upiSales,
    cardSales,
    creditSales,
    totalMedicines,
    totalBatches,
    totalUnitsInStock,
    totalStockValuation,
    totalStockMrpValuation,
    lowStockCount,
    nearExpiryCount,
    expiredCount,
    customerReceivables,
    supplierPayables,
    recentBills,
  });
});

// GET /api/reports/gst-summary - Indian GST & HSN Breakdown
router.get('/gst-summary', (req, res) => {
  const { startDate, endDate } = req.query;
  let invoices = [...memStore.sales_invoices];
  if (startDate) invoices = invoices.filter((b) => b.invoice_date >= startDate);
  if (endDate) invoices = invoices.filter((b) => b.invoice_date <= endDate);

  const rateBreakdown = {
    '0%': { rate: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
    '5%': { rate: 5, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
    '12%': { rate: 12, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
    '18%': { rate: 18, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
    '28%': { rate: 28, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
  };

  const hsnMap = {};

  for (const inv of invoices) {
    for (const it of inv.items || []) {
      const rateKey = `${Number(it.gstRate || 12)}%`;
      if (!rateBreakdown[rateKey]) {
        rateBreakdown[rateKey] = { rate: Number(it.gstRate), taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
      }

      const taxable = (Number(it.unitPrice) * Number(it.qty)) - (Number(it.unitPrice) * Number(it.qty) * (Number(it.discountPercent || 0) / 100));
      const gst = Number(it.gstAmount) || 0;
      const cgst = gst / 2;
      const sgst = gst / 2;

      rateBreakdown[rateKey].taxable += taxable;
      rateBreakdown[rateKey].cgst += cgst;
      rateBreakdown[rateKey].sgst += sgst;
      rateBreakdown[rateKey].totalTax += gst;

      // HSN breakdown
      const hsn = it.hsnCode || '3004';
      if (!hsnMap[hsn]) {
        hsnMap[hsn] = { hsnCode: hsn, description: 'Medicaments / Pharmaceuticals', totalQty: 0, taxableAmount: 0, totalTax: 0 };
      }
      hsnMap[hsn].totalQty += Number(it.qty);
      hsnMap[hsn].taxableAmount += taxable;
      hsnMap[hsn].totalTax += gst;
    }
  }

  res.json({
    rates: Object.values(rateBreakdown),
    hsnSummary: Object.values(hsnMap),
    totalInvoices: invoices.length,
    totalSales: invoices.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
  });
});

module.exports = router;
