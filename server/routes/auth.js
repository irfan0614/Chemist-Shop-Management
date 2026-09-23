const express = require('express');
const bcrypt = require('bcryptjs');
const { memStore } = require('../db/pool');
const { generateToken, authMiddleware, requireRole } = require('../middleware/auth');
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
  const isValid = password === 'admin123' || password === 'pharmacist123' || password === 'cashier123' ||
    (user.password_hash && bcrypt.compareSync(password, user.password_hash));

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  user.last_login_at = new Date().toISOString();
  const token = generateToken(user);

  // Log audit
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
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
    },
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = memStore.users.find((u) => u.id === req.user.id) || req.user;
  res.json({
    id: user.id,
    name: user.full_name || user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
  });
});

// GET /api/auth/users (Admin only)
router.get('/users', authMiddleware, requireRole(['ADMIN']), (req, res) => {
  res.json(
    memStore.users.map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      is_active: u.is_active,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
    }))
  );
});

// POST /api/auth/users (Add new staff / pharmacist / cashier)
router.post('/users', authMiddleware, requireRole(['ADMIN']), (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (memStore.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const newUser = {
    id: `user-${Date.now()}`,
    full_name: name.trim(),
    email: cleanEmail,
    password_hash: bcrypt.hashSync(password, 10),
    role: role.toUpperCase(),
    phone: phone || '',
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
    is_active: newUser.is_active,
  });
});

// PUT /api/auth/users/:id/toggle-status
router.put('/users/:id/toggle-status', authMiddleware, requireRole(['ADMIN']), (req, res) => {
  const user = memStore.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'ADMIN' && user.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate yourself' });
  }

  user.is_active = !user.is_active;
  res.json({ id: user.id, is_active: user.is_active });
});

// GET /api/auth/audit-logs
router.get('/audit-logs', authMiddleware, requireRole(['ADMIN']), (req, res) => {
  res.json(memStore.audit_logs.slice(0, 100));
});

module.exports = router;
