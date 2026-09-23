const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chemist_shop_secure_jwt_secret_2026_key';

function generateToken(user) {
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.full_name || user.name,
      role: user.role,
      shop_id: isSuperAdmin ? null : (user.shop_id || '11111111-1111-1111-1111-111111111111'),
      is_super_admin: isSuperAdmin,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // If no token provided in dev fallback
    req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Dr. Rajesh Sharma (Apollo Owner)',
      role: 'SHOP_OWNER',
      shop_id: '11111111-1111-1111-1111-111111111111',
      is_super_admin: false,
    };
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

/**
 * Extracts and enforces the trusted tenant shop_id.
 * For regular users/owners, strictly returns their authenticated shop_id.
 * For SUPER_ADMIN, allows specifying a target shop via header or query for support view.
 */
function tenantShopId(req) {
  if (!req.user) return '11111111-1111-1111-1111-111111111111';
  if (req.user.is_super_admin || req.user.role === 'SUPER_ADMIN') {
    const target = req.headers['x-target-shop-id'] || req.query?.target_shop_id;
    if (target) return target;
    return null; // Null means all shops for super admin global queries
  }
  return req.user.shop_id || '11111111-1111-1111-1111-111111111111';
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Super admin has universal access
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    // Shop owner is considered equivalent to ADMIN for tenant operations
    const userRole = req.user.role;
    const isAllowed = allowedRoles.length === 0 ||
      allowedRoles.includes(userRole) ||
      (allowedRoles.includes('ADMIN') && (userRole === 'SHOP_OWNER' || userRole === 'ADMIN'));

    if (!isAllowed) {
      return res.status(403).json({
        error: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Platform Super Admin authorization required' });
  }
  next();
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authMiddleware,
  tenantShopId,
  requireRole,
  requireSuperAdmin,
};

