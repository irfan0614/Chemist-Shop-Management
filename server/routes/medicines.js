const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

function enrichMedicine(med) {
  const batches = memStore.batches.filter((b) => b.medicine_id === med.id && b.shop_id === med.shop_id && !b.is_blocked);
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
router.get('/', authMiddleware, (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    const { search, category, schedule, prescription, inStock } = req.query;
    let list = memStore.medicines.filter((m) => m.is_active !== false);

    if (currentShopId) {
      list = list.filter((m) => m.shop_id === currentShopId);
    }

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
router.get('/categories', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  let cats = memStore.categories;
  if (currentShopId) {
    cats = cats.filter((c) => !c.shop_id || c.shop_id === currentShopId);
  }
  res.json(cats);
});

// POST /api/medicines/categories
router.post('/categories', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req) || '11111111-1111-1111-1111-111111111111';
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const existing = memStore.categories.find(
    (c) => (c.shop_id === currentShopId || !c.shop_id) && c.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (existing) return res.json(existing);

  const newCat = {
    id: `cat-${Date.now()}`,
    shop_id: currentShopId,
    name: name.trim(),
    description: description || '',
  };
  memStore.categories.push(newCat);
  res.status(201).json(newCat);
});

// GET /api/medicines/:id
router.get('/:id', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const med = memStore.medicines.find(
    (m) => m.id === req.params.id && (!currentShopId || m.shop_id === currentShopId)
  );
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

  const currentShopId = tenantShopId(req) || '11111111-1111-1111-1111-111111111111';

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Medicine name is required' });
  }

  // Duplicate name check within caller's shop
  const duplicate = memStore.medicines.find(
    (m) =>
      m.shop_id === currentShopId &&
      m.name.toLowerCase() === name.trim().toLowerCase() &&
      m.strength === (strength || '')
  );
  if (duplicate) {
    return res.status(400).json({
      error: `Medicine "${name}" (${strength || 'Standard'}) already exists in your pharmacy catalog.`,
    });
  }

  const newMed = {
    id: `med-${Date.now()}`,
    shop_id: currentShopId,
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

  // If initial batch details were provided, add batch directly with shop_id
  if (batch_no && expiry_date) {
    const newBatch = {
      id: `b-${Date.now()}`,
      shop_id: currentShopId,
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
      created_at: new Date().toISOString(),
    };
    memStore.batches.push(newBatch);
  }

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: currentShopId,
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

// GET /api/medicines/template-excel
router.get('/template-excel', authMiddleware, (req, res) => {
  const { generateExcelXml, generateCsv } = require('../utils/excelUtils');
  const format = req.query.format === 'csv' ? 'csv' : 'excel';

  const headers = [
    'Medicine Name',
    'Generic Name',
    'Brand',
    'Manufacturer',
    'Category',
    'Dosage Form',
    'Strength',
    'Pack Size',
    'Unit',
    'HSN Code',
    'GST Rate (%)',
    'Drug Schedule',
    'Prescription Required (YES/NO)',
    'Reorder Level',
    'Storage Temp',
    'Batch No',
    'Expiry Date (YYYY-MM-DD)',
    'Mfg Date (YYYY-MM-DD)',
    'Purchase Cost (Rs)',
    'MRP (Rs)',
    'Selling Price (Rs)',
    'Initial Stock Qty',
    'Rack Shelf',
    'Barcode',
  ];

  const instructions = [
    'Required (e.g. Paracetamol 650)',
    'Optional composition',
    'Brand / Trade name',
    'Pharma Company',
    'e.g. Antibiotics, Analgesics, Cardiac',
    'Tablet/Capsule/Syrup/Injection/Ointment',
    'e.g. 650mg, 500mg, 10ml',
    'Number per pack (e.g. 10 or 15)',
    'Strips/Bottles/Vials/Tubes/Boxes',
    'Default 3004',
    '0, 5, 12, 18, or 28',
    'NONE, H, H1, X, or G',
    'YES or NO',
    'Stock alert limit (e.g. 15)',
    'Room Temp or 2-8°C',
    'Optional initial batch (e.g. B2401)',
    'Format: YYYY-MM-DD (e.g. 2027-08-31)',
    'Format: YYYY-MM-DD',
    'Purchase price per unit (Rs)',
    'Maximum Retail Price (Rs)',
    'Retail Selling Price (Rs)',
    'Opening units in stock',
    'Storage location (e.g. Rack A-1)',
    'EAN/UPC barcode number',
  ];

  const sampleRows = [
    [
      'Augmentin 625 Duo Tablet',
      'Amoxycillin and Potassium Clavulanate',
      'Augmentin',
      'GlaxoSmithKline Pharmaceuticals',
      'Antibiotics',
      'Tablet',
      '625mg',
      10,
      'Strips',
      '3004',
      12.0,
      'H',
      'YES',
      20,
      'Room Temperature',
      'AUG2401',
      '2027-06-30',
      '2024-06-01',
      152.5,
      204.85,
      198.0,
      50,
      'Rack A-1',
      '8901030010203',
    ],
    [
      'Dolo 650 Tablet',
      'Paracetamol IP',
      'Dolo',
      'Micro Labs Ltd',
      'Analgesics & Antipyretics',
      'Tablet',
      '650mg',
      15,
      'Strips',
      '3004',
      12.0,
      'NONE',
      'NO',
      50,
      'Room Temperature',
      'DL650B01',
      '2027-12-31',
      '2024-11-01',
      22.0,
      33.6,
      33.0,
      100,
      'Rack B-2',
      '8901040010204',
    ],
    [
      'Azithral 500 Tablet',
      'Azithromycin IP',
      'Azithral',
      'Alembic Pharmaceuticals',
      'Antibiotics',
      'Tablet',
      '500mg',
      5,
      'Strips',
      '3004',
      12.0,
      'H1',
      'YES',
      15,
      'Room Temperature',
      'AZ500A1',
      '2026-10-31',
      '2024-05-01',
      78.4,
      125.0,
      119.0,
      30,
      'Rack A-3',
      '8901050010205',
    ],
    [
      'Pantocid 40 Tablet',
      'Pantoprazole Sodium Gastro-resistant',
      'Pantocid',
      'Sun Pharma Laboratories',
      'Gastrointestinal',
      'Tablet',
      '40mg',
      15,
      'Strips',
      '3004',
      12.0,
      'H',
      'YES',
      25,
      'Room Temperature',
      'PAN40B12',
      '2027-09-30',
      '2024-08-01',
      95.0,
      158.0,
      150.0,
      40,
      'Rack C-1',
      '8901060010206',
    ],
    [
      'Corex-DX Cough Syrup',
      'Dextromethorphan + Chlorpheniramine',
      'Corex',
      'Pfizer India',
      'Respiratory & ENT',
      'Syrup',
      '100ml',
      1,
      'Bottles',
      '3004',
      12.0,
      'H',
      'YES',
      10,
      'Room Temperature',
      'CDX1001',
      '2026-08-31',
      '2024-07-01',
      75.0,
      118.5,
      115.0,
      25,
      'Rack D-4',
      '8901070010207',
    ],
  ];

  if (format === 'csv') {
    const csvData = generateCsv({ headers, rows: [instructions, ...sampleRows] });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="medicines_bulk_upload_template.csv"');
    return res.send(csvData);
  }

  const xmlData = generateExcelXml({
    title: 'Medicines_Bulk_Template',
    headers,
    instructions,
    rows: sampleRows,
  });
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="medicines_bulk_upload_template.xls"');
  return res.send(xmlData);
});

// GET /api/medicines/export-excel
router.get('/export-excel', authMiddleware, (req, res) => {
  const { generateExcelXml, generateCsv } = require('../utils/excelUtils');
  const currentShopId = tenantShopId(req);
  const format = req.query.format === 'csv' ? 'csv' : 'excel';

  let list = memStore.medicines.filter((m) => m.is_active !== false);
  if (currentShopId) {
    list = list.filter((m) => m.shop_id === currentShopId);
  }

  const enriched = list.map(enrichMedicine);

  const headers = [
    'Medicine ID',
    'Medicine Name',
    'Generic / Composition',
    'Brand',
    'Manufacturer',
    'Category',
    'Dosage Form',
    'Strength',
    'Pack Size',
    'Unit',
    'HSN Code',
    'GST Rate (%)',
    'Drug Schedule',
    'Prescription Required',
    'Total Stock',
    'Batches Count',
    'Est. MRP (Rs)',
    'Min Selling Price (Rs)',
    'Earliest Expiry',
    'Reorder Level',
    'Barcode',
    'Created Date',
  ];

  const rows = enriched.map((m) => [
    m.id,
    m.name,
    m.generic_name || m.salt_composition || '',
    m.brand || '',
    m.manufacturer || '',
    m.categoryName || 'General',
    m.dosage_form || 'Tablet',
    m.strength || '',
    m.pack_size || 10,
    m.unit || 'Strips',
    m.hsn_code || '3004',
    m.gst_rate !== undefined ? m.gst_rate : 12.0,
    m.schedule_type || 'NONE',
    m.is_prescription_required ? 'YES' : 'NO',
    m.totalStock || 0,
    m.batchCount || 0,
    m.mrp || 0,
    m.sellingPrice || 0,
    m.earliestExpiry || '—',
    m.reorder_level || 15,
    m.barcode || '',
    (m.created_at || '').slice(0, 10),
  ]);

  if (format === 'csv') {
    const csvData = generateCsv({ headers, rows });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="medicines_catalog_${Date.now()}.csv"`);
    return res.send(csvData);
  }

  const xmlData = generateExcelXml({
    title: 'Medicines_Catalog',
    headers,
    rows,
  });
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="medicines_catalog_${Date.now()}.xls"`);
  return res.send(xmlData);
});

// Helper to normalize and match schedule types
function normalizeSchedule(val) {
  if (!val) return 'NONE';
  const s = String(val).toUpperCase().trim();
  if (s.includes('H1')) return 'H1';
  if (s.includes('H')) return 'H';
  if (s.includes('X')) return 'X';
  if (s.includes('G')) return 'G';
  return 'NONE';
}

// POST /api/medicines/bulk-import (Import structured array of medicines & batches)
router.post('/bulk-import', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), (req, res) => {
  const { medicines = [], updateDuplicates = true } = req.body;
  const currentShopId = tenantShopId(req) || '11111111-1111-1111-1111-111111111111';

  if (!Array.isArray(medicines) || medicines.length === 0) {
    return res.status(400).json({ error: 'No medicine records provided for import' });
  }

  const results = {
    total: medicines.length,
    created: 0,
    updated: 0,
    batchesAdded: 0,
    skipped: 0,
    errors: [],
    importedMedicines: [],
  };

  medicines.forEach((row, index) => {
    const rowNum = index + 1;
    const name = (row.name || row.medicine_name || row['Medicine Name'] || '').trim();

    if (!name) {
      results.errors.push({ row: rowNum, error: 'Medicine name is missing' });
      results.skipped++;
      return;
    }

    try {
      // Category resolution
      const catName = (row.category || row.categoryName || row.category_name || row['Category'] || 'General').trim();
      let cat = memStore.categories.find(
        (c) => (!c.shop_id || c.shop_id === currentShopId) && c.name.toLowerCase() === catName.toLowerCase()
      );
      if (!cat) {
        cat = {
          id: `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          shop_id: currentShopId,
          name: catName,
          description: 'Imported via Excel bulk upload',
        };
        memStore.categories.push(cat);
      }

      const generic_name = (row.generic_name || row['Generic Name'] || row.salt_composition || row['Generic / Composition'] || '').trim();
      const brand = (row.brand || row['Brand'] || '').trim();
      const manufacturer = (row.manufacturer || row['Manufacturer'] || '').trim();
      const dosage_form = (row.dosage_form || row['Dosage Form'] || 'Tablet').trim();
      const strength = (row.strength || row['Strength'] || '').trim();
      const pack_size = parseInt(row.pack_size || row['Pack Size'] || 10) || 10;
      const unit = (row.unit || row['Unit'] || 'Strips').trim();
      const barcode = (row.barcode || row['Barcode'] || '').trim();
      const hsn_code = (row.hsn_code || row['HSN Code'] || '3004').trim();
      const gst_rate = parseFloat(row.gst_rate !== undefined ? row.gst_rate : (row['GST Rate (%)'] || 12.0)) || 12.0;
      const schedule_type = normalizeSchedule(row.schedule_type || row['Drug Schedule'] || row.schedule || 'NONE');
      
      const rxVal = String(row.is_prescription_required || row['Prescription Required (YES/NO)'] || row['Prescription Required'] || '').toUpperCase();
      const is_prescription_required = rxVal === 'YES' || rxVal === 'TRUE' || rxVal === '1' || schedule_type !== 'NONE';
      const reorder_level = parseInt(row.reorder_level || row['Reorder Level'] || 15) || 15;
      const storage_temperature = (row.storage_temperature || row['Storage Temp'] || 'Room Temperature').trim();

      // Check duplicate medicine in shop
      let targetMed = memStore.medicines.find(
        (m) =>
          m.shop_id === currentShopId &&
          m.name.toLowerCase() === name.toLowerCase() &&
          (m.strength || '').toLowerCase() === strength.toLowerCase()
      );

      if (targetMed) {
        if (updateDuplicates) {
          targetMed.generic_name = generic_name || targetMed.generic_name;
          targetMed.brand = brand || targetMed.brand;
          targetMed.manufacturer = manufacturer || targetMed.manufacturer;
          targetMed.category_id = cat.id;
          targetMed.dosage_form = dosage_form;
          targetMed.pack_size = pack_size;
          targetMed.unit = unit;
          targetMed.hsn_code = hsn_code;
          targetMed.gst_rate = gst_rate;
          targetMed.schedule_type = schedule_type;
          targetMed.is_prescription_required = is_prescription_required;
          targetMed.reorder_level = reorder_level;
          targetMed.storage_temperature = storage_temperature;
          if (barcode) targetMed.barcode = barcode;
          targetMed.is_active = true;
          targetMed.updated_at = new Date().toISOString();
          results.updated++;
        }
      } else {
        targetMed = {
          id: `med-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          shop_id: currentShopId,
          name,
          generic_name,
          brand,
          manufacturer,
          category_id: cat.id,
          salt_composition: generic_name,
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
          is_active: true,
          created_at: new Date().toISOString(),
        };
        memStore.medicines.unshift(targetMed);
        results.created++;
      }

      // Handle batch if batch_no and expiry_date are provided
      const batch_no = (row.batch_no || row['Batch No'] || '').trim();
      let expiry_date = (row.expiry_date || row['Expiry Date (YYYY-MM-DD)'] || row['Expiry Date'] || '').trim();
      const mfg_date = (row.mfg_date || row['Mfg Date (YYYY-MM-DD)'] || row['Mfg Date'] || '').trim() || null;
      const purchase_cost = parseFloat(row.purchase_cost || row['Purchase Cost (Rs)'] || row['Purchase Cost'] || 0) || 0;
      const mrp = parseFloat(row.mrp || row['MRP (Rs)'] || row['MRP'] || 0) || 0;
      const selling_price = parseFloat(row.selling_price || row['Selling Price (Rs)'] || row['Selling Price'] || mrp) || mrp;
      const initial_stock = parseInt(row.initial_stock || row['Initial Stock Qty'] || row['Stock'] || row.current_stock || 0) || 0;
      const rack_shelf = (row.rack_shelf || row['Rack Shelf'] || '').trim();

      if (batch_no) {
        // Date formatting normalization if DD/MM/YYYY or DD-MM-YYYY was entered
        if (expiry_date && expiry_date.includes('/')) {
          const parts = expiry_date.split('/');
          if (parts.length === 3 && parts[2].length === 4) {
            expiry_date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }

        if (!expiry_date) {
          // Default expiry 2 years in future if missing
          const d = new Date();
          d.setFullYear(d.getFullYear() + 2);
          expiry_date = d.toISOString().slice(0, 10);
        }

        // Check if batch already exists
        let existingBatch = memStore.batches.find(
          (b) => b.shop_id === currentShopId && b.medicine_id === targetMed.id && b.batch_no.toLowerCase() === batch_no.toLowerCase()
        );

        if (existingBatch) {
          if (initial_stock > 0) {
            existingBatch.current_stock = (Number(existingBatch.current_stock) || 0) + initial_stock;
          }
          if (mrp > 0) existingBatch.mrp = mrp;
          if (selling_price > 0) existingBatch.selling_price = selling_price;
          if (purchase_cost > 0) existingBatch.purchase_cost = purchase_cost;
          if (rack_shelf) existingBatch.rack_shelf = rack_shelf;
        } else {
          const newBatch = {
            id: `b-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            shop_id: currentShopId,
            medicine_id: targetMed.id,
            batch_no,
            mfg_date,
            expiry_date,
            purchase_cost,
            mrp: mrp || selling_price,
            selling_price: selling_price || mrp,
            current_stock: initial_stock,
            rack_shelf,
            is_blocked: false,
            created_at: new Date().toISOString(),
          };
          memStore.batches.push(newBatch);
          results.batchesAdded++;
        }
      }

      results.importedMedicines.push(enrichMedicine(targetMed));
    } catch (err) {
      results.errors.push({ row: rowNum, error: err.message });
      results.skipped++;
    }
  });

  // Audit log for bulk upload
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: currentShopId,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'BULK_IMPORT_MEDICINES',
    entity_type: 'MEDICINE',
    entity_id: `bulk-${Date.now()}`,
    new_values: {
      total: results.total,
      created: results.created,
      updated: results.updated,
      batchesAdded: results.batchesAdded,
      skipped: results.skipped,
    },
    created_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: `Successfully processed ${results.total} medicines: ${results.created} created, ${results.updated} updated, ${results.batchesAdded} batches added.`,
    ...results,
  });
});

// POST /api/medicines/bulk-upload (Raw text or CSV/XML upload parser endpoint)
router.post('/bulk-upload', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), (req, res) => {
  const { fileContent, fileType = 'csv', updateDuplicates = true } = req.body;
  const { parseCsv, parseExcelXml } = require('../utils/excelUtils');

  if (!fileContent) {
    return res.status(400).json({ error: 'File content is empty or missing' });
  }

  let table = [];
  if (fileType === 'xml' || fileContent.includes('<?xml') || fileContent.includes('<Workbook')) {
    table = parseExcelXml(fileContent);
  } else {
    table = parseCsv(fileContent);
  }

  if (!table || table.length < 2) {
    return res.status(400).json({ error: 'Spreadsheet has no data rows' });
  }

  const headers = table[0].map((h) => String(h).trim());
  let dataRows = table.slice(1);

  // If second row is the instruction row, skip it
  if (
    dataRows.length > 0 &&
    (dataRows[0][0] || '').toLowerCase().includes('required')
  ) {
    dataRows = dataRows.slice(1);
  }

  const structuredList = dataRows.map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });

  req.body.medicines = structuredList;
  req.body.updateDuplicates = updateDuplicates;

  // Forward to bulk-import handler
  return router.handle(
    {
      ...req,
      url: '/bulk-import',
      method: 'POST',
      body: { medicines: structuredList, updateDuplicates },
    },
    res
  );
});

// DELETE /api/medicines/:id
router.delete('/:id', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN']), (req, res) => {
  const index = memStore.medicines.findIndex((m) => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Medicine not found' });

  // Soft delete / flag inactive
  memStore.medicines[index].is_active = false;

  res.status(204).end();
});

module.exports = router;

