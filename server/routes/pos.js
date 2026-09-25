const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// In-memory parking queue for active counter sessions
const heldBillsMap = {};

// GET /api/pos/bills - Sales history scoped to tenant shop
router.get('/bills', async (req, res) => {
  const currentShopId = tenantShopId(req);
  const { search, startDate, endDate, customerId, paymentMode } = req.query;

  try {
    let sql = `
      SELECT id, invoice_no, invoice_date, customer_id, customer_name, customer_phone,
             doctor_name, doctor_reg_no, subtotal::float, discount_amount::float as discount_amount,
             gst_total::float as gst_total, round_off::float, total_amount::float,
             payment_mode, payment_status, payment_details, (status = 'CANCELLED') as is_cancelled, status, created_at
      FROM sales_invoices
      WHERE ($1::uuid IS NULL OR shop_id = $1)
    `;
    const params = [currentShopId];

    if (startDate) {
      params.push(startDate);
      sql += ` AND invoice_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND invoice_date <= $${params.length}`;
    }

    if (customerId) {
      params.push(customerId);
      sql += ` AND customer_id = $${params.length}`;
    }

    if (paymentMode && paymentMode !== 'ALL') {
      params.push(paymentMode);
      sql += ` AND payment_mode = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(invoice_no) LIKE $${params.length} OR
        lower(customer_name) LIKE $${params.length} OR
        customer_phone LIKE $${params.length} OR
        lower(doctor_name) LIKE $${params.length}
      )`;
    }

    sql += ` ORDER BY created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get bills error:', err);
    res.status(500).json({ error: 'Failed to retrieve sales history: ' + err.message });
  }
});

// GET /api/pos/bills/:id - Bill detail for thermal/A4 printing
router.get('/bills/:id', async (req, res) => {
  const currentShopId = tenantShopId(req);
  try {
    const { rows: bills } = await query(
      `SELECT * FROM sales_invoices
       WHERE (id::text = $1 OR invoice_no = $1) AND ($2::uuid IS NULL OR shop_id = $2)`,
      [req.params.id, currentShopId]
    );

    if (bills.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const bill = bills[0];
    const { rows: items } = await query(
      `SELECT id, medicine_id as "medicineId", medicine_name as "medicineName",
              batch_id as "batchId", batch_no as "batchNo", expiry_date as "expiryDate",
              qty, mrp::float, unit_price::float as "sellingPrice",
              unit_price::float as "unitPrice", gst_rate::float as "gstRate",
              discount_percent::float as "discountPercent", (total_amount - gst_amount)::float as "taxableAmount",
              gst_amount::float as "gstAmount", total_amount::float as "lineTotal"
       FROM sales_invoice_items
       WHERE invoice_id = $1
       ORDER BY id ASC`,
      [bill.id]
    );

    res.json({
      ...bill,
      items,
    });
  } catch (err) {
    console.error('Get bill detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve invoice details: ' + err.message });
  }
});

// POST /api/pos/check-drug-safety
router.post('/check-drug-safety', async (req, res) => {
  const currentShopId = tenantShopId(req);
  const { items } = req.body;
  if (!Array.isArray(items) || items.length < 2) {
    return res.json({ warnings: [] });
  }

  try {
    const medIds = items.map((i) => i.medicineId).filter(Boolean);
    const { rows: meds } = await query(
      `SELECT id, name, salt_composition FROM medicines WHERE id = ANY($1::uuid[]) AND ($2::uuid IS NULL OR shop_id = $2)`,
      [medIds, currentShopId]
    );

    const warnings = [];
    const saltMap = {};

    meds.forEach((med) => {
      if (med.salt_composition) {
        const primarySalt = med.salt_composition.split('+')[0].trim().toLowerCase().replace(/[0-9mg\s]/g, '');
        if (primarySalt.length > 2) {
          if (!saltMap[primarySalt]) saltMap[primarySalt] = [];
          saltMap[primarySalt].push(med.name);
        }
      }
    });

    Object.entries(saltMap).forEach(([salt, medNames]) => {
      if (medNames.length > 1) {
        warnings.push({
          type: 'DUPLICATE_SALT',
          message: `Duplicate active molecule detected: "${medNames.join('" & "')}" both contain ${salt.toUpperCase()}. Verify prescription to prevent accidental overdose.`,
          medicines: medNames,
        });
      }
    });

    res.json({ warnings });
  } catch (err) {
    console.error('Safety check error:', err);
    res.json({ warnings: [] });
  }
});

// POST /api/pos/checkout - Atomic POS Billing
router.post('/checkout', async (req, res) => {
  const currentShopId = tenantShopId(req);
  const {
    customerId = '00000000-0000-0000-0000-000000000099',
    customerName = 'Walk-in Customer',
    customerPhone = '',
    doctorName = '',
    doctorRegNo = '',
    items, // [{ medicineId, batchId, qty, discountPercent }]
    billDiscount = 0,
    paymentMode = 'CASH',
    paymentDetails = {},
    notes = '',
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one medicine item is required in cart' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    // 1. Get Shop Counter and generate Invoice No
    let billCounter = 1001;
    let billPrefix = 'INV';
    if (currentShopId) {
      const { rows: shopRows } = await client.query(
        `UPDATE shops SET bill_counter = COALESCE(bill_counter, 1000) + 1 WHERE id = $1 RETURNING bill_counter, bill_prefix`,
        [currentShopId]
      );
      if (shopRows.length > 0) {
        billCounter = shopRows[0].bill_counter;
        billPrefix = shopRows[0].bill_prefix || 'INV';
      }
    }
    const invoiceNo = `${billPrefix}-${String(billCounter).padStart(4, '0')}`;

    // 2. Fetch and Validate all Batches & Medicines
    let subtotal = 0;
    let taxAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const { rows: batchRows } = await client.query(
        `SELECT b.*, m.name as medicine_name, m.schedule_type, m.gst_rate
         FROM medicine_batches b
         JOIN medicines m ON b.medicine_id = m.id
         WHERE b.id = $1 AND ($2::uuid IS NULL OR b.shop_id = $2)`,
        [item.batchId, currentShopId]
      );

      if (batchRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Batch not found for item ${item.medicineId}` });
      }

      const batch = batchRows[0];
      const reqQty = parseInt(item.qty) || 1;

      if (batch.is_blocked) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Batch #${batch.batch_no} of ${batch.medicine_name} is locked/blocked.` });
      }

      if (Number(batch.current_stock) < reqQty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for ${batch.medicine_name} (Batch #${batch.batch_no}). Available: ${batch.current_stock}, Requested: ${reqQty}`,
        });
      }

      const rate = Number(batch.selling_price) || Number(batch.mrp) || 0;
      const mrp = Number(batch.mrp) || rate;
      const discPercent = parseFloat(item.discountPercent) || 0;
      const gstRate = Number(batch.gst_rate) || 12.0;

      const gross = reqQty * rate;
      const discAmt = gross * (discPercent / 100);
      const taxable = gross - discAmt;
      const gstAmt = taxable * (gstRate / 100);
      const lineTotal = taxable + gstAmt;

      subtotal += taxable;
      taxAmount += gstAmt;

      processedItems.push({
        medicineId: batch.medicine_id,
        medicineName: batch.medicine_name,
        batchId: batch.id,
        batchNo: batch.batch_no,
        expiryDate: batch.expiry_date,
        qty: reqQty,
        mrp,
        sellingPrice: rate,
        unitPrice: rate,
        gstRate,
        discountPercent: discPercent,
        taxableAmount: taxable,
        gstAmount: gstAmt,
        lineTotal,
        scheduleType: batch.schedule_type || 'NONE',
      });
    }

    const billDiscAmt = parseFloat(billDiscount) || 0;
    const netPayable = Math.max(0, subtotal + taxAmount - billDiscAmt);
    const grandTotal = Math.round(netPayable);
    const roundOff = Number((grandTotal - netPayable).toFixed(2));

    // 3. Insert Invoice
    const todayStr = new Date().toISOString().slice(0, 10);
    const finalCustId = customerId && customerId.startsWith('cust-') ? null : (customerId || null);

    const { rows: invRows } = await client.query(
      `INSERT INTO sales_invoices (
        shop_id, invoice_no, customer_id, customer_name, customer_phone,
        doctor_name, doctor_reg_no, invoice_date, subtotal, discount_amount,
        gst_total, round_off, total_amount, payment_mode, payment_status,
        payment_details, notes, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, 'PAID',
        $15, $16, 'COMPLETED'
      ) RETURNING *`,
      [
        currentShopId,
        invoiceNo,
        finalCustId,
        (customerName || 'Walk-in Customer').trim(),
        (customerPhone || '').trim(),
        (doctorName || '').trim(),
        (doctorRegNo || '').trim(),
        todayStr,
        subtotal,
        billDiscAmt,
        taxAmount,
        roundOff,
        grandTotal,
        paymentMode,
        JSON.stringify(paymentDetails),
        notes,
      ]
    );

    const invoice = invRows[0];

    // 4. Insert Invoice Items & Decrement Stock
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sales_invoice_items (
          shop_id, invoice_id, medicine_id, medicine_name, batch_id,
          batch_no, expiry_date, qty, mrp, unit_price,
          gst_rate, discount_percent, gst_amount, cgst_amount, sgst_amount, total_amount
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16
        )`,
        [
          currentShopId,
          invoice.id,
          item.medicineId,
          item.medicineName,
          item.batchId,
          item.batchNo,
          item.expiryDate,
          item.qty,
          item.mrp,
          item.unitPrice,
          item.gstRate,
          item.discountPercent,
          item.gstAmount,
          item.gstAmount / 2,
          item.gstAmount / 2,
          item.lineTotal,
        ]
      );

      // Decrement Batch Stock
      await client.query(
        `UPDATE medicine_batches SET current_stock = current_stock - $1, updated_at = now() WHERE id = $2`,
        [item.qty, item.batchId]
      );

      // Record Stock Movement
      await client.query(
        `INSERT INTO stock_movements (
          shop_id, medicine_id, batch_id, movement_type, quantity, reference_no, notes
        ) VALUES ($1, $2, $3, 'SALE_DISPENSE', $4, $5, $6)`,
        [currentShopId, item.medicineId, item.batchId, -item.qty, invoiceNo, `POS Counter Sale to ${customerName}`]
      ).catch(() => {});
    }

    // 5. Update Customer Khata balance if CREDIT sale
    if (paymentMode === 'CREDIT' && finalCustId) {
      await client.query(
        `UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1, updated_at = now() WHERE id = $2`,
        [grandTotal, finalCustId]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...invoice,
      items: processedItems,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to finalize transaction: ' + err.message });
  } finally {
    client.release();
  }
});

// Parked / Held Bills Queue (Session Memory per Shop)
router.get('/held', (req, res) => {
  const shopId = tenantShopId(req) || 'DEFAULT';
  res.json(heldBillsMap[shopId] || []);
});

router.post('/hold', (req, res) => {
  const shopId = tenantShopId(req) || 'DEFAULT';
  if (!heldBillsMap[shopId]) heldBillsMap[shopId] = [];
  const heldBill = {
    id: `held-${Date.now()}`,
    ...req.body,
    heldAt: new Date().toISOString(),
  };
  heldBillsMap[shopId].push(heldBill);
  res.json(heldBill);
});

router.delete('/held/:id', (req, res) => {
  const shopId = tenantShopId(req) || 'DEFAULT';
  if (!heldBillsMap[shopId]) heldBillsMap[shopId] = [];
  const idx = heldBillsMap[shopId].findIndex((h) => h.id === req.params.id);
  if (idx !== -1) {
    const [resumed] = heldBillsMap[shopId].splice(idx, 1);
    return res.json(resumed);
  }
  res.status(404).json({ error: 'Parked bill not found' });
});

module.exports = router;
