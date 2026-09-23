const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

function enrichMedicine(med) {
  const batches = memStore.batches.filter((b) => b.medicine_id === med.id && !b.is_blocked);
  const totalStock = batches.reduce((sum, b) => sum + (Number(b.current_stock) || 0), 0);
  const category = memStore.categories.find((c) => c.id === med.category_id);

  // Find earliest active expiry
  let earliestExpiry = null;
  const sorted = [...batches].sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
  if (sorted.length > 0) {
    earliestExpiry = sorted[0].expiry_date;
  }

  // Find lowest selling price or standard MRP
  const minPrice = batches.length > 0 ? Math.min(...batches.map((b) => Number(b.selling_price) || 0)) : 0;
  const maxMrp = batches.length > 0 ? Math.max(...batches.map((b) => Number(b.mrp) || 0)) : 0;

  return {
    ...med,
    categoryName: category ? category.name : 'General',
    totalStock,
    earliestExpiry,
    sellingPrice: minPrice,
    mrp: maxMrp,
    batchCount: batches.length,
    batches: batches.map((b) => ({
      id: b.id,
      batchNo: b.batch_no,
      mfgDate: b.mfg_date,
      expiryDate: b.expiry_date,
      purchaseCost: Number(b.purchase_cost),
      mrp: Number(b.mrp),
      sellingPrice: Number(b.selling_price),
      currentStock: Number(b.current_stock),
      rackShelf: b.rack_shelf,
    })),
  };
}

// GET /api/medicines
router.get('/', (req, res) => {
  try {
    const { search, category, schedule, prescription, inStock } = req.query;
    let list = memStore.medicines.filter((m) => m.is_active !== false);

    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.generic_name || '').toLowerCase().includes(q) ||
          (m.barcode || '').includes(q) ||
          (m.salt_composition || '').toLowerCase().includes(q) ||
          (m.brand || '').toLowerCase().includes(q)
      );
    }

    if (category) {
      list = list.filter((m) => m.category_id === category);
    }

    if (schedule && schedule !== 'ALL') {
      list = list.filter((m) => m.schedule_type === schedule);
    }

    if (prescription === 'true') {
      list = list.filter((m) => m.is_prescription_required);
    }

    const enriched = list.map(enrichMedicine);

    if (inStock === 'true') {
      return res.json(enriched.filter((m) => m.totalStock > 0));
    }

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load medicines' });
  }
});

// GET /api/medicines/categories
router.get('/categories', (req, res) => {
  res.json(memStore.categories);
});

// POST /api/medicines/categories
router.post('/categories', authMiddleware, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const existing = memStore.categories.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return res.json(existing);

  const newCat = {
    id: `cat-${Date.now()}`,
    name: name.trim(),
    description: description || '',
  };
  memStore.categories.push(newCat);
  res.status(201).json(newCat);
});

// GET /api/medicines/:id
router.get('/:id', (req, res) => {
  const med = memStore.medicines.find((m) => m.id === req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });
  res.json(enrichMedicine(med));
});

