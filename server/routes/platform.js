const express = require('express');
const bcrypt = require('bcryptjs');
const { memStore } = require('../db/pool');
const { authMiddleware, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// All platform endpoints require SUPER_ADMIN authentication
router.use(authMiddleware, requireSuperAdmin);

// Safe helper to get sales invoices / bills array
function getBills() {
  return memStore.sales_invoices || memStore.bills || [];
}

// GET /api/platform/stats
router.get('/stats', (req, res) => {
  const shops = memStore.shops || [];
  const users = memStore.users || [];
  const medicines = memStore.medicines || [];
  const batches = memStore.batches || [];
  const bills = getBills();

  const totalShops = shops.length;
  const activeShops = shops.filter((s) => (s.status || 'ACTIVE') === 'ACTIVE').length;
  const suspendedShops = shops.filter((s) => s.status === 'SUSPENDED').length;
  const trialShops = shops.filter((s) => (s.subscription_plan || s.plan) === 'TRIAL').length;

  const totalUsers = users.filter((u) => u.role !== 'SUPER_ADMIN').length;
  const totalMedicines = medicines.length;
  const totalBatches = batches.length;
  const totalBills = bills.length;
  const totalSalesVolume = bills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const totalPlatformSales = totalSalesVolume;

  // Calculate licenses expiring in <= 90 days
  const now = new Date();
  const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const licenseExpiringSoon = shops.filter((s) => {
    const expiryStr = s.dl_expiry_date || s.drug_license_expiry;
    if (!expiryStr) return false;
    const exp = new Date(expiryStr);
    return exp <= ninetyDaysFromNow;
  }).length;

  const planBreakdown = {
    BASIC: shops.filter((s) => (s.subscription_plan || s.plan) === 'BASIC').length,
    PRO: shops.filter((s) => (s.subscription_plan || s.plan) === 'PRO').length,
    ENTERPRISE: shops.filter((s) => (s.subscription_plan || s.plan) === 'ENTERPRISE').length,
    TRIAL: trialShops,
  };

  res.json({
    totalShops,
    activeShops,
    suspendedShops,
    trialShops,
    totalUsers,
    totalMedicines,
    totalBatches,
    totalBills,
    totalSalesVolume,
    totalPlatformSales,
    licenseExpiringSoon,
    planBreakdown,
  });
});

// GET /api/platform/shops
router.get('/shops', (req, res) => {
  const { search, status, plan } = req.query;
  const shops = memStore.shops || [];
  const users = memStore.users || [];
  const medicines = memStore.medicines || [];
  const bills = getBills();

  let list = [...shops];

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (s) =>
        (s.shop_name || s.name || '').toLowerCase().includes(q) ||
        (s.owner_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.gstin || '').toLowerCase().includes(q)
    );
  }

  if (status && status !== 'ALL') {
    list = list.filter((s) => (s.status || 'ACTIVE') === status);
  }

  if (plan && plan !== 'ALL') {
    list = list.filter((s) => (s.subscription_plan || s.plan) === plan);
  }

  const now = new Date();

  // Enrich with staff count, medicine count, sales count, and days until license expiry
  const enriched = list.map((s) => {
    const staffCount = users.filter((u) => u.shop_id === s.id).length;
    const medicineCount = medicines.filter((m) => m.shop_id === s.id).length;
    const shopBills = bills.filter((b) => b.shop_id === s.id);
    const totalInvoices = shopBills.length;
    const totalSales = shopBills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const ownerUser = users.find(
      (u) => u.shop_id === s.id && (u.role === 'SHOP_OWNER' || u.role === 'ADMIN')
    );

    const expiryDateStr = s.dl_expiry_date || s.drug_license_expiry || '2028-12-31';
    let daysUntilLicenseExpiry = null;
    if (expiryDateStr) {
      const exp = new Date(expiryDateStr);
      daysUntilLicenseExpiry = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    const shopName = s.shop_name || s.name || 'Medical Shop';
    const subPlan = s.subscription_plan || s.plan || 'PRO';
    const subExpiry = s.subscription_expires_at || s.subscription_expiry || '2027-12-31';
    const ownerEmail = ownerUser ? ownerUser.email : (s.owner_email || s.email);

    return {
      ...s,
      id: s.id,
      name: shopName,
      shop_name: shopName,
      owner_name: s.owner_name || (ownerUser ? ownerUser.full_name : 'Shop Owner'),
      owner_email: ownerEmail,
      ownerEmail: ownerEmail,
      plan: subPlan,
      subscription_plan: subPlan,
      subscription_expiry: subExpiry,
      subscription_expires_at: subExpiry,
      drug_license_expiry: expiryDateStr,
      dl_expiry_date: expiryDateStr,
      daysUntilLicenseExpiry,
      staffCount: staffCount || 1,
      medicineCount,
      totalInvoices,
      totalSales,
      salesCount: totalInvoices,
    };
  });

  res.json(enriched);
});

