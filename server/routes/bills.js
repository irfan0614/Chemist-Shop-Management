const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

function rowToBill(row, items) {
  return {
    id: row.id,
    billNo: row.bill_no,
    date: row.bill_date instanceof Date ? row.bill_date.toISOString().slice(0, 10) : row.bill_date,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    subtotal: Number(row.subtotal),
    gstTotal: Number(row.gst_total),
    discount: Number(row.discount),
    total: Number(row.total),
    items: (items || []).map(it => ({
      medicineId: it.medicine_id,
      name: it.name,
      qty: it.qty,
      price: Number(it.price),
      gst: Number(it.gst),
    })),
  };
}

// GET /api/bills — list (without item detail, for the history table)
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, COUNT(bi.id)::int AS item_count
       FROM bills b LEFT JOIN bill_items bi ON bi.bill_id = b.id
       GROUP BY b.id ORDER BY b.created_at DESC`
    );
    res.json(rows.map(r => ({ ...rowToBill(r, []), itemCount: r.item_count })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load bills' });
  }
});

// GET /api/bills/:id — full detail with items, for printing
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Bill not found' });
    const { rows: items } = await pool.query('SELECT * FROM bill_items WHERE bill_id = $1', [req.params.id]);
    res.json(rowToBill(rows[0], items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load bill' });
  }
});

// POST /api/bills — create a bill, deduct stock, bump bill counter (all in one transaction)
router.post('/', async (req, res) => {
  const { customerName, customerPhone, discount, items, date } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required and cannot be empty' });
  }
  // Prefer the shop's own local calendar date (sent by the client) over the DB
  // server's CURRENT_DATE, which may be on a different timezone (e.g. UTC on
  // Supabase) and roll over at the wrong local time for the shop.
  const billDate = date || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock settings row and get bill numbering info
    const settingsRes = await client.query('SELECT * FROM settings WHERE id = 1 FOR UPDATE');
    const settings = settingsRes.rows[0];
    const billNo = `${settings.bill_prefix}-${String(settings.bill_counter).padStart(4, '0')}`;

    let subtotal = 0, gstTotal = 0;
    const resolvedItems = [];

    for (const it of items) {
      const medRes = await client.query('SELECT * FROM medicines WHERE id = $1 FOR UPDATE', [it.medicineId]);
      if (medRes.rows.length === 0) {
        throw new Error(`Medicine ${it.medicineId} not found`);
      }
      const med = medRes.rows[0];
      if (med.qty < it.qty) {
        throw new Error(`Not enough stock for ${med.name} (have ${med.qty}, need ${it.qty})`);
      }
      const price = Number(med.selling_price);
      const gst = Number(med.gst);
      subtotal += price * it.qty;
      gstTotal += price * it.qty * (gst / 100);
      resolvedItems.push({ medicineId: med.id, name: med.name, qty: it.qty, price, gst });

      await client.query('UPDATE medicines SET qty = qty - $1, updated_at = now() WHERE id = $2', [it.qty, med.id]);
    }

    const discountAmt = Number(discount) || 0;
    const total = Math.max(0, subtotal + gstTotal - discountAmt);

    const billRes = await client.query(
      `INSERT INTO bills (bill_no, bill_date, customer_name, customer_phone, subtotal, gst_total, discount, total)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3,$4,$5,$6,$7,$8) RETURNING *`,
      [billNo, billDate, customerName || '', customerPhone || '', subtotal, gstTotal, discountAmt, total]
    );
    const bill = billRes.rows[0];

    for (const it of resolvedItems) {
      await client.query(
        `INSERT INTO bill_items (bill_id, medicine_id, name, qty, price, gst) VALUES ($1,$2,$3,$4,$5,$6)`,
        [bill.id, it.medicineId, it.name, it.qty, it.price, it.gst]
      );
    }

    await client.query('UPDATE settings SET bill_counter = bill_counter + 1 WHERE id = 1');

    await client.query('COMMIT');
    res.status(201).json(rowToBill(bill, resolvedItems));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create bill' });
  } finally {
    client.release();
  }
});

module.exports = router;