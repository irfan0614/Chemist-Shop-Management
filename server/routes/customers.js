const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/customers
router.get('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const { search, type, hasBalance } = req.query;

  try {
    let sql = `
      SELECT c.id, c.shop_id as "shopId", c.name, c.phone, c.email, c.address,
             c.city, c.state, c.pincode, c.preferred_doctor as "preferredDoctor",
             c.credit_limit::float as "creditLimit", c.current_balance::float as "currentBalance",
             c.customer_type as "customerType", c.discount_percent::float as "discountPercent",
             c.is_active as "isActive",
             COUNT(si.id)::int as "totalPurchases",
             COALESCE(SUM(si.total_amount), 0)::float as "totalSpent"
      FROM customers c
      LEFT JOIN sales_invoices si ON si.customer_id = c.id AND ($1::uuid IS NULL OR si.shop_id = $1)
      WHERE ($1::uuid IS NULL OR c.shop_id = $1) AND c.is_active = true
    `;
    const params = [shopId];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(c.name) LIKE $${params.length} OR
        c.phone LIKE $${params.length} OR
        lower(c.address) LIKE $${params.length}
      )`;
    }

    if (type) {
      params.push(type);
      sql += ` AND c.customer_type = $${params.length}`;
    }

    if (hasBalance === 'true') {
      sql += ` AND c.current_balance > 0`;
    }

    sql += ` GROUP BY c.id ORDER BY c.name ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Failed to retrieve customers: ' + err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows: custs } = await query(
      `SELECT c.*, c.credit_limit::float as "creditLimit", c.current_balance::float as "currentBalance",
              c.discount_percent::float as "discountPercent", c.preferred_doctor as "preferredDoctor",
              c.customer_type as "customerType"
       FROM customers c
       WHERE c.id = $1 AND ($2::uuid IS NULL OR c.shop_id = $2)`,
      [req.params.id, shopId]
    );

    if (custs.length === 0) return res.status(404).json({ error: 'Customer not found' });

    const [billsRes, prescRes] = await Promise.all([
      query(
        `SELECT id, invoice_no, invoice_date, total_amount::float as total_amount, payment_mode
         FROM sales_invoices
         WHERE customer_id = $1 AND ($2::uuid IS NULL OR shop_id = $2)
         ORDER BY invoice_date DESC LIMIT 20`,
        [req.params.id, shopId]
      ),
      query(
        `SELECT id, doctor_name, prescription_date, patient_name
         FROM prescriptions
         WHERE customer_id = $1 AND ($2::uuid IS NULL OR shop_id = $2)
         ORDER BY prescription_date DESC LIMIT 10`,
        [req.params.id, shopId]
      ),
    ]);

    res.json({
      ...custs[0],
      bills: billsRes.rows,
      prescriptions: prescRes.rows,
    });
  } catch (err) {
    console.error('Get customer detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve customer details: ' + err.message });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    name,
    phone,
    email,
    address,
    preferredDoctor,
    creditLimit,
    customerType = 'REGULAR',
    discountPercent,
  } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Customer name and phone are required' });
  }

  try {
    const cleanPhone = phone.trim();
    const { rows: existing } = await query(
      `SELECT id, name FROM customers WHERE shop_id = $1 AND phone = $2 AND is_active = true`,
      [shopId, cleanPhone]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: `Customer with phone ${cleanPhone} already exists (${existing[0].name})` });
    }

    const { rows } = await query(
      `INSERT INTO customers (
        shop_id, name, phone, email, address, city, state, pincode,
        preferred_doctor, credit_limit, opening_balance, current_balance,
        customer_type, discount_percent, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, 'New Delhi', 'Delhi', '',
        $6, $7, 0.0, 0.0,
        $8, $9, true
      ) RETURNING *`,
      [
        shopId,
        name.trim(),
        cleanPhone,
        email ? email.trim() : '',
        address ? address.trim() : '',
        preferredDoctor ? preferredDoctor.trim() : '',
        parseFloat(creditLimit) || 5000.0,
        customerType,
        parseFloat(discountPercent) || 0.0,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: 'Failed to register customer: ' + err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    name,
    phone,
    email,
    address,
    preferredDoctor,
    creditLimit,
    customerType,
    discountPercent,
  } = req.body;

  try {
    const { rows } = await query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        address = COALESCE($4, address),
        preferred_doctor = COALESCE($5, preferred_doctor),
        credit_limit = COALESCE($6, credit_limit),
        customer_type = COALESCE($7, customer_type),
        discount_percent = COALESCE($8, discount_percent),
        updated_at = now()
       WHERE id = $9 AND ($10::uuid IS NULL OR shop_id = $10)
       RETURNING *`,
      [
        name ? name.trim() : null,
        phone ? phone.trim() : null,
        email !== undefined ? email.trim() : null,
        address !== undefined ? address.trim() : null,
        preferredDoctor !== undefined ? preferredDoctor.trim() : null,
        creditLimit !== undefined ? parseFloat(creditLimit) : null,
        customerType || null,
        discountPercent !== undefined ? parseFloat(discountPercent) : null,
        req.params.id,
        shopId,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer: ' + err.message });
  }
});

// POST /api/customers/:id/collect-due
router.post('/:id/collect-due', async (req, res) => {
  const shopId = tenantShopId(req);
  const { amount, paymentMode = 'CASH', referenceNo, notes } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: custRows } = await client.query(
      `SELECT * FROM customers WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)`,
      [req.params.id, shopId]
    );

    if (custRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = custRows[0];
    const prevBalance = Number(customer.current_balance || 0);
    const newBalance = Math.max(0, prevBalance - numAmount);

    await client.query(
      `UPDATE customers SET current_balance = $1, updated_at = now() WHERE id = $2`,
      [newBalance, customer.id]
    );

    // Record Customer Payment
    await client.query(
      `INSERT INTO customer_payments (
        shop_id, customer_id, payment_date, amount, payment_mode, reference_no, notes
      ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)`,
      [shopId, customer.id, numAmount, paymentMode, referenceNo || '', notes || '']
    ).catch(() => {});

    await client.query('COMMIT');
    res.json({
      message: 'Khata payment recorded successfully',
      customerId: customer.id,
      collectedAmount: numAmount,
      updatedBalance: newBalance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Collect due error:', err);
    res.status(500).json({ error: 'Failed to record customer collection: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
