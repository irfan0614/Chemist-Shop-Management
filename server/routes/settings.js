const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/settings
router.get('/', (req, res) => {
  res.json(memStore.settings);
});

// PUT /api/settings
router.put('/', authMiddleware, requireRole(['ADMIN']), (req, res) => {
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
  } = req.body;

  if (shop_name) memStore.settings.shop_name = shop_name.trim();
  if (tagline !== undefined) memStore.settings.tagline = tagline.trim();
  if (owner_name !== undefined) memStore.settings.owner_name = owner_name.trim();
  if (dl_number_20b !== undefined) memStore.settings.dl_number_20b = dl_number_20b.trim();
  if (dl_number_21b !== undefined) memStore.settings.dl_number_21b = dl_number_21b.trim();
  if (gstin !== undefined) memStore.settings.gstin = gstin.trim();
  if (fssai_no !== undefined) memStore.settings.fssai_no = fssai_no.trim();
  if (pan_no !== undefined) memStore.settings.pan_no = pan_no.trim();
  if (phone !== undefined) memStore.settings.phone = phone.trim();
  if (alt_phone !== undefined) memStore.settings.alt_phone = alt_phone.trim();
  if (email !== undefined) memStore.settings.email = email.trim();
  if (address !== undefined) memStore.settings.address = address.trim();
  if (city !== undefined) memStore.settings.city = city.trim();
  if (state !== undefined) memStore.settings.state = state.trim();
  if (state_code !== undefined) memStore.settings.state_code = state_code.trim();
  if (pincode !== undefined) memStore.settings.pincode = pincode.trim();
  if (bill_prefix !== undefined) memStore.settings.bill_prefix = bill_prefix.trim() || 'INV';
  if (purchase_prefix !== undefined) memStore.settings.purchase_prefix = purchase_prefix.trim() || 'PUR';
  if (return_prefix !== undefined) memStore.settings.return_prefix = return_prefix.trim() || 'SRT';
  if (default_low_stock_threshold !== undefined) memStore.settings.default_low_stock_threshold = parseInt(default_low_stock_threshold) || 15;
  if (default_expiry_alert_days !== undefined) memStore.settings.default_expiry_alert_days = parseInt(default_expiry_alert_days) || 90;
  if (thermal_printer_size !== undefined) memStore.settings.thermal_printer_size = thermal_printer_size;
  if (invoice_terms !== undefined) memStore.settings.invoice_terms = invoice_terms;
  if (enable_fefo !== undefined) memStore.settings.enable_fefo = !!enable_fefo;
  if (allow_negative_stock !== undefined) memStore.settings.allow_negative_stock = !!allow_negative_stock;
  if (require_doctor_on_schedule_h !== undefined) memStore.settings.require_doctor_on_schedule_h = !!require_doctor_on_schedule_h;

  memStore.settings.updated_at = new Date().toISOString();

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'UPDATE_SETTINGS',
    entity_type: 'SETTINGS',
    entity_id: '1',
    created_at: new Date().toISOString(),
  });

  res.json(memStore.settings);
});

module.exports = router;
