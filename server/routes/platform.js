const express = require('express');
const bcrypt = require('bcryptjs');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// All platform endpoints require SUPER_ADMIN authentication
router.use(authMiddleware, requireSuperAdmin);

// GET /api/platform/stats - Real-time Database Platform Analytics
router.get('/stats', async (req, res) => {
  try {
    const [
      shopsRes,
      usersRes,
      medicinesRes,
      batchesRes,
      invoicesRes,
      expiringRes,
      plansRes,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int as total,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE')::int as active,
                    COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int as suspended,
                    COUNT(*) FILTER (WHERE subscription_plan = 'TRIAL')::int as trial
             FROM shops`),
      query(`SELECT COUNT(*)::int as total FROM users WHERE role != 'SUPER_ADMIN'`),
      query(`SELECT COUNT(*)::int as total FROM medicines`),
      query(`SELECT COUNT(*)::int as total FROM medicine_batches`),
      query(`SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::float as volume FROM sales_invoices`),
      query(`SELECT COUNT(*)::int as count FROM shops WHERE dl_expiry_date <= (CURRENT_DATE + interval '90 days')`),
      query(`SELECT subscription_plan, COUNT(*)::int as count FROM shops GROUP BY subscription_plan`),
    ]);

    const shopStats = shopsRes.rows[0] || { total: 0, active: 0, suspended: 0, trial: 0 };
    const userStats = usersRes.rows[0] || { total: 0 };
    const medStats = medicinesRes.rows[0] || { total: 0 };
    const batchStats = batchesRes.rows[0] || { total: 0 };
    const invoiceStats = invoicesRes.rows[0] || { count: 0, volume: 0 };
    const expiringStats = expiringRes.rows[0] || { count: 0 };

    const planBreakdown = {
      BASIC: 0,
      PRO: 0,
      ENTERPRISE: 0,
      TRIAL: 0,
    };
    plansRes.rows.forEach((r) => {
      if (r.subscription_plan) planBreakdown[r.subscription_plan] = r.count;
    });

    res.json({
      totalShops: shopStats.total,
      activeShops: shopStats.active,
      suspendedShops: shopStats.suspended,
      trialShops: shopStats.trial,
      totalUsers: userStats.total,
      totalMedicines: medStats.total,
      totalBatches: batchStats.total,
      totalBills: invoiceStats.count,
      totalSalesVolume: invoiceStats.volume,
      totalPlatformSales: invoiceStats.volume,
      licenseExpiringSoon: expiringStats.count,
      planBreakdown,
    });
  } catch (err) {
    console.error('Platform stats error:', err);
    res.status(500).json({ error: 'Failed to load platform statistics: ' + err.message });
  }
});

// GET /api/platform/shops - Query directly from shops table
router.get('/shops', async (req, res) => {
  const { search, status, plan } = req.query;

  try {
    let sql = `
      SELECT s.*,
             (SELECT COUNT(*)::int FROM users u WHERE u.shop_id = s.id) as "staffCount",
             (SELECT COUNT(*)::int FROM medicines m WHERE m.shop_id = s.id) as "medicineCount",
             (SELECT COUNT(*)::int FROM sales_invoices si WHERE si.shop_id = s.id) as "totalInvoices",
             (SELECT COALESCE(SUM(si.total_amount), 0)::float FROM sales_invoices si WHERE si.shop_id = s.id) as "totalSales"
      FROM shops s
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(s.shop_name) LIKE $${params.length} OR
        lower(s.owner_name) LIKE $${params.length} OR
        lower(s.email) LIKE $${params.length} OR
        s.phone LIKE $${params.length} OR
        lower(s.city) LIKE $${params.length} OR
        lower(s.gstin) LIKE $${params.length}
      )`;
    }

    if (status && status !== 'ALL') {
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }

    if (plan && plan !== 'ALL') {
      params.push(plan);
      sql += ` AND s.subscription_plan = $${params.length}`;
    }

    sql += ` ORDER BY s.created_at DESC`;

    const { rows } = await query(sql, params);

    const now = new Date();
    const enriched = rows.map((s) => {
      let daysUntilLicenseExpiry = null;
      if (s.dl_expiry_date) {
        const exp = new Date(s.dl_expiry_date);
        daysUntilLicenseExpiry = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        ...s,
        id: s.id,
        name: s.shop_name,
        shop_name: s.shop_name,
        owner_name: s.owner_name,
        owner_email: s.email,
        ownerEmail: s.email,
        plan: s.subscription_plan,
        subscription_plan: s.subscription_plan,
        subscription_expiry: s.subscription_expires_at,
        subscription_expires_at: s.subscription_expires_at,
        drug_license_expiry: s.dl_expiry_date,
        dl_expiry_date: s.dl_expiry_date,
        daysUntilLicenseExpiry,
        staffCount: s.staffCount || 0,
        medicineCount: s.medicineCount || 0,
        totalInvoices: s.totalInvoices || 0,
        totalSales: s.totalSales || 0,
        salesCount: s.totalInvoices || 0,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Platform shops error:', err);
    res.status(500).json({ error: 'Failed to retrieve shops from database: ' + err.message });
  }
});

// GET /api/platform/shops/:id
router.get('/shops/:id', async (req, res) => {
  try {
    const { rows: shops } = await query('SELECT * FROM shops WHERE id = $1', [req.params.id]);
    if (shops.length === 0) return res.status(404).json({ error: 'Shop not found' });

    const shop = shops[0];

    const [staffRes, medRes, invRes] = await Promise.all([
      query(
        'SELECT id, full_name as name, email, role, phone, is_active, created_at, last_login_at FROM users WHERE shop_id = $1 ORDER BY created_at ASC',
        [shop.id]
      ),
      query('SELECT COUNT(*)::int as total FROM medicines WHERE shop_id = $1', [shop.id]),
      query(
        'SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::float as revenue FROM sales_invoices WHERE shop_id = $1',
        [shop.id]
      ),
    ]);

    res.json({
      shop: {
        ...shop,
        name: shop.shop_name,
        plan: shop.subscription_plan,
        subscription_expiry: shop.subscription_expires_at,
        drug_license_expiry: shop.dl_expiry_date,
      },
      staff: staffRes.rows,
      stats: {
        totalMedicines: medRes.rows[0]?.total || 0,
        totalBills: invRes.rows[0]?.count || 0,
        totalRevenue: invRes.rows[0]?.revenue || 0,
      },
    });
  } catch (err) {
    console.error('Get shop detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve shop details: ' + err.message });
  }
});

// POST /api/platform/shops - Register new shop in PostgreSQL
router.post('/shops', async (req, res) => {
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
    city = '',
    state = '',
    state_code = '',
    pincode = '',
    gstin = '',
    dl_number_20b = '',
    dl_number_21b = '',
    fssai_no = '',
    pan_no = '',
    plan = 'PRO',
    subscription_plan = plan,
    subscription_days = 365,
    subscription_expiry,
    drug_license_expiry = '',
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

  const client = await connect();
  try {
    await client.query('BEGIN');

    // Check user email uniqueness
    const { rows: existingUsers } = await client.query(
      'SELECT id FROM users WHERE lower(email) = $1',
      [finalEmail]
    );
    if (existingUsers.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `A user with email ${finalEmail} already exists on the platform.`,
      });
    }

    const slug =
      finalShopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') +
      `-${Math.floor(Math.random() * 10000)}`;

    const subExpiresAt =
      subscription_expiry ||
      new Date(Date.now() + 1000 * 60 * 60 * 24 * Number(subscription_days)).toISOString();

    // 1. Insert Shop
    const { rows: newShops } = await client.query(
      `INSERT INTO shops (
        shop_name, slug, tagline, owner_name, email, phone, alt_phone,
        address, city, state, state_code, pincode, gstin, dl_number_20b,
        dl_number_21b, fssai_no, pan_no, status, subscription_plan,
        subscription_expires_at, dl_expiry_date, thermal_printer_size
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, 'ACTIVE', $18, $19, $20, $21
      ) RETURNING *`,
      [
        finalShopName,
        slug,
        tagline.trim(),
        finalOwnerName,
        finalEmail,
        finalPhone,
        alt_phone ? alt_phone.trim() : '',
        address ? address.trim() : '',
        city ? city.trim() : 'New Delhi',
        state ? state.trim() : 'Delhi',
        state_code ? state_code.trim() : '07',
        pincode ? pincode.trim() : '110001',
        gstin ? gstin.trim().toUpperCase() : '',
        dl_number_20b ? dl_number_20b.trim() : '',
        dl_number_21b ? dl_number_21b.trim() : '',
        fssai_no ? fssai_no.trim() : '',
        pan_no ? pan_no.trim().toUpperCase() : '',
        subscription_plan,
        subExpiresAt,
        dl_expiry_date,
        thermal_printer_size,
      ]
    );

    const newShop = newShops[0];

    // 2. Insert Shop Owner Account
    const ownerPassword = owner_password || password || 'owner123';
    const passwordHash = await bcrypt.hash(ownerPassword, 10);

    const { rows: ownerUsers } = await client.query(
      `INSERT INTO users (
        full_name, email, password_hash, role, phone, shop_id, is_active
      ) VALUES ($1, $2, $3, 'SHOP_OWNER', $4, $5, true)
      RETURNING id, full_name, email, role, phone, shop_id`,
      [
        `${finalOwnerName} (Owner)`,
        finalEmail,
        passwordHash,
        finalPhone,
        newShop.id,
      ]
    );

    // Update owner_id on shop
    await client.query('UPDATE shops SET owner_id = $1 WHERE id = $2', [
      ownerUsers[0].id,
      newShop.id,
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      ...newShop,
      shop: {
        ...newShop,
        name: newShop.shop_name,
      },
      name: newShop.shop_name,
      owner_id: ownerUsers[0].id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register shop error:', err);
    res.status(500).json({ error: 'Failed to create shop in database: ' + err.message });
  } finally {
    client.release();
  }
});

// PUT /api/platform/shops/:id
router.put('/shops/:id', async (req, res) => {
  const {
    shop_name,
    name = shop_name,
    tagline,
    owner_name,
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
    subscription_plan,
    plan = subscription_plan,
    subscription_expiry,
    subscription_expires_at = subscription_expiry,
    drug_license_expiry,
    dl_expiry_date = drug_license_expiry,
    thermal_printer_size,
    invoice_terms,
  } = req.body;

  try {
    const { rows } = await query(
      `UPDATE shops SET
        shop_name = COALESCE($1, shop_name),
        tagline = COALESCE($2, tagline),
        owner_name = COALESCE($3, owner_name),
        phone = COALESCE($4, phone),
        alt_phone = COALESCE($5, alt_phone),
        address = COALESCE($6, address),
        city = COALESCE($7, city),
        state = COALESCE($8, state),
        state_code = COALESCE($9, state_code),
        pincode = COALESCE($10, pincode),
        gstin = COALESCE($11, gstin),
        dl_number_20b = COALESCE($12, dl_number_20b),
        dl_number_21b = COALESCE($13, dl_number_21b),
        fssai_no = COALESCE($14, fssai_no),
        pan_no = COALESCE($15, pan_no),
        subscription_plan = COALESCE($16, subscription_plan),
        subscription_expires_at = COALESCE($17, subscription_expires_at),
        dl_expiry_date = COALESCE($18, dl_expiry_date),
        thermal_printer_size = COALESCE($19, thermal_printer_size),
        invoice_terms = COALESCE($20, invoice_terms),
        updated_at = now()
       WHERE id = $21
       RETURNING *`,
      [
        name ? name.trim() : null,
        tagline !== undefined ? tagline.trim() : null,
        owner_name ? owner_name.trim() : null,
        phone ? phone.trim() : null,
        alt_phone !== undefined ? alt_phone.trim() : null,
        address !== undefined ? address.trim() : null,
        city !== undefined ? city.trim() : null,
        state !== undefined ? state.trim() : null,
        state_code !== undefined ? state_code.trim() : null,
        pincode !== undefined ? pincode.trim() : null,
        gstin !== undefined ? gstin.trim().toUpperCase() : null,
        dl_number_20b !== undefined ? dl_number_20b.trim() : null,
        dl_number_21b !== undefined ? dl_number_21b.trim() : null,
        fssai_no !== undefined ? fssai_no.trim() : null,
        pan_no !== undefined ? pan_no.trim().toUpperCase() : null,
        plan || null,
        subscription_expires_at || null,
        dl_expiry_date || null,
        thermal_printer_size || null,
        invoice_terms || null,
        req.params.id,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Shop not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update shop error:', err);
    res.status(500).json({ error: 'Failed to update shop: ' + err.message });
  }
});

// PUT /api/platform/shops/:id/toggle-status
router.put('/shops/:id/toggle-status', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE shops
       SET status = CASE WHEN status = 'ACTIVE' THEN 'SUSPENDED' ELSE 'ACTIVE' END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Shop not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Toggle status error:', err);
    res.status(500).json({ error: 'Failed to toggle shop status: ' + err.message });
  }
});

// POST /api/platform/shops/:id/reset-owner-password
router.post('/shops/:id/reset-owner-password', async (req, res) => {
  const { newPassword = 'password123' } = req.body;
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { rowCount } = await query(
      `UPDATE users SET password_hash = $1 WHERE shop_id = $2 AND role IN ('SHOP_OWNER', 'ADMIN')`,
      [passwordHash, req.params.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'No owner account found for this shop' });
    }

    res.json({ message: 'Owner password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password: ' + err.message });
  }
});

// DELETE /api/platform/shops/:id
router.delete('/shops/:id', async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM shops WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Shop not found' });
    res.json({ message: 'Shop and associated data removed successfully' });
  } catch (err) {
    console.error('Delete shop error:', err);
    res.status(500).json({ error: 'Failed to delete shop: ' + err.message });
  }
});

module.exports = router;
