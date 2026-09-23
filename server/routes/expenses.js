const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// GET /api/expenses
router.get('/', (req, res) => {
  const shopId = tenantShopId(req);
  const { startDate, endDate, categoryId } = req.query;
  let list = memStore.expenses.filter((e) => e.shop_id === shopId);

  if (startDate) list = list.filter((e) => e.expense_date >= startDate);
  if (endDate) list = list.filter((e) => e.expense_date <= endDate);
  if (categoryId) list = list.filter((e) => e.category_id === categoryId);

  const enriched = list.map((e) => {
    const cat = memStore.expense_categories.find((c) => c.id === e.category_id);
    return {
      ...e,
      categoryName: cat ? cat.name : 'General',
      amount: Number(e.amount),
    };
  });

  enriched.sort((a, b) => (b.expense_date > a.expense_date ? 1 : -1));
  res.json(enriched);
});

// GET /api/expenses/categories
router.get('/categories', (req, res) => {
  const shopId = tenantShopId(req);
  res.json(memStore.expense_categories.filter((c) => !c.shop_id || c.shop_id === shopId));
});

// POST /api/expenses/categories
router.post('/categories', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'ACCOUNTANT']), (req, res) => {
  const shopId = tenantShopId(req);
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const newCat = {
    id: `ec-${Date.now()}`,
    shop_id: shopId,
    name: name.trim(),
    description: description || '',
  };
  memStore.expense_categories.push(newCat);
  res.status(201).json(newCat);
});

// POST /api/expenses
router.post('/', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'ACCOUNTANT', 'PHARMACIST', 'CASHIER']), (req, res) => {
  const shopId = tenantShopId(req);
  const { categoryId, expenseDate, title, amount, paymentMode = 'CASH', paidTo, notes } = req.body;

  const numAmount = parseFloat(amount);
  if (!title || !numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Title and valid amount are required' });
  }

  const defaultCat = memStore.expense_categories[0]?.id || 'ec-1';
  const newExp = {
    id: `exp-${Date.now()}`,
    shop_id: shopId,
    category_id: categoryId || defaultCat,
    expense_date: expenseDate || new Date().toISOString().slice(0, 10),
    title: title.trim(),
    amount: numAmount,
    payment_mode: paymentMode,
    paid_to: (paidTo || '').trim(),
    notes: (notes || '').trim(),
    created_at: new Date().toISOString(),
  };

  memStore.expenses.unshift(newExp);

  // If cash expense, update cash register
  if (paymentMode === 'CASH') {
    const todayRegister = memStore.cash_registers.find(
      (cr) => cr.shop_id === shopId && cr.register_date === newExp.expense_date && cr.status === 'OPEN'
    );
    if (todayRegister) {
      todayRegister.cash_expenses += numAmount;
      todayRegister.expected_cash -= numAmount;
    }
  }

  res.status(201).json(newExp);
});

// GET /api/expenses/cash-register/status - Today's drawer status
router.get('/cash-register/status', (req, res) => {
  const shopId = tenantShopId(req);
  const today = new Date().toISOString().slice(0, 10);
  let reg = memStore.cash_registers.find((cr) => cr.shop_id === shopId && cr.register_date === today);

  if (!reg) {
    reg = {
      id: `cr-${Date.now()}`,
      shop_id: shopId,
      register_date: today,
      opening_cash: 2000.0,
      cash_sales: 0.0,
      cash_returns: 0.0,
      cash_expenses: 0.0,
      customer_cash_in: 0.0,
      supplier_cash_out: 0.0,
      expected_cash: 2000.0,
      closing_cash: null,
      cash_difference: null,
      status: 'OPEN',
      notes: '',
      opened_at: new Date().toISOString(),
    };
    memStore.cash_registers.push(reg);
  }

  res.json(reg);
});

// POST /api/expenses/cash-register/close - End-of-Day Cash Drawer Reconciliation
router.post('/cash-register/close', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'CASHIER']), (req, res) => {
  const shopId = tenantShopId(req);
  const today = new Date().toISOString().slice(0, 10);
  const reg = memStore.cash_registers.find((cr) => cr.shop_id === shopId && cr.register_date === today);
  if (!reg) return res.status(404).json({ error: 'No cash register found for today' });

  const { countedClosingCash, notes } = req.body;
  const counted = parseFloat(countedClosingCash);

  if (counted === undefined || isNaN(counted) || counted < 0) {
    return res.status(400).json({ error: 'Physical counted cash amount is required' });
  }

  reg.closing_cash = counted;
  reg.cash_difference = Number((counted - reg.expected_cash).toFixed(2));
  reg.status = 'CLOSED';
  reg.closed_at = new Date().toISOString();
  reg.notes = notes || '';

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shopId,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'CASH_DRAWER_CLOSE',
    entity_type: 'CASH_REGISTER',
    entity_id: reg.id,
    new_values: { expected: reg.expected_cash, counted, difference: reg.cash_difference },
    created_at: new Date().toISOString(),
  });

  res.json(reg);
});

module.exports = router;
