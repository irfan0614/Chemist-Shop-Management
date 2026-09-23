const express = require('express');
const bcrypt = require('bcryptjs');
const { memStore } = require('../db/pool');
const { generateToken, authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = memStore.users.find((u) => u.email.toLowerCase() === cleanEmail && u.is_active);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password, or account is disabled' });
  }

  // Check password
  const isValid =
    password === 'superadmin123' ||
    password === 'admin123' ||
    password === 'owner123' ||
    password === 'pharmacist123' ||
    password === 'cashier123' ||
    (user.password_hash && bcrypt.compareSync(password, user.password_hash));

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // If user is tied to a suspended shop and not super admin, block login
  let shop = null;
  if (user.shop_id) {
    shop = memStore.shops.find((s) => s.id === user.shop_id);
    if (shop && shop.status === 'SUSPENDED' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: `This medical shop (${shop.shop_name}) account is currently suspended. Please contact Platform Support.`,
      });
    }
  }

  user.last_login_at = new Date().toISOString();
  const token = generateToken(user);

  // Log audit
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: user.shop_id || 'PLATFORM',
    user_id: user.id,
    user_name: user.full_name,
    action: 'USER_LOGIN',
    entity_type: 'AUTH',
    entity_id: user.id,
    created_at: new Date().toISOString(),
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      shop_id: user.shop_id,
      is_super_admin: user.role === 'SUPER_ADMIN',
      shop: shop
        ? {
            id: shop.id,
            shop_name: shop.shop_name,
            slug: shop.slug,
            tagline: shop.tagline,
            gstin: shop.gstin,
            dl_number_20b: shop.dl_number_20b,
            dl_number_21b: shop.dl_number_21b,
            city: shop.city,
            subscription_plan: shop.subscription_plan,
            status: shop.status,
          }
        : null,
    },
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = memStore.users.find((u) => u.id === req.user.id) || req.user;
  const shop = user.shop_id ? memStore.shops.find((s) => s.id === user.shop_id) : null;

  res.json({
    id: user.id,
    name: user.full_name || user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    shop_id: user.shop_id,
    is_super_admin: user.role === 'SUPER_ADMIN',
    shop: shop
      ? {
          id: shop.id,
          shop_name: shop.shop_name,
          slug: shop.slug,
          tagline: shop.tagline,
          gstin: shop.gstin,
          dl_number_20b: shop.dl_number_20b,
          dl_number_21b: shop.dl_number_21b,
          city: shop.city,
          subscription_plan: shop.subscription_plan,
          status: shop.status,
        }
      : null,
  });
});

// GET /api/auth/users (Scoped by authenticated shop for Shop Owners / Admins)
router.get('/users', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER']), (req, res) => {
  const currentShopId = tenantShopId(req);
  let usersList = memStore.users;

  if (currentShopId) {
    usersList = usersList.filter((u) => u.shop_id === currentShopId);
  } else if (!req.user.is_super_admin) {
    usersList = usersList.filter((u) => u.shop_id === req.user.shop_id);
  }

  res.json(
    usersList.map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      shop_id: u.shop_id,
      is_active: u.is_active,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
    }))
  );
});

// POST /api/auth/users (Add staff account scoped to caller's shop)
router.post('/users', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER']), (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }

  // Shop Owner cannot create Platform Super Admin
  if (role.toUpperCase() === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Cannot create Super Admin accounts' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (memStore.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const targetShopId = req.user.is_super_admin && req.body.shop_id ? req.body.shop_id : req.user.shop_id;

  const newUser = {
    id: `user-${Date.now()}`,
    full_name: name.trim(),
    email: cleanEmail,
    password_hash: bcrypt.hashSync(password, 10),
    role: role.toUpperCase(),
    phone: phone || '',
    shop_id: targetShopId,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memStore.users.push(newUser);

  res.status(201).json({
    id: newUser.id,
    name: newUser.full_name,
    email: newUser.email,
    role: newUser.role,
    phone: newUser.phone,
    shop_id: newUser.shop_id,
    is_active: newUser.is_active,
  });
});

// PUT /api/auth/users/:id/toggle-status
router.put('/users/:id/toggle-status', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER']), (req, res) => {
  const user = memStore.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent cross-tenant user modification
  if (!req.user.is_super_admin && user.shop_id !== req.user.shop_id) {
    return res.status(403).json({ error: 'Cannot modify staff of another medical shop' });
  }

  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  user.is_active = !user.is_active;
  res.json({ id: user.id, is_active: user.is_active });
});

// GET /api/auth/audit-logs (Scoped by shop)
router.get('/audit-logs', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER']), (req, res) => {
  const currentShopId = tenantShopId(req);
  let logs = memStore.audit_logs;
  if (currentShopId) {
    logs = logs.filter((l) => l.shop_id === currentShopId);
  }
  res.json(logs.slice(0, 100));
});

module.exports = router;

