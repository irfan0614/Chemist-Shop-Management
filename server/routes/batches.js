const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
}

function getBatchStatus(expiryDate, currentStock, reorderLevel = 15) {
  const days = getDaysUntil(expiryDate);
  let status = 'OK';
  if (days < 0) status = 'EXPIRED';
  else if (days <= 90) status = 'NEAR_EXPIRY';

  const isLowStock = Number(currentStock) <= Number(reorderLevel);
  return { status, daysLeft: days, isLowStock };
}

// GET /api/batches - List all batches with filters (Tenant Scoped)
router.get('/', authMiddleware, (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    const { medicineId, search, status, rack } = req.query;
    let list = memStore.batches;

    if (currentShopId) {
      list = list.filter((b) => b.shop_id === currentShopId);
    }

    if (medicineId) {
      list = list.filter((b) => b.medicine_id === medicineId);
    }

    if (rack) {
      list = list.filter((b) => (b.rack_shelf || '').toLowerCase().includes(rack.toLowerCase()));
    }

    let enriched = list.map((b) => {
      const med = memStore.medicines.find((m) => m.id === b.medicine_id && (!currentShopId || m.shop_id === currentShopId)) || {};
      const { status: expStatus, daysLeft, isLowStock } = getBatchStatus(b.expiry_date, b.current_stock, med.reorder_level);
      return {
        id: b.id,
        medicineId: b.medicine_id,
        medicineName: med.name || 'Unknown',
        genericName: med.generic_name || '',
        brand: med.brand || '',
        dosageForm: med.dosage_form || 'Tablet',
        packSize: med.pack_size || 10,
        unit: med.unit || 'Strips',
        gstRate: med.gst_rate || 12.0,
        scheduleType: med.schedule_type || 'NONE',
        batchNo: b.batch_no,
        mfgDate: b.mfg_date,
        expiryDate: b.expiry_date,
        purchaseCost: Number(b.purchase_cost),
        mrp: Number(b.mrp),
        sellingPrice: Number(b.selling_price),
        currentStock: Number(b.current_stock),
        rackShelf: b.rack_shelf || '—',
        isBlocked: !!b.is_blocked,
        expiryStatus: expStatus,
        daysToExpiry: daysLeft,
        isLowStock,
      };
    });

    if (search) {
      const q = search.trim().toLowerCase();
      enriched = enriched.filter(
        (b) =>
          b.medicineName.toLowerCase().includes(q) ||
          b.genericName.toLowerCase().includes(q) ||
          b.batchNo.toLowerCase().includes(q) ||
          b.rackShelf.toLowerCase().includes(q)
      );
    }

    if (status === 'EXPIRED') {
      enriched = enriched.filter((b) => b.expiryStatus === 'EXPIRED');
    } else if (status === 'NEAR_EXPIRY') {
      enriched = enriched.filter((b) => b.expiryStatus === 'NEAR_EXPIRY');
    } else if (status === 'LOW_STOCK') {
      enriched = enriched.filter((b) => b.isLowStock);
    }

    // Sort FEFO by default (Earliest expiring first)
    enriched.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load batch inventory' });
  }
});

// GET /api/batches/fefo/:medicineId - Get FEFO batches for POS
router.get('/fefo/:medicineId', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const { medicineId } = req.params;
  const batches = memStore.batches
    .filter(
      (b) =>
        b.medicine_id === medicineId &&
        (!currentShopId || b.shop_id === currentShopId) &&
        !b.is_blocked &&
        Number(b.current_stock) > 0
    )
    .map((b) => {
      const days = getDaysUntil(b.expiry_date);
      return {
        id: b.id,
        batchNo: b.batch_no,
        expiryDate: b.expiry_date,
        purchaseCost: Number(b.purchase_cost),
        mrp: Number(b.mrp),
        sellingPrice: Number(b.selling_price),
        currentStock: Number(b.current_stock),
        rackShelf: b.rack_shelf,
        daysLeft: days,
        isExpired: days < 0,
      };
    })
    .filter((b) => !b.isExpired) // Block expired batches from POS
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  res.json(batches);
});

// POST /api/batches - Add a new batch manually
router.post('/', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN']), (req, res) => {
  const { medicineId, batchNo, mfgDate, expiryDate, purchaseCost, mrp, sellingPrice, currentStock, rackShelf } = req.body;

  if (!medicineId || !batchNo || !expiryDate || currentStock === undefined) {
    return res.status(400).json({ error: 'Medicine, batch number, expiry date, and current stock are required' });
  }

  const existing = memStore.batches.find(
    (b) => b.medicine_id === medicineId && b.batch_no.toLowerCase() === batchNo.trim().toLowerCase()
  );

  if (existing) {
    return res.status(400).json({ error: `Batch "${batchNo}" already exists for this medicine. Update stock instead.` });
  }

  const newBatch = {
    id: `b-${Date.now()}`,
    medicine_id: medicineId,
    batch_no: batchNo.trim(),
    mfg_date: mfgDate || null,
    expiry_date: expiryDate,
    purchase_cost: parseFloat(purchaseCost) || 0,
    mrp: parseFloat(mrp) || parseFloat(sellingPrice) || 0,
    selling_price: parseFloat(sellingPrice) || parseFloat(mrp) || 0,
    current_stock: parseInt(currentStock) || 0,
    rack_shelf: (rackShelf || '').trim(),
    is_blocked: false,
  };

  memStore.batches.push(newBatch);

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'CREATE_BATCH',
    entity_type: 'BATCH',
    entity_id: newBatch.id,
    new_values: { batch_no: newBatch.batch_no, stock: newBatch.current_stock },
    created_at: new Date().toISOString(),
  });

  res.status(201).json(newBatch);
});

// PUT /api/batches/:id/adjust-stock - Stock adjustment (Physical audit verification)
router.put('/:id/adjust-stock', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN']), (req, res) => {
  const batch = memStore.batches.find((b) => b.id === req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const { newStock, reason } = req.body;
  if (newStock === undefined || newStock < 0) {
    return res.status(400).json({ error: 'Valid non-negative stock count is required' });
  }

  const oldStock = Number(batch.current_stock);
  const diff = Number(newStock) - oldStock;
  batch.current_stock = parseInt(newStock);

  // Record audit & stock movement
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'STOCK_ADJUSTMENT',
    entity_type: 'BATCH',
    entity_id: batch.id,
    old_values: { stock: oldStock },
    new_values: { stock: batch.current_stock, difference: diff, reason: reason || 'Physical stock audit' },
    created_at: new Date().toISOString(),
  });

  res.json({
    id: batch.id,
    batchNo: batch.batch_no,
    oldStock,
    newStock: batch.current_stock,
    difference: diff,
    message: 'Stock adjusted successfully',
  });
});

// PUT /api/batches/:id/toggle-block - Block or unblock batch
router.put('/:id/toggle-block', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN']), (req, res) => {
  const batch = memStore.batches.find((b) => b.id === req.params.id);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  batch.is_blocked = !batch.is_blocked;
  res.json({ id: batch.id, isBlocked: batch.is_blocked });
});

module.exports = router;