// GET /api/platform/shops/:id
router.get('/shops/:id', (req, res) => {
  const shops = memStore.shops || [];
  const users = memStore.users || [];
  const medicines = memStore.medicines || [];
  const bills = getBills();

  const shop = shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const staff = users
    .filter((u) => u.shop_id === shop.id)
    .map((u) => ({
      id: u.id,
      name: u.full_name || u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      is_active: u.is_active,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
    }));

  const totalMedicines = medicines.filter((m) => m.shop_id === shop.id).length;
  const shopBills = bills.filter((b) => b.shop_id === shop.id);
  const totalBills = shopBills.length;
  const totalRevenue = shopBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);

  const normalizedShop = {
    ...shop,
    name: shop.shop_name || shop.name,
    shop_name: shop.shop_name || shop.name,
    plan: shop.subscription_plan || shop.plan || 'PRO',
    subscription_plan: shop.subscription_plan || shop.plan || 'PRO',
    subscription_expiry: shop.subscription_expires_at || shop.subscription_expiry,
    drug_license_expiry: shop.dl_expiry_date || shop.drug_license_expiry,
  };

  res.json({
    shop: normalizedShop,
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
    name,
    shop_name = name,
    tagline = 'Your Trusted Pharmacy & Healthcare Partner',
    owner_name,
    ownerName = owner_name,
    email,
    owner_email = email,
    ownerEmail = owner_email,
    password,
    owner_password = password,
    phone,
    owner_phone = phone,
    alt_phone = '',
    address = '',
    city = 'New Delhi',
    state = 'Delhi',
    state_code = '07',
    pincode = '110001',
    gstin = '',
    dl_number_20b = '',
    dl_number_21b = '',
    fssai_no = '',
    pan_no = '',
    plan = 'PRO',
    subscription_plan = plan,
    subscription_days = 365,
    subscription_expiry,
    drug_license_expiry = '2028-12-31',
    dl_expiry_date = drug_license_expiry,
    thermal_printer_size = '80mm',
  } = req.body;

  const finalShopName = (shop_name || name || '').trim();
  const finalOwnerName = (ownerName || owner_name || '').trim();
  const finalEmail = (ownerEmail || owner_email || email || '').trim().toLowerCase();
  const finalPhone = (owner_phone || phone || '').trim();

  if (!finalShopName || !finalOwnerName || !finalEmail || !finalPhone) {
    return res.status(400).json({
      error: 'Shop Name, Owner Name, Email, and Phone are required.',
    });
  }

  const users = memStore.users || [];
  if (users.some((u) => u.email.toLowerCase() === finalEmail)) {
    return res.status(400).json({
      error: `A user with email ${finalEmail} already exists on the platform. Please use a unique owner email.`,
    });
  }

  const shopId = `shop-${Date.now()}`;
  const slug =
    finalShopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') +
    `-${Math.floor(Math.random() * 1000)}`;
  const ownerPassword = owner_password || password || 'owner123';

  const subExpiresAt =
    subscription_expiry ||
    new Date(Date.now() + 1000 * 60 * 60 * 24 * Number(subscription_days)).toISOString();

  // 1. Create Shop record
  const newShop = {
    id: shopId,
    name: finalShopName,
    shop_name: finalShopName,
    slug,
    tagline: tagline.trim(),
    owner_name: finalOwnerName,
    email: finalEmail,
    owner_email: finalEmail,
    phone: finalPhone,
    alt_phone: alt_phone ? alt_phone.trim() : '',
    address: address ? address.trim() : '',
    city: city ? city.trim() : 'New Delhi',
    state: state ? state.trim() : 'Delhi',
    state_code: state_code ? state_code.trim() : '07',
    pincode: pincode ? pincode.trim() : '110001',
    gstin: gstin ? gstin.trim().toUpperCase() : '',
    dl_number_20b: dl_number_20b ? dl_number_20b.trim() : '',
    dl_number_21b: dl_number_21b ? dl_number_21b.trim() : '',
    fssai_no: fssai_no ? fssai_no.trim() : '',
    pan_no: pan_no ? pan_no.trim().toUpperCase() : '',
    status: 'ACTIVE',
    plan: subscription_plan,
    subscription_plan,
    subscription_expiry: subExpiresAt,
    subscription_expires_at: subExpiresAt,
    drug_license_expiry: dl_expiry_date,
    dl_expiry_date,
    bill_prefix: 'INV',
    bill_counter: 1001,
    purchase_prefix: 'PUR',
    purchase_counter: 101,
    return_prefix: 'SRT',
    return_counter: 1,
    default_low_stock_threshold: 15,
    default_expiry_alert_days: 90,
    thermal_printer_size,
    invoice_terms:
      '1. Goods once sold will not be taken back without original bill. 2. Refrigerated medicines are non-returnable.',
    enable_fefo: true,
    allow_negative_stock: false,
    require_doctor_on_schedule_h: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!memStore.shops) memStore.shops = [];
  memStore.shops.push(newShop);

  // 2. Provision Shop Owner User
  const newOwnerUser = {
    id: `user-${Date.now()}`,
    full_name: `${finalOwnerName} (Owner)`,
    email: finalEmail,
    password_hash: bcrypt.hashSync(ownerPassword, 10),
    role: 'SHOP_OWNER',
    phone: finalPhone,
    shop_id: shopId,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  if (!memStore.users) memStore.users = [];
  memStore.users.push(newOwnerUser);

  // 3. Clone Standard Categories to New Shop
  if (!memStore.categories) memStore.categories = [];
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
  if (!memStore.audit_logs) memStore.audit_logs = [];
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shopId,
    user_id: req.user ? req.user.id : 'superadmin',
    user_name: req.user ? (req.user.name || req.user.full_name) : 'Super Admin',
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
  const shops = memStore.shops || [];
  const shop = shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const {
    name,
    shop_name = name,
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
    plan,
    subscription_plan = plan,
    subscription_expiry,
    subscription_expires_at = subscription_expiry,
    drug_license_expiry,
    dl_expiry_date = drug_license_expiry,
    thermal_printer_size,
    invoice_terms,
  } = req.body;

  if (shop_name || name) {
    shop.name = (shop_name || name).trim();
    shop.shop_name = (shop_name || name).trim();
  }
  if (tagline !== undefined) shop.tagline = tagline.trim();
  if (owner_name) shop.owner_name = owner_name.trim();
  if (email) shop.email = email.trim().toLowerCase();
  if (phone) shop.phone = phone.trim();
  if (alt_phone !== undefined) shop.alt_phone = alt_phone.trim();
  if (address !== undefined) shop.address = address.trim();
  if (city !== undefined) shop.city = city.trim();
  if (state !== undefined) shop.state = state.trim();
  if (state_code !== undefined) shop.state_code = state_code.trim();
  if (pincode !== undefined) shop.pincode = pincode.trim();
  if (gstin !== undefined) shop.gstin = gstin.trim().toUpperCase();
  if (dl_number_20b !== undefined) shop.dl_number_20b = dl_number_20b.trim();
  if (dl_number_21b !== undefined) shop.dl_number_21b = dl_number_21b.trim();
  if (fssai_no !== undefined) shop.fssai_no = fssai_no.trim();
  if (pan_no !== undefined) shop.pan_no = pan_no.trim().toUpperCase();
  if (status) shop.status = status;
  if (subscription_plan || plan) {
    shop.plan = subscription_plan || plan;
    shop.subscription_plan = subscription_plan || plan;
  }
  if (subscription_expires_at || subscription_expiry) {
    shop.subscription_expiry = subscription_expires_at || subscription_expiry;
    shop.subscription_expires_at = subscription_expires_at || subscription_expiry;
  }
  if (dl_expiry_date || drug_license_expiry) {
    shop.drug_license_expiry = dl_expiry_date || drug_license_expiry;
    shop.dl_expiry_date = dl_expiry_date || drug_license_expiry;
  }
  if (thermal_printer_size) shop.thermal_printer_size = thermal_printer_size;
  if (invoice_terms !== undefined) shop.invoice_terms = invoice_terms;

  shop.updated_at = new Date().toISOString();

  res.json(shop);
});

// POST /api/platform/shops/:id/toggle-status
router.post('/shops/:id/toggle-status', (req, res) => {
  const shops = memStore.shops || [];
  const shop = shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  shop.status = (shop.status || 'ACTIVE') === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  shop.updated_at = new Date().toISOString();

  // Also toggle owner and staff accounts if suspended
  const users = memStore.users || [];
  users.forEach((u) => {
    if (u.shop_id === shop.id) {
      u.is_active = shop.status === 'ACTIVE';
    }
  });

  res.json({ id: shop.id, status: shop.status });
});

// POST /api/platform/shops/:id/reset-owner-password
router.post('/shops/:id/reset-owner-password', (req, res) => {
  const shops = memStore.shops || [];
  const shop = shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const passwordCandidate = req.body.newPassword || req.body.new_password || req.body.password;
  if (!passwordCandidate || passwordCandidate.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const users = memStore.users || [];
  const owner = users.find(
    (u) => u.shop_id === shop.id && (u.role === 'SHOP_OWNER' || u.role === 'ADMIN')
  );

  if (!owner) {
    return res.status(404).json({ error: 'Shop owner account not found for this shop' });
  }

  owner.password_hash = bcrypt.hashSync(passwordCandidate, 10);

  res.json({
    message: `Password reset successful for owner account ${owner.email}`,
    email: owner.email,
    owner_email: owner.email,
  });
});

module.exports = router;
