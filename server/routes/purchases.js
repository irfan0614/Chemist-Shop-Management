const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/purchases
router.get('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const { search, supplierId, startDate, endDate } = req.query;

  try {
    let sql = `
      SELECT p.id, p.purchase_no as "purchaseNo", p.supplier_id as "supplierId",
             p.supplier_invoice_no as "supplierInvoiceNo", p.supplier_invoice_date as "supplierInvoiceDate",
             p.purchase_date as "purchaseDate", p.subtotal::float, p.discount_amount::float as "discountAmount",
             p.gst_total::float as "gstTotal", p.total_amount::float as "totalAmount",
             p.paid_amount::float as "paidAmount", p.payment_status as "paymentStatus",
             p.payment_mode as "paymentMode", p.notes,
             s.name as "supplierName", s.company_name as "supplierCompany", s.gstin as "supplierGstin",
             (SELECT COUNT(*)::int FROM purchase_items pi WHERE pi.purchase_id = p.id) as "itemCount"
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE ($1::uuid IS NULL OR p.shop_id = $1)
    `;
    const params = [shopId];

    if (supplierId) {
      params.push(supplierId);
      sql += ` AND p.supplier_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND p.purchase_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND p.purchase_date <= $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(p.purchase_no) LIKE $${params.length} OR
        lower(s.name) LIKE $${params.length} OR
        lower(s.company_name) LIKE $${params.length} OR
        lower(p.supplier_invoice_no) LIKE $${params.length}
      )`;
    }

    sql += ` ORDER BY p.purchase_date DESC, p.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get purchases error:', err);
    res.status(500).json({ error: 'Failed to retrieve purchases: ' + err.message });
  }
});

// GET /api/purchases/:id
router.get('/:id', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows: purRows } = await query(
      `SELECT p.*, s.name as "supplierName", s.company_name as "supplierCompany",
              s.gstin as "supplierGstin", s.phone as "supplierPhone"
       FROM purchases p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = $1 AND ($2::uuid IS NULL OR p.shop_id = $2)`,
      [req.params.id, shopId]
    );

    if (purRows.length === 0) return res.status(404).json({ error: 'Purchase invoice not found' });

    const { rows: items } = await query(
      `SELECT pi.id, pi.medicine_id as "medicineId", m.name as "medicineName",
              pi.batch_no as "batchNo", pi.mfg_date as "mfgDate", pi.expiry_date as "expiryDate",
              pi.pack_size as "packSize", pi.qty, pi.free_qty as "freeQty",
              pi.purchase_cost::float as "purchaseRate", pi.mrp::float,
              pi.selling_price::float as "sellingPrice", pi.gst_rate::float as "gstRate",
              pi.discount_percent::float as "discountPercent", pi.total_amount::float as "totalAmount"
       FROM purchase_items pi
       JOIN medicines m ON pi.medicine_id = m.id
       WHERE pi.purchase_id = $1
       ORDER BY pi.id ASC`,
      [req.params.id]
    );

    res.json({
      ...purRows[0],
      items,
    });
  } catch (err) {
    console.error('Get purchase detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve purchase details: ' + err.message });
  }
});

// POST /api/purchases - Inward Purchase Transaction
router.post('/', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    supplierId,
    supplierInvoiceNo,
    supplierInvoiceDate,
    purchaseDate = new Date().toISOString().slice(0, 10),
    items,
    discountAmount = 0,
    paidAmount = 0,
    paymentMode = 'NEFT/RTGS',
    notes = '',
  } = req.body;

  if (!supplierId || !supplierInvoiceNo || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Supplier, invoice number, and at least one item are required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    // 1. Validate Supplier
    const { rows: supRows } = await client.query(
      `SELECT * FROM suppliers WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)`,
      [supplierId, shopId]
    );
    if (supRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid supplier selected' });
    }

    // 2. Generate Purchase Number using shop counter
    let purchaseCounter = 101;
    let purchasePrefix = 'PUR';
    if (shopId) {
      const { rows: shopRows } = await client.query(
        `UPDATE shops SET purchase_counter = COALESCE(purchase_counter, 100) + 1 WHERE id = $1 RETURNING purchase_counter, purchase_prefix`,
        [shopId]
      );
      if (shopRows.length > 0) {
        purchaseCounter = shopRows[0].purchase_counter;
        purchasePrefix = shopRows[0].purchase_prefix || 'PUR';
      }
    }
    const purchaseNo = `${purchasePrefix}-${String(purchaseCounter).padStart(4, '0')}`;

    // 3. Compute Item Totals
    let subtotal = 0;
    let gstTotal = 0;

    items.forEach((item) => {
      const qty = parseInt(item.qty) || 1;
      const rate = parseFloat(item.purchaseRate) || 0;
      const gstRate = parseFloat(item.gstRate) || 12;
      const disc = parseFloat(item.discountPercent) || 0;

      const gross = qty * rate;
      const discAmt = gross * (disc / 100);
      const taxable = gross - discAmt;
      const gstAmt = taxable * (gstRate / 100);

      subtotal += taxable;
      gstTotal += gstAmt;
    });

    const discTotal = parseFloat(discountAmount) || 0;
    const totalAmount = Math.max(0, subtotal + gstTotal - discTotal);
    const numPaid = parseFloat(paidAmount) || 0;
    const paymentStatus = numPaid >= totalAmount ? 'PAID' : numPaid > 0 ? 'PARTIAL' : 'PENDING';

    // 4. Insert Purchase Header
    const { rows: purInsert } = await client.query(
      `INSERT INTO purchases (
        shop_id, purchase_no, supplier_id, supplier_invoice_no, supplier_invoice_date,
        purchase_date, subtotal, discount_amount, gst_total, total_amount,
        paid_amount, payment_status, payment_mode, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *`,
      [
        shopId,
        purchaseNo,
        supplierId,
        supplierInvoiceNo.trim(),
        supplierInvoiceDate || purchaseDate,
        purchaseDate,
        subtotal,
        discTotal,
        gstTotal,
        totalAmount,
        numPaid,
        paymentStatus,
        paymentMode,
        notes,
      ]
    );

    const purchase = purInsert[0];

    // 5. Insert Purchase Items & Upsert Batches
    for (const item of items) {
      const qty = parseInt(item.qty) || 1;
      const freeQty = parseInt(item.freeQty) || 0;
      const totalUnits = qty + freeQty;
      const rate = parseFloat(item.purchaseRate) || 0;
      const mrp = parseFloat(item.mrp) || rate * 1.25;
      const sellingPrice = parseFloat(item.sellingPrice) || mrp;
      const gstRate = parseFloat(item.gstRate) || 12;
      const disc = parseFloat(item.discountPercent) || 0;
      const lineTaxable = qty * rate * (1 - disc / 100);
      const lineGst = lineTaxable * (gstRate / 100);
      const lineTotal = lineTaxable + lineGst;

      // Insert item
      await client.query(
        `INSERT INTO purchase_items (
          shop_id, purchase_id, medicine_id, batch_no,
          mfg_date, expiry_date, pack_size, qty, free_qty, purchase_cost,
          mrp, selling_price, gst_rate, discount_percent, gst_amount, total_amount
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )`,
        [
          shopId,
          purchase.id,
          item.medicineId,
          item.batchNo.trim(),
          item.mfgDate || null,
          item.expiryDate,
          parseInt(item.packSize) || 10,
          qty,
          freeQty,
          rate,
          mrp,
          sellingPrice,
          gstRate,
          disc,
          lineGst,
          lineTotal,
        ]
      );

      // Upsert Medicine Batch
      const { rows: batchUpsert } = await client.query(
        `INSERT INTO medicine_batches (
          shop_id, medicine_id, batch_no, mfg_date, expiry_date,
          purchase_cost, mrp, selling_price, current_stock, rack_shelf, is_blocked
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
        ON CONFLICT (medicine_id, batch_no) DO UPDATE SET
          current_stock = medicine_batches.current_stock + EXCLUDED.current_stock,
          purchase_cost = EXCLUDED.purchase_cost,
          mrp = EXCLUDED.mrp,
          selling_price = EXCLUDED.selling_price,
          expiry_date = EXCLUDED.expiry_date,
          updated_at = now()
        RETURNING id`,
        [
          shopId,
          item.medicineId,
          item.batchNo.trim(),
          item.mfgDate || null,
          item.expiryDate,
          rate,
          mrp,
          sellingPrice,
          totalUnits,
          item.rackShelf || '',
        ]
      );

      // Record Stock Movement
      if (batchUpsert.length > 0) {
        await client.query(
          `INSERT INTO stock_movements (
            shop_id, medicine_id, batch_id, movement_type, quantity,
            reference_no, notes
          ) VALUES ($1, $2, $3, 'PURCHASE_INWARD', $4, $5, $6)`,
          [
            shopId,
            item.medicineId,
            batchUpsert[0].id,
            totalUnits,
            purchaseNo,
            `Inward purchase from invoice #${supplierInvoiceNo}`,
          ]
        ).catch(() => {});
      }
    }

    // 6. Update Supplier Balance
    const unpaidAmount = Math.max(0, totalAmount - numPaid);
    if (unpaidAmount > 0) {
      await client.query(
        `UPDATE suppliers SET current_balance = COALESCE(current_balance, 0) + $1, updated_at = now() WHERE id = $2`,
        [unpaidAmount, supplierId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(purchase);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create purchase error:', err);
    res.status(500).json({ error: 'Failed to record purchase invoice: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
