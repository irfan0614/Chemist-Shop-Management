const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/expenses
router.get('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const { startDate, endDate, categoryId } = req.query;

  try {
    let sql = `
      SELECT e.id, e.shop_id as "shopId", e.category_id as "categoryId",
             e.expense_date as "expenseDate", e.title, e.amount::float,
             e.payment_mode as "paymentMode", e.paid_to as "paidTo",
             e.notes, e.created_at,
             ec.name as "categoryName"
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE ($1::uuid IS NULL OR e.shop_id = $1)
    `;
    const params = [shopId];

    if (startDate) {
      params.push(startDate);
      sql += ` AND e.expense_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND e.expense_date <= $${params.length}`;
    }

    if (categoryId) {
      params.push(categoryId);
      sql += ` AND e.category_id = $${params.length}`;
    }

    sql += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ error: 'Failed to retrieve expenses: ' + err.message });
  }
});

// GET /api/expenses/categories
router.get('/categories', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows } = await query(
      `SELECT * FROM expense_categories WHERE ($1::uuid IS NULL OR shop_id = $1 OR shop_id IS NULL) ORDER BY name ASC`,
      [shopId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Get expense categories error:', err);
    res.status(500).json({ error: 'Failed to retrieve expense categories: ' + err.message });
  }
});

// POST /api/expenses/categories
router.post('/categories', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const { name, description = '' } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO expense_categories (shop_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [shopId, name.trim(), description.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create expense category error:', err);
    res.status(500).json({ error: 'Failed to create expense category: ' + err.message });
  }
});

// POST /api/expenses
router.post('/', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const { categoryId, expenseDate, title, amount, paymentMode = 'CASH', paidTo, notes } = req.body;
  const numAmount = parseFloat(amount);

  if (!title || !numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Title and valid amount are required' });
  }

  try {
    // If categoryId is null, pick first or create General
    let catId = categoryId;
    if (!catId) {
      const { rows: firstCat } = await query('SELECT id FROM expense_categories LIMIT 1');
      catId = firstCat[0]?.id || null;
    }

    const todayStr = expenseDate || new Date().toISOString().slice(0, 10);

    const { rows } = await query(
      `INSERT INTO expenses (
        shop_id, category_id, expense_date, title, amount, payment_mode, paid_to, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        shopId,
        catId,
        todayStr,
        title.trim(),
        numAmount,
        paymentMode,
        paidTo ? paidTo.trim() : '',
        notes ? notes.trim() : '',
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Failed to record expense: ' + err.message });
  }
});

// GET /api/expenses/cash-register/status
router.get('/cash-register/status', async (req, res) => {
  const shopId = tenantShopId(req);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { rows: regRows } = await query(
      `SELECT * FROM cash_registers WHERE ($1::uuid IS NULL OR shop_id = $1) AND register_date = CURRENT_DATE LIMIT 1`,
      [shopId]
    );

    if (regRows.length > 0) {
      return res.json(regRows[0]);
    }

    // Compute live summary for today
    const [salesRes, expRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total
         FROM sales_invoices
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND invoice_date = CURRENT_DATE AND payment_mode = 'CASH'`,
        [shopId]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::float as total
         FROM expenses
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND expense_date = CURRENT_DATE AND payment_mode = 'CASH'`,
        [shopId]
      ),
    ]);

    const cashSales = salesRes.rows[0]?.total || 0;
    const cashExpenses = expRes.rows[0]?.total || 0;
    const openingCash = 2000.0;
    const expectedCash = openingCash + cashSales - cashExpenses;

    res.json({
      shop_id: shopId,
      register_date: today,
      status: 'OPEN',
      opening_cash: openingCash,
      cash_sales: cashSales,
      cash_expenses: cashExpenses,
      cash_returns: 0,
      customer_cash_in: 0,
      supplier_cash_out: 0,
      expected_cash: expectedCash,
      actual_closing_cash: null,
      difference: null,
    });
  } catch (err) {
    console.error('Cash register status error:', err);
    res.status(500).json({ error: 'Failed to load cash register: ' + err.message });
  }
});

// POST /api/expenses/cash-register/close
router.post('/cash-register/close', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const { actualCash, notes } = req.body;
  const numActual = parseFloat(actualCash);

  if (isNaN(numActual)) {
    return res.status(400).json({ error: 'Actual physical cash count is required' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const [salesRes, expRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total_amount), 0)::float as total
         FROM sales_invoices
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND invoice_date = CURRENT_DATE AND payment_mode = 'CASH'`,
        [shopId]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0)::float as total
         FROM expenses
         WHERE ($1::uuid IS NULL OR shop_id = $1) AND expense_date = CURRENT_DATE AND payment_mode = 'CASH'`,
        [shopId]
      ),
    ]);

    const cashSales = salesRes.rows[0]?.total || 0;
    const cashExpenses = expRes.rows[0]?.total || 0;
    const openingCash = 2000.0;
    const expectedCash = openingCash + cashSales - cashExpenses;
    const difference = Number((numActual - expectedCash).toFixed(2));

    const { rows } = await query(
      `INSERT INTO cash_registers (
        shop_id, register_date, opening_cash, cash_sales, cash_expenses,
        expected_cash, actual_closing_cash, difference, status, notes
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, 'CLOSED', $8)
      RETURNING *`,
      [
        shopId,
        openingCash,
        cashSales,
        cashExpenses,
        expectedCash,
        numActual,
        difference,
        notes || '',
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('Close cash register error:', err);
    res.status(500).json({ error: 'Failed to close register: ' + err.message });
  }
});

module.exports = router;
