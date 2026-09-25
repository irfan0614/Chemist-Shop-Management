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
      shop_id: isSuperAdmin ? null : (user.shop_id || null),
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
    return res.status(401).json({ error: 'Authentication token is required' });
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
  if (!req.user) return null;
  if (req.user.is_super_admin || req.user.role === 'SUPER_ADMIN') {
    const target = req.headers['x-target-shop-id'] || req.query?.target_shop_id;
    if (target) return target;
    return null; // Null means all shops for super admin global queries
  }
  return req.user.shop_id || null;
}

function requireRole(allowedRoles = ['SHOP_OWNER', 'SUPER_ADMIN']) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Super Admin and Shop Owner have full tenant access
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'SHOP_OWNER' || req.user.role === 'ADMIN') {
      return next();
    }
    return res.status(403).json({
      error: `Access denied. Shop Owner authorization required.`,
    });
  };
}

function requireShopOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'SHOP_OWNER' || req.user.role === 'ADMIN') {
    return next();
  }
  return res.status(403).json({ error: 'Shop Owner authorization required' });
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
  requireShopOwner,
  requireSuperAdmin,
};

