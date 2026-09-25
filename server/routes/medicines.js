const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// GET /api/medicines/categories
router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    const { rows } = await query(
      `SELECT * FROM categories WHERE ($1::uuid IS NULL OR shop_id = $1 OR shop_id IS NULL) ORDER BY name ASC`,
      [currentShopId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Failed to retrieve categories: ' + err.message });
  }
});

// POST /api/medicines/categories
router.post('/categories', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO categories (name, description, shop_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING *`,
      [name.trim(), description ? description.trim() : '', currentShopId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category: ' + err.message });
  }
});

// GET /api/medicines - Master Catalog + Live Stock aggregations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    const { search, category, schedule, prescription, inStock } = req.query;

    let sql = `
      SELECT m.id, m.name, m.generic_name, m.brand, m.manufacturer, m.category_id,
             m.salt_composition, m.dosage_form, m.strength, m.pack_size, m.unit,
             m.barcode, m.hsn_code, m.gst_rate, m.schedule_type, m.is_prescription_required,
             m.reorder_level, m.storage_temperature, m.is_active, m.shop_id,
             c.name as "categoryName",
             COALESCE(SUM(b.current_stock) FILTER (WHERE NOT b.is_blocked), 0)::int as "totalStock",
             MIN(b.expiry_date) FILTER (WHERE NOT b.is_blocked AND b.current_stock > 0) as "earliestExpiry",
             COALESCE(MIN(b.selling_price) FILTER (WHERE NOT b.is_blocked), 0)::float as "sellingPrice",
             COALESCE(MAX(b.mrp) FILTER (WHERE NOT b.is_blocked), 0)::float as mrp,
             COUNT(b.id)::int as "batchCount"
      FROM medicines m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN medicine_batches b ON b.medicine_id = m.id AND ($1::uuid IS NULL OR b.shop_id = $1)
      WHERE m.is_active = true
    `;
    const params = [currentShopId];

    if (currentShopId) {
      params.push(currentShopId);
      sql += ` AND m.shop_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(m.name) LIKE $${params.length} OR
        lower(m.generic_name) LIKE $${params.length} OR
        m.barcode LIKE $${params.length} OR
        lower(m.salt_composition) LIKE $${params.length} OR
        lower(m.brand) LIKE $${params.length}
      )`;
    }

    if (category) {
      params.push(category);
      sql += ` AND m.category_id = $${params.length}`;
    }

    if (schedule && schedule !== 'ALL') {
      params.push(schedule);
      sql += ` AND m.schedule_type = $${params.length}`;
    }

    if (prescription === 'true') {
      sql += ` AND m.is_prescription_required = true`;
    }

    sql += ` GROUP BY m.id, c.name`;

    if (inStock === 'true') {
      sql += ` HAVING COALESCE(SUM(b.current_stock) FILTER (WHERE NOT b.is_blocked), 0) > 0`;
    }

    sql += ` ORDER BY m.name ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get medicines error:', err);
    res.status(500).json({ error: 'Failed to retrieve medicines: ' + err.message });
  }
});

// GET /api/medicines/:id - Single detail with batches
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    const { rows: meds } = await query(
      `SELECT m.*, c.name as "categoryName"
       FROM medicines m
       LEFT JOIN categories c ON m.category_id = c.id
       WHERE m.id = $1 AND ($2::uuid IS NULL OR m.shop_id = $2)`,
      [req.params.id, currentShopId]
    );

    if (meds.length === 0) return res.status(404).json({ error: 'Medicine not found' });

    const med = meds[0];
    const { rows: batches } = await query(
      `SELECT id, batch_no as "batchNo", mfg_date as "mfgDate", expiry_date as "expiryDate",
              purchase_cost as "purchaseCost", mrp, selling_price as "sellingPrice",
              current_stock as "currentStock", rack_shelf as "rackShelf", is_blocked as "isBlocked"
       FROM medicine_batches
       WHERE medicine_id = $1 AND ($2::uuid IS NULL OR shop_id = $2)
       ORDER BY expiry_date ASC`,
      [med.id, currentShopId]
    );

    const totalStock = batches.reduce((s, b) => s + (b.isBlocked ? 0 : Number(b.currentStock || 0)), 0);

    res.json({
      ...med,
      totalStock,
      batches,
    });
  } catch (err) {
    console.error('Get medicine detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve medicine details: ' + err.message });
  }
});

