const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// GET /api/suppliers
router.get('/', (req, res) => {
  const shopId = tenantShopId(req);
  const { search } = req.query;
  let list = memStore.suppliers.filter((s) => s.shop_id === shopId && s.is_active !== false);

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.company_name.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        (s.gstin || '').toLowerCase().includes(q)
    );
  }

  // Calculate purchase stats
  const enriched = list.map((s) => {
    const purchases = memStore.purchases.filter((p) => p.shop_id === shopId && p.supplier_id === s.id);
    const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
    const totalPaid = purchases.reduce((sum, p) => sum + (Number(p.paid_amount) || 0), 0);
    const pendingBalance = Math.max(0, totalPurchases - totalPaid);

    return {
      id: s.id,
      shopId: s.shop_id,
      name: s.name,
      companyName: s.company_name,
      contactPerson: s.contact_person,
      phone: s.phone,
      altPhone: s.alt_phone,
      email: s.email,
      address: s.address,
      city: s.city,
      state: s.state,
      stateCode: s.state_code,
      pincode: s.pincode,
      gstin: s.gstin,
      dlNumbers: s.dl_numbers,
      paymentTermsDays: s.payment_terms_days,
      creditLimit: Number(s.credit_limit),
      currentBalance: pendingBalance || Number(s.current_balance),
      totalPurchases,
      purchaseCount: purchases.length,
      isActive: s.is_active,
    };
  });

  res.json(enriched);
});

// GET /api/suppliers/:id
router.get('/:id', (req, res) => {
  const shopId = tenantShopId(req);
  const s = memStore.suppliers.find((sup) => sup.shop_id === shopId && sup.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Supplier not found' });

  const purchases = memStore.purchases.filter((p) => p.shop_id === shopId && p.supplier_id === s.id);
  res.json({
    ...s,
    purchases,
  });
});

// POST /api/suppliers
router.post('/', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'INVENTORY_MGR', 'ACCOUNTANT']), (req, res) => {
  const shopId = tenantShopId(req);
  const { name, companyName, contactPerson, phone, altPhone, email, address, city, state, pincode, gstin, dlNumbers, paymentTermsDays, creditLimit } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Supplier name and phone number are required' });
  }

  const newSupplier = {
    id: `sup-${Date.now()}`,
    shop_id: shopId,
    name: name.trim(),
    company_name: companyName ? companyName.trim() : name.trim(),
    contact_person: (contactPerson || '').trim(),
    phone: phone.trim(),
    alt_phone: (altPhone || '').trim(),
    email: (email || '').trim(),
    address: (address || '').trim(),
    city: (city || 'New Delhi').trim(),
    state: (state || 'Delhi').trim(),
    state_code: '07',
    pincode: (pincode || '').trim(),
    gstin: (gstin || '').trim(),
    dl_numbers: (dlNumbers || '').trim(),
    payment_terms_days: parseInt(paymentTermsDays) || 30,
    credit_limit: parseFloat(creditLimit) || 100000.0,
    opening_balance: 0.0,
    current_balance: 0.0,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memStore.suppliers.push(newSupplier);
  res.status(201).json(newSupplier);
});

// PUT /api/suppliers/:id
router.put('/:id', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'INVENTORY_MGR', 'ACCOUNTANT']), (req, res) => {
  const shopId = tenantShopId(req);
  const s = memStore.suppliers.find((sup) => sup.shop_id === shopId && sup.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Supplier not found' });

  const { name, companyName, contactPerson, phone, altPhone, email, address, city, state, pincode, gstin, dlNumbers, paymentTermsDays, creditLimit } = req.body;

  if (name) s.name = name.trim();
  if (companyName) s.company_name = companyName.trim();
  if (contactPerson !== undefined) s.contact_person = contactPerson.trim();
  if (phone) s.phone = phone.trim();
  if (altPhone !== undefined) s.alt_phone = altPhone.trim();
  if (email !== undefined) s.email = email.trim();
  if (address !== undefined) s.address = address.trim();
  if (city !== undefined) s.city = city.trim();
  if (state !== undefined) s.state = state.trim();
  if (pincode !== undefined) s.pincode = pincode.trim();
  if (gstin !== undefined) s.gstin = gstin.trim();
  if (dlNumbers !== undefined) s.dl_numbers = dlNumbers.trim();
  if (paymentTermsDays !== undefined) s.payment_terms_days = parseInt(paymentTermsDays) || 30;
  if (creditLimit !== undefined) s.credit_limit = parseFloat(creditLimit) || 100000.0;
  s.updated_at = new Date().toISOString();

  res.json(s);
});

// POST /api/suppliers/:id/pay - Record payment to supplier
router.post('/:id/pay', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'ACCOUNTANT']), (req, res) => {
  const shopId = tenantShopId(req);
  const supplier = memStore.suppliers.find((s) => s.shop_id === shopId && s.id === req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const { amount, paymentMode, referenceNo, notes } = req.body;
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  supplier.current_balance = Math.max(0, (Number(supplier.current_balance) || 0) - numAmount);

  // Record audit
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shopId,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'SUPPLIER_PAYMENT',
    entity_type: 'SUPPLIER',
    entity_id: supplier.id,
    new_values: { amount: numAmount, mode: paymentMode, ref: referenceNo },
    created_at: new Date().toISOString(),
  });

  res.json({
    message: 'Supplier payment recorded successfully',
    supplierId: supplier.id,
    paidAmount: numAmount,
    updatedBalance: supplier.current_balance,
  });
});

module.exports = router;
