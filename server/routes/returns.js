const express = require('express');
const { query, connect } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/returns/sales - List patient returns
router.get('/sales', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows: returns } = await query(
      `SELECT r.id, r.shop_id as "shopId", r.return_no, r.return_no as "returnNo",
              si.invoice_no, si.invoice_no as "invoiceNo",
              COALESCE(c.name, si.customer_name, 'Walk-in') as customer_name,
              COALESCE(c.name, si.customer_name, 'Walk-in') as "customerName",
              r.return_date, r.return_date as "returnDate",
              r.subtotal::float, r.gst_total::float,
              r.refund_amount::float, r.refund_amount::float as "refundAmount",
              r.refund_mode, r.refund_mode as "refundMode",
              r.reason, r.status, r.created_at
       FROM sales_returns r
       JOIN sales_invoices si ON r.invoice_id = si.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE ($1::uuid IS NULL OR r.shop_id = $1)
       ORDER BY r.return_date DESC, r.created_at DESC`,
      [shopId]
    );

    // Fetch items for each return
    for (const ret of returns) {
      const { rows: items } = await query(
        `SELECT sri.id, sri.medicine_id as "medicineId", m.name as "medicineName",
                sri.batch_id as "batchId", b.batch_no as "batchNo",
                sri.return_qty as "returnQty", sri.return_qty as qty,
                sri.unit_price::float as "unitPrice", sri.refund_amount::float as "refundAmount",
                sri.restock_condition as "restockCondition",
                (sri.restock_condition = 'RESTOCKED') as "isRestocked"
         FROM sales_return_items sri
         JOIN medicines m ON sri.medicine_id = m.id
         LEFT JOIN medicine_batches b ON sri.batch_id = b.id
         WHERE sri.return_id = $1
         ORDER BY sri.id ASC`,
        [ret.id]
      );
      ret.items = items;
    }

    res.json(returns);
  } catch (err) {
    console.error('Get sales returns error:', err);
    res.status(500).json({ error: 'Failed to retrieve sales returns: ' + err.message });
  }
});

// POST /api/returns/sales - Process customer sales return
router.post('/sales', requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const { invoiceNo, items, refundMode = 'CASH', reason } = req.body;

  if (!invoiceNo || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invoice number and returned items are required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch original invoice
    const { rows: invRows } = await client.query(
      `SELECT * FROM sales_invoices WHERE invoice_no = $1 AND ($2::uuid IS NULL OR shop_id = $2)`,
      [invoiceNo.trim(), shopId]
    );

    if (invRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Original invoice "${invoiceNo}" not found` });
    }

    const invoice = invRows[0];

    // Fetch invoice items
    const { rows: origItems } = await client.query(
      `SELECT * FROM sales_invoice_items WHERE invoice_id = $1`,
      [invoice.id]
    );

    let totalRefund = 0;
    const processedItems = [];

    for (const it of items) {
      const origItem = origItems.find((i) => i.medicine_id === it.medicineId && i.batch_id === it.batchId);
      if (!origItem) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Medicine batch not found in original invoice: ${it.medicineId}` });
      }

      const returnQty = parseInt(it.returnQty) || 0;
      if (returnQty <= 0 || returnQty > origItem.qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Invalid return quantity for ${origItem.medicine_name}. Sold: ${origItem.qty}, Returned: ${returnQty}`,
        });
      }

      const unitPrice = Number(origItem.unit_price || 0);
      const lineRefund = returnQty * unitPrice;
      totalRefund += lineRefund;

      const restockCondition = it.restockCondition === 'DAMAGED_WRITE_OFF' ? 'DAMAGED_WRITE_OFF' : 'RESTOCKED';

      // Restock batch if not damaged
      if (restockCondition === 'RESTOCKED' && origItem.batch_id) {
        await client.query(
          `UPDATE medicine_batches SET current_stock = current_stock + $1, updated_at = now() WHERE id = $2`,
          [returnQty, origItem.batch_id]
        );

        // Record stock movement
        await client.query(
          `INSERT INTO stock_movements (
            shop_id, medicine_id, batch_id, movement_type, qty, balance_after, reference_no, reason
          ) VALUES ($1, $2, $3, 'SALE_RETURN', $4, (SELECT current_stock FROM medicine_batches WHERE id = $3), $5, $6)`,
          [shopId, origItem.medicine_id, origItem.batch_id, returnQty, invoiceNo, 'Customer sales return restock']
        ).catch(() => {});
      }

      processedItems.push({
        invoiceItemId: origItem.id,
        medicineId: origItem.medicine_id,
        medicineName: origItem.medicine_name,
        batchId: origItem.batch_id,
        returnQty,
        unitPrice,
        refundAmount: lineRefund,
        restockCondition,
      });
    }

    // 2. Generate Return No using shop counter
    let returnCounter = 1;
    let returnPrefix = 'SRT';
    if (shopId) {
      const { rows: shopRows } = await client.query(
        `UPDATE shops SET return_counter = COALESCE(return_counter, 0) + 1 WHERE id = $1 RETURNING return_counter, return_prefix`,
        [shopId]
      );
      if (shopRows.length > 0) {
        returnCounter = shopRows[0].return_counter;
        returnPrefix = shopRows[0].return_prefix || 'SRT';
      }
    }
    const returnNo = `${returnPrefix}-${String(returnCounter).padStart(4, '0')}`;

    // 3. Insert Sales Return
    const { rows: retRows } = await client.query(
      `INSERT INTO sales_returns (
        shop_id, return_no, invoice_id, customer_id,
        return_date, refund_amount, refund_mode, reason, status
      ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, 'APPROVED')
      RETURNING *`,
      [
        shopId,
        returnNo,
        invoice.id,
        invoice.customer_id,
        totalRefund,
        refundMode,
        reason || 'Customer returned medicine',
      ]
    );

    const salesReturn = retRows[0];

    // 4. Insert Return Items
    for (const pItem of processedItems) {
      await client.query(
        `INSERT INTO sales_return_items (
          shop_id, return_id, invoice_item_id, medicine_id, batch_id,
          return_qty, unit_price, refund_amount, restock_condition
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          shopId,
          salesReturn.id,
          pItem.invoiceItemId,
          pItem.medicineId,
          pItem.batchId,
          pItem.returnQty,
          pItem.unitPrice,
          pItem.refundAmount,
          pItem.restockCondition,
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      ...salesReturn,
      invoice_no: invoice.invoice_no,
      items: processedItems,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sales return error:', err);
    res.status(500).json({ error: 'Failed to process return: ' + err.message });
  } finally {
    client.release();
  }
});

