const express = require('express');
const { query } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/settings - Current shop settings from PostgreSQL
router.get('/', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows } = await query('SELECT * FROM shops WHERE id = $1', [shopId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Shop settings not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to retrieve shop settings: ' + err.message });
  }
});

// PUT /api/settings - Update current shop settings
router.put('/', requireRole(['ADMIN', 'SHOP_OWNER', 'SUPER_ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    shop_name,
    tagline,
    owner_name,
    dl_number_20b,
    dl_number_21b,
    gstin,
    fssai_no,
    pan_no,
    phone,
    alt_phone,
    email,
    address,
    city,
    state,
    state_code,
    pincode,
    bill_prefix,
    purchase_prefix,
    return_prefix,
    default_low_stock_threshold,
    default_expiry_alert_days,
    thermal_printer_size,
    invoice_terms,
    enable_fefo,
    allow_negative_stock,
    require_doctor_on_schedule_h,
    dl_expiry_date,
  } = req.body;

  try {
    // Ensure columns exist on shops table
    await query(`
      ALTER TABLE shops ADD COLUMN IF NOT EXISTS default_low_stock_threshold INT NOT NULL DEFAULT 15;
      ALTER TABLE shops ADD COLUMN IF NOT EXISTS default_expiry_alert_days INT NOT NULL DEFAULT 90;
      ALTER TABLE shops ADD COLUMN IF NOT EXISTS debit_note_prefix TEXT NOT NULL DEFAULT 'DBN';
      ALTER TABLE shops ADD COLUMN IF NOT EXISTS debit_note_counter INT NOT NULL DEFAULT 1;
    `).catch(() => {});

    const { rows } = await query(
      `UPDATE shops SET
        shop_name = COALESCE($1, shop_name),
        tagline = COALESCE($2, tagline),
        owner_name = COALESCE($3, owner_name),
        dl_number_20b = COALESCE($4, dl_number_20b),
        dl_number_21b = COALESCE($5, dl_number_21b),
        gstin = COALESCE($6, gstin),
        fssai_no = COALESCE($7, fssai_no),
        pan_no = COALESCE($8, pan_no),
        phone = COALESCE($9, phone),
        alt_phone = COALESCE($10, alt_phone),
        email = COALESCE($11, email),
        address = COALESCE($12, address),
        city = COALESCE($13, city),
        state = COALESCE($14, state),
        state_code = COALESCE($15, state_code),
        pincode = COALESCE($16, pincode),
        bill_prefix = COALESCE($17, bill_prefix),
        purchase_prefix = COALESCE($18, purchase_prefix),
        return_prefix = COALESCE($19, return_prefix),
        default_low_stock_threshold = COALESCE($20, default_low_stock_threshold),
        default_expiry_alert_days = COALESCE($21, default_expiry_alert_days),
        thermal_printer_size = COALESCE($22, thermal_printer_size),
        invoice_terms = COALESCE($23, invoice_terms),
        enable_fefo = COALESCE($24, enable_fefo),
        allow_negative_stock = COALESCE($25, allow_negative_stock),
        require_doctor_on_schedule_h = COALESCE($26, require_doctor_on_schedule_h),
        dl_expiry_date = COALESCE($27, dl_expiry_date),
        updated_at = now()
       WHERE id = $28
       RETURNING *`,
      [
        shop_name !== undefined ? shop_name.trim() : null,
        tagline !== undefined ? tagline.trim() : null,
        owner_name !== undefined ? owner_name.trim() : null,
        dl_number_20b !== undefined ? dl_number_20b.trim() : null,
        dl_number_21b !== undefined ? dl_number_21b.trim() : null,
        gstin !== undefined ? gstin.trim().toUpperCase() : null,
        fssai_no !== undefined ? fssai_no.trim() : null,
        pan_no !== undefined ? pan_no.trim().toUpperCase() : null,
        phone !== undefined ? phone.trim() : null,
        alt_phone !== undefined ? alt_phone.trim() : null,
        email !== undefined ? email.trim() : null,
        address !== undefined ? address.trim() : null,
        city !== undefined ? city.trim() : null,
        state !== undefined ? state.trim() : null,
        state_code !== undefined ? state_code.trim() : null,
        pincode !== undefined ? pincode.trim() : null,
        bill_prefix !== undefined ? bill_prefix.trim() : null,
        purchase_prefix !== undefined ? purchase_prefix.trim() : null,
        return_prefix !== undefined ? return_prefix.trim() : null,
        default_low_stock_threshold !== undefined ? parseInt(default_low_stock_threshold) : null,
        default_expiry_alert_days !== undefined ? parseInt(default_expiry_alert_days) : null,
        thermal_printer_size || null,
        invoice_terms !== undefined ? invoice_terms : null,
        enable_fefo !== undefined ? Boolean(enable_fefo) : null,
        allow_negative_stock !== undefined ? Boolean(allow_negative_stock) : null,
        require_doctor_on_schedule_h !== undefined ? Boolean(require_doctor_on_schedule_h) : null,
        dl_expiry_date || null,
        shopId,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Shop not found' });

    // Record audit log
    await query(
      `INSERT INTO audit_logs (shop_id, user_id, user_name, action, entity_type, entity_id)
       VALUES ($1, $2, $3, 'UPDATE_SETTINGS', 'SETTINGS', $4)`,
      [shopId, req.user?.id, req.user?.name, shopId]
    ).catch(() => {});

    res.json(rows[0]);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

module.exports = router;
