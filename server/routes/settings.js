const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/settings (Gets current shop's settings)
router.get('/', authMiddleware, (req, res) => {
  const shopId = tenantShopId(req) || '11111111-1111-1111-1111-111111111111';
  const shop = memStore.shops.find((s) => s.id === shopId) || memStore.shops[0];
  res.json(shop);
});

// PUT /api/settings (Updates current shop's settings)
router.put('/', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER']), (req, res) => {
  const shopId = tenantShopId(req) || '11111111-1111-1111-1111-111111111111';
  const shop = memStore.shops.find((s) => s.id === shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

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

  if (shop_name) shop.shop_name = shop_name.trim();
  if (tagline !== undefined) shop.tagline = tagline.trim();
  if (owner_name !== undefined) shop.owner_name = owner_name.trim();
  if (dl_number_20b !== undefined) shop.dl_number_20b = dl_number_20b.trim();
  if (dl_number_21b !== undefined) shop.dl_number_21b = dl_number_21b.trim();
  if (gstin !== undefined) shop.gstin = gstin.trim().toUpperCase();
  if (fssai_no !== undefined) shop.fssai_no = fssai_no.trim();
  if (pan_no !== undefined) shop.pan_no = pan_no.trim().toUpperCase();
  if (phone !== undefined) shop.phone = phone.trim();
  if (alt_phone !== undefined) shop.alt_phone = alt_phone.trim();
  if (email !== undefined) shop.email = email.trim();
  if (address !== undefined) shop.address = address.trim();
  if (city !== undefined) shop.city = city.trim();
  if (state !== undefined) shop.state = state.trim();
  if (state_code !== undefined) shop.state_code = state_code.trim();
  if (pincode !== undefined) shop.pincode = pincode.trim();
  if (bill_prefix !== undefined) shop.bill_prefix = bill_prefix.trim() || 'INV';
  if (purchase_prefix !== undefined) shop.purchase_prefix = purchase_prefix.trim() || 'PUR';
  if (return_prefix !== undefined) shop.return_prefix = return_prefix.trim() || 'SRT';
  if (default_low_stock_threshold !== undefined) shop.default_low_stock_threshold = parseInt(default_low_stock_threshold) || 15;
  if (default_expiry_alert_days !== undefined) shop.default_expiry_alert_days = parseInt(default_expiry_alert_days) || 90;
  if (thermal_printer_size !== undefined) shop.thermal_printer_size = thermal_printer_size;
  if (invoice_terms !== undefined) shop.invoice_terms = invoice_terms;
  if (enable_fefo !== undefined) shop.enable_fefo = !!enable_fefo;
  if (allow_negative_stock !== undefined) shop.allow_negative_stock = !!allow_negative_stock;
  if (require_doctor_on_schedule_h !== undefined) shop.require_doctor_on_schedule_h = !!require_doctor_on_schedule_h;
  if (dl_expiry_date !== undefined) shop.dl_expiry_date = dl_expiry_date;

  shop.updated_at = new Date().toISOString();

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shop.id,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'UPDATE_SETTINGS',
    entity_type: 'SETTINGS',
    entity_id: shop.id,
    created_at: new Date().toISOString(),
  });

  res.json(shop);
});

module.exports = router;