// GET /api/returns/purchases - List supplier purchase returns / debit notes
router.get('/purchases', async (req, res) => {
  const shopId = tenantShopId(req);
  try {
    const { rows: returns } = await query(
      `SELECT pr.id, pr.shop_id as "shopId", pr.return_no, pr.return_no as "returnNo",
              pr.purchase_id as "purchaseId", p.purchase_no as "purchaseNo",
              pr.supplier_id as "supplierId", s.name as supplier_name, s.name as "supplierName",
              s.company_name as "supplierCompany",
              pr.return_date, pr.return_date as "returnDate",
              pr.debit_note_no, pr.debit_note_no as "debitNoteNo",
              pr.total_amount::float, pr.total_amount::float as "totalAmount",
              pr.reason, pr.status, pr.created_at
       FROM purchase_returns pr
       JOIN suppliers s ON pr.supplier_id = s.id
       LEFT JOIN purchases p ON pr.purchase_id = p.id
       WHERE ($1::uuid IS NULL OR pr.shop_id = $1)
       ORDER BY pr.return_date DESC, pr.created_at DESC`,
      [shopId]
    );

    // Fetch items for each purchase return
    for (const ret of returns) {
      const { rows: items } = await query(
        `SELECT pri.id, pri.medicine_id as "medicineId", m.name as "medicineName",
                pri.batch_id as "batchId", b.batch_no as "batchNo",
                pri.return_qty as "returnQty", pri.purchase_cost::float as "purchaseCost",
                pri.gst_rate::float as "gstRate", pri.total_amount::float as "totalAmount",
                pri.return_reason as "returnReason"
         FROM purchase_return_items pri
         JOIN medicines m ON pri.medicine_id = m.id
         LEFT JOIN medicine_batches b ON pri.batch_id = b.id
         WHERE pri.return_id = $1
         ORDER BY pri.id ASC`,
        [ret.id]
      );
      ret.items = items;
    }

    res.json(returns);
  } catch (err) {
    console.error('Get purchase returns error:', err);
    res.status(500).json({ error: 'Failed to retrieve purchase returns: ' + err.message });
  }
});

