const express = require('express');
const bcrypt = require('bcryptjs');
const { memStore } = require('../db/pool');
const { authMiddleware, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// All platform endpoints require SUPER_ADMIN authentication
router.use(authMiddleware, requireSuperAdmin);

// GET /api/platform/stats
router.get('/stats', (req, res) => {
  const totalShops = memStore.shops.length;
  const activeShops = memStore.shops.filter((s) => s.status === 'ACTIVE').length;
  const suspendedShops = memStore.shops.filter((s) => s.status === 'SUSPENDED').length;
  const trialShops = memStore.shops.filter((s) => s.status === 'TRIAL').length;

  const totalUsers = memStore.users.filter((u) => u.role !== 'SUPER_ADMIN').length;
  const totalMedicines = memStore.medicines.length;
  const totalBatches = memStore.batches.length;
  const totalSalesVolume = memStore.bills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

  const planBreakdown = {
    BASIC: memStore.shops.filter((s) => s.subscription_plan === 'BASIC').length,
    PRO: memStore.shops.filter((s) => s.subscription_plan === 'PRO').length,
    ENTERPRISE: memStore.shops.filter((s) => s.subscription_plan === 'ENTERPRISE').length,
  };

  res.json({
    totalShops,
    activeShops,
    suspendedShops,
    trialShops,
    totalUsers,
    totalMedicines,
    totalBatches,
    totalSalesVolume,
    planBreakdown,
  });
});

// GET /api/platform/shops
router.get('/shops', (req, res) => {
  const { search, status, plan } = req.query;
  let list = [...memStore.shops];

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.shop_name.toLowerCase().includes(q) ||
        s.owner_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.gstin || '').toLowerCase().includes(q)
    );
  }

  if (status && status !== 'ALL') {
    list = list.filter((s) => s.status === status);
  }

  if (plan && plan !== 'ALL') {
    list = list.filter((s) => s.subscription_plan === plan);
  }

  // Enrich with staff count and medicine count
  const enriched = list.map((s) => {
    const staffCount = memStore.users.filter((u) => u.shop_id === s.id).length;
    const medicineCount = memStore.medicines.filter((m) => m.shop_id === s.id).length;
    const salesCount = memStore.bills.filter((b) => b.shop_id === s.id).length;
    const ownerUser = memStore.users.find((u) => u.shop_id === s.id && (u.role === 'SHOP_OWNER' || u.role === 'ADMIN'));

    return {
      ...s,
      staffCount,
      medicineCount,
      salesCount,
      ownerEmail: ownerUser ? ownerUser.email : s.email,
    };
  });

  res.json(enriched);
});

// GET /api/platform/shops/:id
router.get('/shops/:id', (req, res) => {
  const shop = memStore.shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const staff = memStore.users
    .filter((u) => u.shop_id === shop.id)
    .map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      is_active: u.is_active,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
    }));

  const totalMedicines = memStore.medicines.filter((m) => m.shop_id === shop.id).length;
  const totalBills = memStore.bills.filter((b) => b.shop_id === shop.id).length;
  const totalRevenue = memStore.bills
    .filter((b) => b.shop_id === shop.id)
    .reduce((s, b) => s + Number(b.total_amount || 0), 0);

  res.json({
    shop,
    staff,
    stats: {
      totalMedicines,
      totalBills,
      totalRevenue,
    },
  });
});

