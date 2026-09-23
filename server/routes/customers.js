const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/customers
router.get('/', (req, res) => {
  const { search, type, hasBalance } = req.query;
  let list = memStore.customers.filter((c) => c.is_active !== false);

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.address || '').toLowerCase().includes(q)
    );
  }

  if (type) list = list.filter((c) => c.customer_type === type);
  if (hasBalance === 'true') list = list.filter((c) => Number(c.current_balance) > 0);

  const enriched = list.map((c) => {
    const bills = memStore.sales_invoices.filter((b) => b.customer_id === c.id);
    const totalSpent = bills.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
      preferredDoctor: c.preferred_doctor,
      creditLimit: Number(c.credit_limit),
      currentBalance: Number(c.current_balance),
      customerType: c.customer_type,
      discountPercent: Number(c.discount_percent),
      totalPurchases: bills.length,
      totalSpent,
      isActive: c.is_active,
    };
  });

  res.json(enriched);
});

// GET /api/customers/:id
router.get('/:id', (req, res) => {
  const c = memStore.customers.find((cust) => cust.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });

  const bills = memStore.sales_invoices.filter((b) => b.customer_id === c.id);
  const prescriptions = memStore.prescriptions.filter((p) => p.customer_id === c.id);

  res.json({
    ...c,
    bills,
    prescriptions,
  });
});

// POST /api/customers
router.post('/', authMiddleware, (req, res) => {
  const { name, phone, email, address, preferredDoctor, creditLimit, customerType, discountPercent } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Customer name and phone are required' });
  }

  const existing = memStore.customers.find((c) => c.phone === phone.trim() && c.id !== 'cust-walkin');
  if (existing) {
    return res.status(400).json({ error: `Customer with phone ${phone} already exists (${existing.name})` });
  }

  const newCust = {
    id: `cust-${Date.now()}`,
    name: name.trim(),
    phone: phone.trim(),
    email: (email || '').trim(),
    address: (address || '').trim(),
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '',
    preferred_doctor: (preferredDoctor || '').trim(),
    credit_limit: parseFloat(creditLimit) || 5000.0,
    opening_balance: 0.0,
    current_balance: 0.0,
    customer_type: customerType || 'REGULAR',
    discount_percent: parseFloat(discountPercent) || 0.0,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memStore.customers.push(newCust);
  res.status(201).json(newCust);
});

// PUT /api/customers/:id
router.put('/:id', authMiddleware, (req, res) => {
  const c = memStore.customers.find((cust) => cust.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });

  const { name, phone, email, address, preferredDoctor, creditLimit, customerType, discountPercent } = req.body;

  if (name) c.name = name.trim();
  if (phone) c.phone = phone.trim();
  if (email !== undefined) c.email = email.trim();
  if (address !== undefined) c.address = address.trim();
  if (preferredDoctor !== undefined) c.preferred_doctor = preferredDoctor.trim();
  if (creditLimit !== undefined) c.credit_limit = parseFloat(creditLimit) || 0;
  if (customerType !== undefined) c.customer_type = customerType;
  if (discountPercent !== undefined) c.discount_percent = parseFloat(discountPercent) || 0;
  c.updated_at = new Date().toISOString();

  res.json(c);
});

// POST /api/customers/:id/collect-payment - Collect outstanding Khata balance
router.post('/:id/collect-payment', authMiddleware, (req, res) => {
  const customer = memStore.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { amount, paymentMode = 'CASH', referenceNo, notes } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  const previousBalance = Number(customer.current_balance) || 0;
  customer.current_balance = Math.max(0, previousBalance - numAmount);

  // If cash, update drawer
  if (paymentMode === 'CASH') {
    const todayRegister = memStore.cash_registers.find(
      (cr) => cr.register_date === new Date().toISOString().slice(0, 10) && cr.status === 'OPEN'
    );
    if (todayRegister) {
      todayRegister.customer_cash_in += numAmount;
      todayRegister.expected_cash += numAmount;
    }
  }

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'CUSTOMER_PAYMENT',
    entity_type: 'CUSTOMER',
    entity_id: customer.id,
    new_values: { amount: numAmount, mode: paymentMode, customer: customer.name, remainingDue: customer.current_balance },
    created_at: new Date().toISOString(),
  });

  res.json({
    message: 'Payment recorded successfully',
    customerId: customer.id,
    amountReceived: numAmount,
    previousBalance,
    newBalance: customer.current_balance,
  });
});

module.exports = router;
