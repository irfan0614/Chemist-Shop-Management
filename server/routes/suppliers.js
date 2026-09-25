const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/suppliers
router.get('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const { search } = req.query;

  try {
    let sql = `
      SELECT s.id, s.shop_id as "shopId", s.name, s.company_name as "companyName",
             s.contact_person as "contactPerson", s.phone, s.alt_phone as "altPhone",
             s.email, s.address, s.city, s.state, s.state_code as "stateCode",
             s.pincode, s.gstin, s.dl_numbers as "dlNumbers",
             s.payment_terms_days as "paymentTermsDays",
             s.credit_limit::float as "creditLimit",
             s.current_balance::float as "currentBalance",
             s.is_active as "isActive",
             COALESCE(SUM(p.total_amount), 0)::float as "totalPurchases",
             COALESCE(SUM(p.paid_amount), 0)::float as "totalPaid",
             COUNT(p.id)::int as "purchaseCount"
      FROM suppliers s
      LEFT JOIN purchases p ON p.supplier_id = s.id AND p.shop_id = s.shop_id
      WHERE ($1::uuid IS NULL OR s.shop_id = $1) AND s.is_active = true
    `;
    const params = [shopId];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(s.name) LIKE $${params.length} OR
        lower(s.company_name) LIKE $${params.length} OR
        s.phone LIKE $${params.length} OR
        lower(s.gstin) LIKE $${params.length}
      )`;
    }

    sql += ` GROUP BY s.id ORDER BY s.name ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get suppliers error:', err);
    res.status(500).json({ error: 'Failed to retrieve suppliers: ' + err.message });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows: sups } = await query(
      `SELECT s.*, s.company_name as "companyName", s.contact_person as "contactPerson",
              s.credit_limit::float as "creditLimit", s.current_balance::float as "currentBalance"
       FROM suppliers s
       WHERE s.id = $1 AND ($2::uuid IS NULL OR s.shop_id = $2)`,
      [req.params.id, shopId]
    );

    if (sups.length === 0) return res.status(404).json({ error: 'Supplier not found' });

    const { rows: purchases } = await query(
      `SELECT id, purchase_no as "purchaseNo", purchase_date as "purchaseDate",
              total_amount::float as "totalAmount", paid_amount::float as "paidAmount",
              payment_status as "paymentStatus", supplier_invoice_no as "supplierInvoiceNo"
       FROM purchases
       WHERE supplier_id = $1 AND ($2::uuid IS NULL OR shop_id = $2)
       ORDER BY purchase_date DESC`,
      [req.params.id, shopId]
    );

    res.json({
      ...sups[0],
      purchases,
    });
  } catch (err) {
    console.error('Get supplier detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve supplier details: ' + err.message });
  }
});

// POST /api/suppliers
router.post('/', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    name,
    companyName,
    contactPerson,
    phone,
    altPhone,
    email,
    address,
    city,
    state,
    pincode,
    gstin,
    dlNumbers,
    paymentTermsDays,
    creditLimit,
  } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Supplier name and phone number are required' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO suppliers (
        shop_id, name, company_name, contact_person, phone, alt_phone,
        email, address, city, state, state_code, pincode, gstin,
        dl_numbers, payment_terms_days, credit_limit, opening_balance,
        current_balance, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, '07', $11, $12,
        $13, $14, $15, 0.0, 0.0, true
      ) RETURNING *`,
      [
        shopId,
        name.trim(),
        companyName ? companyName.trim() : name.trim(),
        contactPerson ? contactPerson.trim() : '',
        phone.trim(),
        altPhone ? altPhone.trim() : '',
        email ? email.trim() : '',
        address ? address.trim() : '',
        city ? city.trim() : 'New Delhi',
        state ? state.trim() : 'Delhi',
        pincode ? pincode.trim() : '',
        gstin ? gstin.trim().toUpperCase() : '',
        dlNumbers ? dlNumbers.trim() : '',
        parseInt(paymentTermsDays) || 30,
        parseFloat(creditLimit) || 100000.0,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create supplier error:', err);
    res.status(500).json({ error: 'Failed to register supplier: ' + err.message });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    name,
    companyName,
    contactPerson,
    phone,
    altPhone,
    email,
    address,
    city,
    state,
    pincode,
    gstin,
    dlNumbers,
    paymentTermsDays,
    creditLimit,
  } = req.body;

  try {
    const { rows } = await query(
      `UPDATE suppliers SET
        name = COALESCE($1, name),
        company_name = COALESCE($2, company_name),
        contact_person = COALESCE($3, contact_person),
        phone = COALESCE($4, phone),
        alt_phone = COALESCE($5, alt_phone),
        email = COALESCE($6, email),
        address = COALESCE($7, address),
        city = COALESCE($8, city),
        state = COALESCE($9, state),
        pincode = COALESCE($10, pincode),
        gstin = COALESCE($11, gstin),
        dl_numbers = COALESCE($12, dl_numbers),
        payment_terms_days = COALESCE($13, payment_terms_days),
        credit_limit = COALESCE($14, credit_limit),
        updated_at = now()
       WHERE id = $15 AND ($16::uuid IS NULL OR shop_id = $16)
       RETURNING *`,
      [
        name ? name.trim() : null,
        companyName ? companyName.trim() : null,
        contactPerson !== undefined ? contactPerson.trim() : null,
        phone ? phone.trim() : null,
        altPhone !== undefined ? altPhone.trim() : null,
        email !== undefined ? email.trim() : null,
        address !== undefined ? address.trim() : null,
        city !== undefined ? city.trim() : null,
        state !== undefined ? state.trim() : null,
        pincode !== undefined ? pincode.trim() : null,
        gstin !== undefined ? gstin.trim().toUpperCase() : null,
        dlNumbers !== undefined ? dlNumbers.trim() : null,
        paymentTermsDays !== undefined ? parseInt(paymentTermsDays) : null,
        creditLimit !== undefined ? parseFloat(creditLimit) : null,
        req.params.id,
        shopId,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update supplier error:', err);
    res.status(500).json({ error: 'Failed to update supplier: ' + err.message });
  }
});

// POST /api/suppliers/:id/pay - Record supplier payment
router.post('/:id/pay', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const { amount, paymentMode = 'NEFT/RTGS', referenceNo, notes } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: supRows } = await client.query(
      `SELECT * FROM suppliers WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)`,
      [req.params.id, shopId]
    );

    if (supRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplier = supRows[0];
    const prevBalance = Number(supplier.current_balance || 0);
    const newBalance = Math.max(0, prevBalance - numAmount);

    await client.query(
      `UPDATE suppliers SET current_balance = $1, updated_at = now() WHERE id = $2`,
      [newBalance, supplier.id]
    );

    // Record Supplier Payment
    await client.query(
      `INSERT INTO supplier_payments (
        shop_id, supplier_id, payment_date, amount, payment_mode, reference_no, notes
      ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)`,
      [shopId, supplier.id, numAmount, paymentMode, referenceNo || '', notes || '']
    ).catch(() => {});

    await client.query('COMMIT');
    res.json({
      message: 'Supplier payment recorded successfully',
      supplierId: supplier.id,
      paidAmount: numAmount,
      updatedBalance: newBalance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Supplier payment error:', err);
    res.status(500).json({ error: 'Failed to record payment: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