// POST /api/medicines (Master creation + initial batch if provided)
router.post('/', authMiddleware, (req, res) => {
  const {
    name,
    generic_name,
    brand,
    manufacturer,
    category_id,
    salt_composition,
    dosage_form,
    strength,
    pack_size,
    unit,
    barcode,
    hsn_code,
    gst_rate,
    schedule_type,
    is_prescription_required,
    reorder_level,
    storage_temperature,
    // Optional initial batch details
    batch_no,
    expiry_date,
    mfg_date,
    purchase_cost,
    mrp,
    selling_price,
    initial_stock,
    rack_shelf,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Medicine name is required' });
  }

  // Duplicate name check
  const duplicate = memStore.medicines.find(
    (m) => m.name.toLowerCase() === name.trim().toLowerCase() && m.strength === (strength || '')
  );
  if (duplicate) {
    return res.status(400).json({ error: `Medicine "${name}" (${strength || 'Standard'}) already exists in master catalog.` });
  }

  const newMed = {
    id: `med-${Date.now()}`,
    name: name.trim(),
    generic_name: (generic_name || '').trim(),
    brand: (brand || '').trim(),
    manufacturer: (manufacturer || '').trim(),
    category_id: category_id || memStore.categories[0]?.id || 'cat-1',
    salt_composition: (salt_composition || '').trim(),
    dosage_form: dosage_form || 'Tablet',
    strength: (strength || '').trim(),
    pack_size: parseInt(pack_size) || 10,
    unit: unit || 'Strips',
    barcode: (barcode || '').trim(),
    hsn_code: (hsn_code || '3004').trim(),
    gst_rate: parseFloat(gst_rate) !== undefined ? parseFloat(gst_rate) : 12.0,
    schedule_type: schedule_type || 'NONE',
    is_prescription_required: !!is_prescription_required,
    reorder_level: parseInt(reorder_level) || 15,
    storage_temperature: storage_temperature || 'Room Temperature',
    is_active: true,
    created_at: new Date().toISOString(),
  };

  memStore.medicines.unshift(newMed);

  // If initial batch details were provided, add batch directly
  if (batch_no && expiry_date) {
    const newBatch = {
      id: `b-${Date.now()}`,
      medicine_id: newMed.id,
      batch_no: batch_no.trim(),
      mfg_date: mfg_date || null,
      expiry_date: expiry_date,
      purchase_cost: parseFloat(purchase_cost) || 0,
      mrp: parseFloat(mrp) || parseFloat(selling_price) || 0,
      selling_price: parseFloat(selling_price) || parseFloat(mrp) || 0,
      current_stock: parseInt(initial_stock) || 0,
      rack_shelf: (rack_shelf || '').trim(),
      is_blocked: false,
    };
    memStore.batches.push(newBatch);
  }

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'CREATE_MEDICINE',
    entity_type: 'MEDICINE',
    entity_id: newMed.id,
    new_values: { name: newMed.name, generic: newMed.generic_name, schedule: newMed.schedule_type },
    created_at: new Date().toISOString(),
  });

  res.status(201).json(enrichMedicine(newMed));
});

// PUT /api/medicines/:id
router.put('/:id', authMiddleware, (req, res) => {
  const med = memStore.medicines.find((m) => m.id === req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });

  const {
    name,
    generic_name,
    brand,
    manufacturer,
    category_id,
    salt_composition,
    dosage_form,
    strength,
    pack_size,
    unit,
    barcode,
    hsn_code,
    gst_rate,
    schedule_type,
    is_prescription_required,
    reorder_level,
    storage_temperature,
  } = req.body;

  if (name) med.name = name.trim();
  if (generic_name !== undefined) med.generic_name = generic_name.trim();
  if (brand !== undefined) med.brand = brand.trim();
  if (manufacturer !== undefined) med.manufacturer = manufacturer.trim();
  if (category_id !== undefined) med.category_id = category_id;
  if (salt_composition !== undefined) med.salt_composition = salt_composition.trim();
  if (dosage_form !== undefined) med.dosage_form = dosage_form;
  if (strength !== undefined) med.strength = strength.trim();
  if (pack_size !== undefined) med.pack_size = parseInt(pack_size) || 10;
  if (unit !== undefined) med.unit = unit;
  if (barcode !== undefined) med.barcode = barcode.trim();
  if (hsn_code !== undefined) med.hsn_code = hsn_code.trim();
  if (gst_rate !== undefined) med.gst_rate = parseFloat(gst_rate) || 0;
  if (schedule_type !== undefined) med.schedule_type = schedule_type;
  if (is_prescription_required !== undefined) med.is_prescription_required = !!is_prescription_required;
  if (reorder_level !== undefined) med.reorder_level = parseInt(reorder_level) || 15;
  if (storage_temperature !== undefined) med.storage_temperature = storage_temperature;
  med.updated_at = new Date().toISOString();

  res.json(enrichMedicine(med));
});

// DELETE /api/medicines/:id
router.delete('/:id', authMiddleware, requireRole(['ADMIN', 'INVENTORY_MGR']), (req, res) => {
  const index = memStore.medicines.findIndex((m) => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Medicine not found' });

  // Soft delete / flag inactive
  memStore.medicines[index].is_active = false;

  res.status(204).end();
});

module.exports = router;