// POST /api/returns/purchases - Inward/Outward Supplier Return & Debit Note
router.post('/purchases', requireRole(['SHOP_OWNER', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    supplierId,
    purchaseId = null,
    debitNoteNo = '',
    reason = 'Near Expiry / Expired / Damaged',
    items, // [{ medicineId, batchId, returnQty, purchaseCost, gstRate }]
  } = req.body;

  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Supplier and returned items are required' });
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    // 1. Validate Supplier
    const { rows: supRows } = await client.query(
      `SELECT * FROM suppliers WHERE id = $1 AND ($2::uuid IS NULL OR shop_id = $2)`,
      [supplierId, shopId]
    );
    if (supRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // 2. Validate Items & Batch Stock
    let totalDebitAmount = 0;
    const processedItems = [];

    for (const it of items) {
      const { rows: batchRows } = await client.query(
        `SELECT b.*, m.name as medicine_name, m.gst_rate
         FROM medicine_batches b
         JOIN medicines m ON b.medicine_id = m.id
         WHERE b.id = $1 AND ($2::uuid IS NULL OR b.shop_id = $2)`,
        [it.batchId, shopId]
      );

      if (batchRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Batch not found: ${it.batchId}` });
      }

      const batch = batchRows[0];
      const returnQty = parseInt(it.returnQty) || 0;

      if (returnQty <= 0 || returnQty > batch.current_stock) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for return of ${batch.medicine_name} (Batch #${batch.batch_no}). Available: ${batch.current_stock}, Requested: ${returnQty}`,
        });
      }

      const cost = Number(it.purchaseCost || batch.purchase_cost || 0);
      const gstRate = Number(it.gstRate || batch.gst_rate || 12.0);
      const lineTaxable = returnQty * cost;
      const lineGst = lineTaxable * (gstRate / 100);
      const lineTotal = lineTaxable + lineGst;
      totalDebitAmount += lineTotal;

      // Decrement Batch Stock
      await client.query(
        `UPDATE medicine_batches SET current_stock = current_stock - $1, updated_at = now() WHERE id = $2`,
        [returnQty, batch.id]
      );

      // Record Stock Movement
      await client.query(
        `INSERT INTO stock_movements (
          shop_id, medicine_id, batch_id, movement_type, qty, balance_after, reference_no, reason
        ) VALUES ($1, $2, $3, 'PURCHASE_RETURN', $4, (SELECT current_stock FROM medicine_batches WHERE id = $3), $5, $6)`,
        [shopId, batch.medicine_id, batch.id, -returnQty, debitNoteNo || 'DEBIT-NOTE', `Supplier return to ${supRows[0].name}`]
      ).catch(() => {});

      processedItems.push({
        medicineId: batch.medicine_id,
        medicineName: batch.medicine_name,
        batchId: batch.id,
        batchNo: batch.batch_no,
        returnQty,
        purchaseCost: cost,
        gstRate,
        totalAmount: lineTotal,
      });
    }

    // 3. Generate Return No
    const returnNo = `PRT-${Date.now().toString().slice(-6)}`;
    const finalDebitNoteNo = debitNoteNo ? debitNoteNo.trim() : `DBN-${Date.now().toString().slice(-6)}`;

    // 4. Insert Purchase Return
    const { rows: retRows } = await client.query(
      `INSERT INTO purchase_returns (
        shop_id, return_no, purchase_id, supplier_id, return_date,
        debit_note_no, total_amount, reason, status
      ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, 'COMPLETED')
      RETURNING *`,
      [
        shopId,
        returnNo,
        purchaseId || null,
        supplierId,
        finalDebitNoteNo,
        totalDebitAmount,
        reason,
      ]
    );

    const purchaseReturn = retRows[0];

    // 5. Insert Purchase Return Items
    for (const pItem of processedItems) {
      await client.query(
        `INSERT INTO purchase_return_items (
          shop_id, return_id, medicine_id, batch_id, return_qty,
          purchase_cost, gst_rate, total_amount, return_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          shopId,
          purchaseReturn.id,
          pItem.medicineId,
          pItem.batchId,
          pItem.returnQty,
          pItem.purchaseCost,
          pItem.gstRate,
          pItem.totalAmount,
          reason,
        ]
      );
    }

    // 6. Deduct from Supplier Current Balance (Debit Note reduces payable)
    await client.query(
      `UPDATE suppliers SET current_balance = GREATEST(0, COALESCE(current_balance, 0) - $1), updated_at = now() WHERE id = $2`,
      [totalDebitAmount, supplierId]
    );

    await client.query('COMMIT');
    res.status(201).json({
      ...purchaseReturn,
      supplier_name: supRows[0].name,
      items: processedItems,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Purchase return error:', err);
    res.status(500).json({ error: 'Failed to process purchase return: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