// POST /api/platform/shops (Register new medical shop + owner account)
router.post('/shops', (req, res) => {
  const {
    shop_name,
    tagline,
    owner_name,
    email,
    password,
    phone,
    alt_phone,
    address,
    city,
    state,
    state_code,
    pincode,
    gstin,
    dl_number_20b,
    dl_number_21b,
    fssai_no,
    pan_no,
    subscription_plan = 'PRO',
    subscription_days = 365,
    thermal_printer_size = '80mm',
  } = req.body;

  if (!shop_name || !owner_name || !email || !phone || !address || !city || !pincode) {
    return res.status(400).json({
      error: 'Shop Name, Owner Name, Email, Phone, Address, City, and Pincode are required.',
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (memStore.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({
      error: `A user with email ${cleanEmail} already exists on the platform. Please use a unique owner email.`,
    });
  }

  const shopId = `shop-${Date.now()}`;
  const slug = shop_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + `-${Math.floor(Math.random() * 1000)}`;
  const ownerPassword = password || 'owner123';

  // 1. Create Shop record
  const newShop = {
    id: shopId,
    shop_name: shop_name.trim(),
    slug,
    tagline: tagline ? tagline.trim() : 'Your Trusted Pharmacy & Healthcare Partner',
    owner_name: owner_name.trim(),
    email: cleanEmail,
    phone: phone.trim(),
    alt_phone: alt_phone ? alt_phone.trim() : '',
    address: address.trim(),
    city: city.trim(),
    state: state ? state.trim() : 'Delhi',
    state_code: state_code ? state_code.trim() : '07',
    pincode: pincode.trim(),
    gstin: gstin ? gstin.trim().toUpperCase() : '',
    dl_number_20b: dl_number_20b ? dl_number_20b.trim() : '',
    dl_number_21b: dl_number_21b ? dl_number_21b.trim() : '',
    fssai_no: fssai_no ? fssai_no.trim() : '',
    pan_no: pan_no ? pan_no.trim().toUpperCase() : '',
    status: 'ACTIVE',
    subscription_plan,
    subscription_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * Number(subscription_days)).toISOString(),
    dl_expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 3).toISOString().slice(0, 10),
    bill_prefix: 'INV',
    bill_counter: 1001,
    purchase_prefix: 'PUR',
    purchase_counter: 101,
    return_prefix: 'SRT',
    return_counter: 1,
    default_low_stock_threshold: 15,
    default_expiry_alert_days: 90,
    thermal_printer_size,
    invoice_terms: '1. Goods once sold will not be taken back without original bill. 2. Refrigerated medicines are non-returnable.',
    enable_fefo: true,
    allow_negative_stock: false,
    require_doctor_on_schedule_h: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memStore.shops.push(newShop);

  // 2. Provision Shop Owner User
  const newOwnerUser = {
    id: `user-${Date.now()}`,
    full_name: `${owner_name.trim()} (Owner)`,
    email: cleanEmail,
    password_hash: bcrypt.hashSync(ownerPassword, 10),
    role: 'SHOP_OWNER',
    phone: phone.trim(),
    shop_id: shopId,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memStore.users.push(newOwnerUser);

  // 3. Clone Standard Categories to New Shop
  const standardCategories = [
    { name: 'Antibiotics & Anti-Infectives', description: 'Antibacterial, Antiviral drugs' },
    { name: 'Pain Relief & Analgesics', description: 'NSAIDs, Paracetamol, Antispasmodics' },
    { name: 'Cardiovascular & Hypertension', description: 'Blood pressure, Statins' },
    { name: 'Diabetes Care', description: 'Oral Hypoglycemics, Insulin' },
    { name: 'Gastrointestinal & Antacids', description: 'PPIs, Antacids, Laxatives' },
    { name: 'Vitamins & Supplements', description: 'Multivitamins, Minerals, Calcium' },
  ];

  standardCategories.forEach((sc, idx) => {
    memStore.categories.push({
      id: `cat-${shopId}-${idx + 1}`,
      shop_id: shopId,
      name: sc.name,
      description: sc.description,
    });
  });

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shopId,
    user_id: req.user.id,
    user_name: req.user.name,
    action: 'REGISTER_SHOP',
    entity_type: 'PLATFORM',
    entity_id: shopId,
    created_at: new Date().toISOString(),
  });

  res.status(201).json({
    shop: newShop,
    owner: {
      id: newOwnerUser.id,
      name: newOwnerUser.full_name,
      email: newOwnerUser.email,
      role: newOwnerUser.role,
      tempPassword: ownerPassword,
    },
  });
});

// PUT /api/platform/shops/:id (Edit shop profile or subscription)
router.put('/shops/:id', (req, res) => {
  const shop = memStore.shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const {
    shop_name,
    tagline,
    owner_name,
    email,
    phone,
    alt_phone,
    address,
    city,
    state,
    state_code,
    pincode,
    gstin,
    dl_number_20b,
    dl_number_21b,
    fssai_no,
    pan_no,
    status,
    subscription_plan,
    subscription_expires_at,
    dl_expiry_date,
    thermal_printer_size,
    invoice_terms,
  } = req.body;

  if (shop_name) shop.shop_name = shop_name.trim();
  if (tagline !== undefined) shop.tagline = tagline.trim();
  if (owner_name) shop.owner_name = owner_name.trim();
  if (email) shop.email = email.trim().toLowerCase();
  if (phone) shop.phone = phone.trim();
  if (alt_phone !== undefined) shop.alt_phone = alt_phone.trim();
  if (address) shop.address = address.trim();
  if (city) shop.city = city.trim();
  if (state) shop.state = state.trim();
  if (state_code) shop.state_code = state_code.trim();
  if (pincode) shop.pincode = pincode.trim();
  if (gstin !== undefined) shop.gstin = gstin.trim().toUpperCase();
  if (dl_number_20b !== undefined) shop.dl_number_20b = dl_number_20b.trim();
  if (dl_number_21b !== undefined) shop.dl_number_21b = dl_number_21b.trim();
  if (fssai_no !== undefined) shop.fssai_no = fssai_no.trim();
  if (pan_no !== undefined) shop.pan_no = pan_no.trim().toUpperCase();
  if (status) shop.status = status;
  if (subscription_plan) shop.subscription_plan = subscription_plan;
  if (subscription_expires_at) shop.subscription_expires_at = subscription_expires_at;
  if (dl_expiry_date) shop.dl_expiry_date = dl_expiry_date;
  if (thermal_printer_size) shop.thermal_printer_size = thermal_printer_size;
  if (invoice_terms !== undefined) shop.invoice_terms = invoice_terms;

  shop.updated_at = new Date().toISOString();

  res.json(shop);
});

// POST /api/platform/shops/:id/toggle-status
router.post('/shops/:id/toggle-status', (req, res) => {
  const shop = memStore.shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  shop.status = shop.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  shop.updated_at = new Date().toISOString();

  // Also toggle owner accounts if suspended
  memStore.users.forEach((u) => {
    if (u.shop_id === shop.id) {
      u.is_active = shop.status === 'ACTIVE';
    }
  });

  res.json({ id: shop.id, status: shop.status });
});

// POST /api/platform/shops/:id/reset-owner-password
router.post('/shops/:id/reset-owner-password', (req, res) => {
  const shop = memStore.shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const owner = memStore.users.find(
    (u) => u.shop_id === shop.id && (u.role === 'SHOP_OWNER' || u.role === 'ADMIN')
  );

  if (!owner) {
    return res.status(404).json({ error: 'Shop owner account not found for this shop' });
  }

  owner.password_hash = bcrypt.hashSync(newPassword, 10);

  res.json({
    message: `Password reset successful for owner account ${owner.email}`,
    email: owner.email,
  });
});

module.exports = router;
