const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { generateToken, authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/login - Strict database authentication
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const { rows: users } = await query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.phone, u.shop_id, u.is_active,
              s.id as s_id, s.shop_name, s.slug, s.tagline, s.gstin, s.dl_number_20b, s.dl_number_21b,
              s.city, s.subscription_plan, s.status as shop_status
       FROM users u
       LEFT JOIN shops s ON u.shop_id = s.id
       WHERE lower(u.email) = $1`,
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been disabled. Please contact administrator.' });
    }

    // Check password against bcrypt hash in database
    const isValid = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check shop suspension
    if (user.shop_id && user.shop_status === 'SUSPENDED' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: `This medical shop (${user.shop_name}) account is currently suspended. Please contact Platform Support.`,
      });
    }

    // Update last login timestamp in DB
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    const token = generateToken(user);

    // Audit log
    await query(
      `INSERT INTO audit_logs (shop_id, user_id, user_name, action, entity_type, entity_id)
       VALUES ($1, $2, $3, 'USER_LOGIN', 'AUTH', $4)`,
      [user.shop_id || null, user.id, user.full_name, user.id]
    ).catch(() => {});

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
        is_shop_owner: user.role === 'SHOP_OWNER' || user.role === 'ADMIN',
        shop: user.shop_id
          ? {
              id: user.s_id,
              shop_name: user.shop_name,
              slug: user.slug,
              tagline: user.tagline,
              gstin: user.gstin,
              dl_number_20b: user.dl_number_20b,
              dl_number_21b: user.dl_number_21b,
              city: user.city,
              subscription_plan: user.subscription_plan,
              status: user.shop_status,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication service error: ' + err.message });
  }
});

// GET /api/auth/me - Read from DB
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.role, u.phone, u.shop_id, u.is_active,
              s.id as s_id, s.shop_name, s.slug, s.tagline, s.gstin, s.dl_number_20b, s.dl_number_21b,
              s.city, s.subscription_plan, s.status as shop_status
       FROM users u
       LEFT JOIN shops s ON u.shop_id = s.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const user = rows[0];
    res.json({
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      shop_id: user.shop_id,
      is_super_admin: user.role === 'SUPER_ADMIN',
      is_shop_owner: user.role === 'SHOP_OWNER' || user.role === 'ADMIN',
      shop: user.shop_id
        ? {
            id: user.s_id,
            shop_name: user.shop_name,
            slug: user.slug,
            tagline: user.tagline,
            gstin: user.gstin,
            dl_number_20b: user.dl_number_20b,
            dl_number_21b: user.dl_number_21b,
            city: user.city,
            subscription_plan: user.subscription_plan,
            status: user.shop_status,
          }
        : null,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Failed to retrieve profile: ' + err.message });
  }
});

// GET /api/auth/users
router.get('/users', authMiddleware, requireRole(['SHOP_OWNER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    let sql = `SELECT id, full_name as name, email, role, phone, shop_id, is_active, created_at, last_login_at FROM users`;
    const params = [];

    if (currentShopId) {
      sql += ` WHERE shop_id = $1`;
      params.push(currentShopId);
    } else if (!req.user.is_super_admin) {
      sql += ` WHERE shop_id = $1`;
      params.push(req.user.shop_id);
    }

    sql += ` ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to retrieve users: ' + err.message });
  }
});

// POST /api/auth/users
router.post('/users', authMiddleware, requireRole(['SHOP_OWNER', 'SUPER_ADMIN']), async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const { rows: existing } = await query('SELECT id FROM users WHERE lower(email) = $1', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const targetShopId = req.user.is_super_admin && req.body.shop_id ? req.body.shop_id : req.user.shop_id;
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await query(
      `INSERT INTO users (full_name, email, password_hash, role, phone, shop_id, is_active)
       VALUES ($1, $2, $3, 'SHOP_OWNER', $4, $5, true)
       RETURNING id, full_name as name, email, role, phone, shop_id, is_active, created_at`,
      [name.trim(), cleanEmail, passwordHash, phone ? phone.trim() : '', targetShopId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user: ' + err.message });
  }
});

// PUT /api/auth/users/:id/toggle-status
router.put('/users/:id/toggle-status', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const { rows: users } = await query('SELECT id, shop_id, is_active FROM users WHERE id = $1', [req.params.id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (!req.user.is_super_admin && user.shop_id !== req.user.shop_id) {
      return res.status(403).json({ error: 'Cannot modify staff of another medical shop' });
    }

    const { rows: updated } = await query(
      'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active',
      [req.params.id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Toggle status error:', err);
    res.status(500).json({ error: 'Failed to update user status: ' + err.message });
  }
});

// GET /api/auth/audit-logs
router.get('/audit-logs', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    let sql = 'SELECT * FROM audit_logs';
    const params = [];

    if (currentShopId) {
      sql += ' WHERE shop_id = $1';
      params.push(currentShopId);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Failed to load audit logs: ' + err.message });
  }
});

module.exports = router;
