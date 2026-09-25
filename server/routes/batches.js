const express = require('express');
const { query, connect } = require('../db/pool');
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

// GET /api/batches - List all batches with filters (Database Driven)
router.get('/', async (req, res) => {
  try {
    const currentShopId = tenantShopId(req);
    const { medicineId, search, status, rack } = req.query;

    let sql = `
      SELECT b.id, b.medicine_id as "medicineId", b.batch_no as "batchNo",
             b.mfg_date as "mfgDate", b.expiry_date as "expiryDate",
             b.purchase_cost::float as "purchaseCost", b.mrp::float as mrp,
             b.selling_price::float as "sellingPrice", b.current_stock as "currentStock",
             b.rack_shelf as "rackShelf", b.is_blocked as "isBlocked",
             m.name as "medicineName", m.generic_name as "genericName",
             m.brand, m.dosage_form as "dosageForm", m.pack_size as "packSize",
             m.unit, m.gst_rate as "gstRate", m.schedule_type as "scheduleType",
             m.reorder_level as "reorderLevel"
      FROM medicine_batches b
      JOIN medicines m ON b.medicine_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (currentShopId) {
      params.push(currentShopId);
      sql += ` AND b.shop_id = $${params.length}`;
    }

    if (medicineId) {
      params.push(medicineId);
      sql += ` AND b.medicine_id = $${params.length}`;
    }

    if (rack) {
      params.push(`%${rack.trim().toLowerCase()}%`);
      sql += ` AND lower(b.rack_shelf) LIKE $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(m.name) LIKE $${params.length} OR
        lower(m.generic_name) LIKE $${params.length} OR
        lower(b.batch_no) LIKE $${params.length} OR
        lower(b.rack_shelf) LIKE $${params.length}
      )`;
    }

    sql += ` ORDER BY b.expiry_date ASC`;

    const { rows } = await query(sql, params);

    let enriched = rows.map((b) => {
      const { status: expStatus, daysLeft, isLowStock } = getBatchStatus(
        b.expiryDate,
        b.currentStock,
        b.reorderLevel
      );
      return {
        ...b,
        rackShelf: b.rackShelf || '—',
        expiryStatus: expStatus,
        daysToExpiry: daysLeft,
        isLowStock,
      };
    });

    if (status === 'EXPIRED') {
      enriched = enriched.filter((b) => b.expiryStatus === 'EXPIRED');
    } else if (status === 'NEAR_EXPIRY') {
      enriched = enriched.filter((b) => b.expiryStatus === 'NEAR_EXPIRY');
    } else if (status === 'LOW_STOCK') {
      enriched = enriched.filter((b) => b.isLowStock);
    }

    res.json(enriched);
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({ error: 'Failed to load batch inventory: ' + err.message });
  }
});

// PUT /api/batches/:id/stock - Stock Adjustment with Audit
router.put('/:id/stock', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  const { newStock, reason = 'Physical Count Adjustment', notes = '' } = req.body;

  if (newStock === undefined || parseInt(newStock) < 0) {
    return res.status(400).json({ error: 'Valid non-negative stock quantity is required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: batchRows } = await client.query(
      `SELECT * FROM medicine_batches WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)`,
      [req.params.id, currentShopId]
    );

    if (batchRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found' });
    }

    const batch = batchRows[0];
    const prevStock = Number(batch.current_stock);
    const targetStock = parseInt(newStock);
    const diff = targetStock - prevStock;

    const { rows: updatedRows } = await client.query(
      `UPDATE medicine_batches SET current_stock = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [targetStock, batch.id]
    );

    // Record Stock Movement
    await client.query(
      `INSERT INTO stock_movements (
        shop_id, medicine_id, batch_id, movement_type, quantity,
        balance_after, reference_no, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        currentShopId,
        batch.medicine_id,
        batch.id,
        diff >= 0 ? 'AUDIT_ADD' : 'AUDIT_REDUCE',
        Math.abs(diff),
        targetStock,
        'STOCK_ADJUSTMENT',
        `${reason}: ${notes}`,
      ]
    ).catch(() => {});

    await client.query('COMMIT');
    res.json({
      message: 'Batch stock adjusted successfully',
      batch: updatedRows[0],
      previousStock: prevStock,
      newStock: targetStock,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Adjust stock error:', err);
    res.status(500).json({ error: 'Failed to adjust stock: ' + err.message });
  } finally {
    client.release();
  }
});

// PUT /api/batches/:id/toggle-block - Lock batch from dispensing
router.put('/:id/toggle-block', requireRole(['SHOP_OWNER', 'ADMIN']), async (req, res) => {
  const currentShopId = tenantShopId(req);
  try {
    const { rows } = await query(
      `UPDATE medicine_batches
       SET is_blocked = NOT is_blocked, updated_at = now()
       WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)
       RETURNING id, is_blocked as "isBlocked"`,
      [req.params.id, currentShopId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Batch not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Toggle batch lock error:', err);
    res.status(500).json({ error: 'Failed to update batch lock status: ' + err.message });
  }
});

module.exports = router;