// POST /api/medicines - Add new medicine
router.post('/', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  const {
    name,
    generic_name,
    genericName = generic_name,
    brand = '',
    manufacturer = '',
    category_id,
    categoryId = category_id,
    salt_composition,
    saltComposition = salt_composition,
    dosage_form,
    dosageForm = dosage_form || 'Tablet',
    strength = '',
    pack_size,
    packSize = pack_size || 10,
    unit = 'Strips',
    barcode = '',
    hsn_code,
    hsnCode = hsn_code || '3004',
    gst_rate,
    gstRate = gst_rate !== undefined ? gst_rate : 12.0,
    schedule_type,
    scheduleType = schedule_type || 'NONE',
    is_prescription_required,
    isPrescriptionRequired = is_prescription_required || false,
    reorder_level,
    reorderLevel = reorder_level !== undefined ? reorder_level : 15,
    storage_temperature,
    storageTemperature = storage_temperature || 'Room Temperature',
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Medicine commercial name is required' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO medicines (
        shop_id, name, generic_name, brand, manufacturer, category_id,
        salt_composition, dosage_form, strength, pack_size, unit,
        barcode, hsn_code, gst_rate, schedule_type, is_prescription_required,
        reorder_level, storage_temperature, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, true
      ) RETURNING *`,
      [
        currentShopId,
        name.trim(),
        (genericName || '').trim(),
        brand ? brand.trim() : '',
        manufacturer ? manufacturer.trim() : '',
        categoryId || null,
        saltComposition ? saltComposition.trim() : '',
        dosageForm,
        strength ? strength.trim() : '',
        parseInt(packSize) || 10,
        unit,
        barcode ? barcode.trim() : '',
        hsnCode,
        parseFloat(gstRate) || 12.0,
        scheduleType,
        Boolean(isPrescriptionRequired),
        parseInt(reorderLevel) || 15,
        storageTemperature,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create medicine error:', err);
    res.status(500).json({ error: 'Failed to create medicine: ' + err.message });
  }
});

// PUT /api/medicines/:id
router.put('/:id', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  const {
    name,
    generic_name,
    genericName = generic_name,
    brand,
    manufacturer,
    category_id,
    categoryId = category_id,
    salt_composition,
    saltComposition = salt_composition,
    dosage_form,
    dosageForm = dosage_form,
    strength,
    pack_size,
    packSize = pack_size,
    unit,
    barcode,
    hsn_code,
    hsnCode = hsn_code,
    gst_rate,
    gstRate = gst_rate,
    schedule_type,
    scheduleType = schedule_type,
    is_prescription_required,
    isPrescriptionRequired = is_prescription_required,
    reorder_level,
    reorderLevel = reorder_level,
    storage_temperature,
    storageTemperature = storage_temperature,
  } = req.body;

  try {
    const { rows } = await query(
      `UPDATE medicines SET
        name = COALESCE($1, name),
        generic_name = COALESCE($2, generic_name),
        brand = COALESCE($3, brand),
        manufacturer = COALESCE($4, manufacturer),
        category_id = COALESCE($5, category_id),
        salt_composition = COALESCE($6, salt_composition),
        dosage_form = COALESCE($7, dosage_form),
        strength = COALESCE($8, strength),
        pack_size = COALESCE($9, pack_size),
        unit = COALESCE($10, unit),
        barcode = COALESCE($11, barcode),
        hsn_code = COALESCE($12, hsn_code),
        gst_rate = COALESCE($13, gst_rate),
        schedule_type = COALESCE($14, schedule_type),
        is_prescription_required = COALESCE($15, is_prescription_required),
        reorder_level = COALESCE($16, reorder_level),
        storage_temperature = COALESCE($17, storage_temperature),
        updated_at = now()
       WHERE id = $18 AND ($19::uuid IS NULL OR shop_id = $19)
       RETURNING *`,
      [
        name ? name.trim() : null,
        genericName !== undefined ? genericName.trim() : null,
        brand !== undefined ? brand.trim() : null,
        manufacturer !== undefined ? manufacturer.trim() : null,
        categoryId !== undefined ? categoryId : null,
        saltComposition !== undefined ? saltComposition.trim() : null,
        dosageForm || null,
        strength !== undefined ? strength.trim() : null,
        packSize ? parseInt(packSize) : null,
        unit || null,
        barcode !== undefined ? barcode.trim() : null,
        hsnCode || null,
        gstRate !== undefined ? parseFloat(gstRate) : null,
        scheduleType || null,
        isPrescriptionRequired !== undefined ? Boolean(isPrescriptionRequired) : null,
        reorderLevel !== undefined ? parseInt(reorderLevel) : null,
        storageTemperature !== undefined ? storageTemperature : null,
        req.params.id,
        currentShopId,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Medicine not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update medicine error:', err);
    res.status(500).json({ error: 'Failed to update medicine: ' + err.message });
  }
});

// PUT /api/medicines/:id/toggle-active
router.put('/:id/toggle-active', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  try {
    const { rows } = await query(
      `UPDATE medicines
       SET is_active = NOT is_active, updated_at = now()
       WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)
       RETURNING id, is_active`,
      [req.params.id, currentShopId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Medicine not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Toggle active error:', err);
    res.status(500).json({ error: 'Failed to toggle medicine status: ' + err.message });
  }
});

// POST /api/medicines/bulk-import - Batch Excel/CSV import to DB
router.post('/bulk-import', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  const { medicines: importList } = req.body;

  if (!Array.isArray(importList) || importList.length === 0) {
    return res.status(400).json({ error: 'An array of medicine rows is required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');
    let importedCount = 0;
    let batchCount = 0;

    for (const row of importList) {
      const name = (row.name || row.medicine_name || '').trim();
      if (!name) continue;

      const { rows: medRows } = await client.query(
        `INSERT INTO medicines (
          shop_id, name, generic_name, brand, manufacturer, salt_composition,
          dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate,
          schedule_type, is_prescription_required, reorder_level, storage_temperature, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true
        ) RETURNING id`,
        [
          currentShopId,
          name,
          row.generic_name || '',
          row.brand || '',
          row.manufacturer || '',
          row.salt_composition || '',
          row.dosage_form || 'Tablet',
          row.strength || '',
          parseInt(row.pack_size) || 10,
          row.unit || 'Strips',
          row.barcode || '',
          row.hsn_code || '3004',
          parseFloat(row.gst_rate) || 12.0,
          row.schedule_type || 'NONE',
          Boolean(row.is_prescription_required),
          parseInt(row.reorder_level) || 15,
          row.storage_temperature || 'Room Temperature',
        ]
      );

      const medId = medRows[0].id;
      importedCount++;

      // If row has batch info, insert batch
      if (row.batch_no && row.expiry_date) {
        await client.query(
          `INSERT INTO medicine_batches (
            shop_id, medicine_id, batch_no, mfg_date, expiry_date,
            purchase_cost, mrp, selling_price, current_stock, rack_shelf, is_blocked
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
          ON CONFLICT (medicine_id, batch_no) DO UPDATE SET
            current_stock = medicine_batches.current_stock + EXCLUDED.current_stock`,
          [
            currentShopId,
            medId,
            row.batch_no.trim(),
            row.mfg_date || null,
            row.expiry_date,
            parseFloat(row.purchase_cost) || 0.0,
            parseFloat(row.mrp) || 0.0,
            parseFloat(row.selling_price) || parseFloat(row.mrp) || 0.0,
            parseInt(row.current_stock) || 0,
            row.rack_shelf || '',
          ]
        );
        batchCount++;
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Successfully imported ${importedCount} medicines and ${batchCount} batches into database.`,
      importedCount,
      batchCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Bulk import failed: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
