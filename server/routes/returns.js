const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// GET /api/returns/sales
router.get('/sales', (req, res) => {
  const shopId = tenantShopId(req);
  res.json(memStore.sales_returns.filter((sr) => sr.shop_id === shopId));
});

// POST /api/returns/sales - Process customer sales return
router.post('/sales', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN']), (req, res) => {
  const shopId = tenantShopId(req);
  const { invoiceNo, items, refundMode = 'CASH', reason } = req.body;

  if (!invoiceNo || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invoice number and returned items are required' });
  }

  const invoice = memStore.sales_invoices.find((inv) => inv.shop_id === shopId && inv.invoice_no === invoiceNo.trim());
  if (!invoice) return res.status(404).json({ error: `Original invoice "${invoiceNo}" not found` });

  let totalRefund = 0;
  const processedItems = [];

  for (const it of items) {
    const origItem = invoice.items.find((i) => i.medicineId === it.medicineId && i.batchId === it.batchId);
    if (!origItem) {
      return res.status(400).json({ error: `Medicine not found in original invoice: ${it.medicineId}` });
    }

    const returnQty = parseInt(it.returnQty) || 0;
    if (returnQty <= 0 || returnQty > origItem.qty) {
      return res.status(400).json({ error: `Invalid return quantity for ${origItem.medicineName}. Sold: ${origItem.qty}, Returned: ${returnQty}` });
    }

    const unitPrice = Number(origItem.unitPrice);
    const lineRefund = returnQty * unitPrice;
    totalRefund += lineRefund;

    // Restock batch if condition is good
    if (it.restockCondition !== 'DAMAGED_WRITE_OFF') {
      const batch = memStore.batches.find((b) => b.shop_id === shopId && b.id === origItem.batchId);
      if (batch) {
        batch.current_stock += returnQty;
      }
    }

    processedItems.push({
      medicineId: origItem.medicineId,
      medicineName: origItem.medicineName,
      batchId: origItem.batchId,
      batchNo: origItem.batchNo,
      returnQty,
      unitPrice,
      refundAmount: lineRefund,
      restockCondition: it.restockCondition || 'RESTOCKED',
    });
  }

  // Generate Return No
  memStore.settings.return_counter = (memStore.settings.return_counter || 0) + 1;
  const returnNo = `${memStore.settings.return_prefix || 'SRT'}-${String(memStore.settings.return_counter).padStart(4, '0')}`;

  const salesReturn = {
    id: `ret-${Date.now()}`,
    shop_id: shopId,
    return_no: returnNo,
    invoice_id: invoice.id,
    invoice_no: invoice.invoice_no,
    customer_id: invoice.customer_id,
    customer_name: invoice.customer_name,
    return_date: new Date().toISOString().slice(0, 10),
    refund_amount: totalRefund,
    refund_mode: refundMode,
    reason: reason || 'Customer unused / unneeded medicine',
    status: 'APPROVED',
    created_at: new Date().toISOString(),
    items: processedItems,
  };

  memStore.sales_returns.unshift(salesReturn);

  // If cash refund, update cash register
  if (refundMode === 'CASH') {
    const todayRegister = memStore.cash_registers.find(
      (cr) => cr.shop_id === shopId && cr.register_date === new Date().toISOString().slice(0, 10) && cr.status === 'OPEN'
    );
    if (todayRegister) {
      todayRegister.cash_returns += totalRefund;
      todayRegister.expected_cash -= totalRefund;
    }
  }

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shopId,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'SALES_RETURN',
    entity_type: 'SALES_RETURN',
    entity_id: salesReturn.id,
    new_values: { return_no: returnNo, refund: totalRefund, invoice: invoiceNo },
    created_at: new Date().toISOString(),
  });

  res.status(201).json(salesReturn);
});

// GET /api/returns/purchases
router.get('/purchases', (req, res) => {
  const shopId = tenantShopId(req);
  res.json(memStore.purchase_returns.filter((pr) => pr.shop_id === shopId));
});

// POST /api/returns/purchases - Return damaged/expired medicines to supplier (Debit Note)
router.post('/purchases', authMiddleware, requireRole(['SHOP_OWNER', 'ADMIN']), (req, res) => {
  const shopId = tenantShopId(req);
  const { supplierId, items, reason } = req.body;

  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Supplier and items to return are required' });
  }

  const supplier = memStore.suppliers.find((s) => s.shop_id === shopId && s.id === supplierId);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  let totalDebitAmount = 0;
  const processedItems = [];

  for (const it of items) {
    const batch = memStore.batches.find((b) => b.shop_id === shopId && b.id === it.batchId);
    if (!batch) return res.status(400).json({ error: `Batch not found: ${it.batchId}` });

    const med = memStore.medicines.find((m) => m.shop_id === shopId && m.id === batch.medicine_id);
    const returnQty = parseInt(it.returnQty) || 0;
    if (returnQty <= 0 || returnQty > batch.current_stock) {
      return res.status(400).json({ error: `Cannot return ${returnQty} for batch ${batch.batch_no}. Available stock: ${batch.current_stock}` });
    }

    const cost = Number(batch.purchase_cost);
    const lineTotal = returnQty * cost;
    totalDebitAmount += lineTotal;

    // Deduct stock
    batch.current_stock -= returnQty;

    processedItems.push({
      medicineId: med ? med.id : batch.medicine_id,
      medicineName: med ? med.name : 'Medicine',
      batchId: batch.id,
      batchNo: batch.batch_no,
      expiryDate: batch.expiry_date,
      returnQty,
      purchaseCost: cost,
      totalAmount: lineTotal,
    });
  }

  const debitNoteNo = `DBN-${Date.now().toString().slice(-4)}`;

  const purchReturn = {
    id: `pret-${Date.now()}`,
    shop_id: shopId,
    return_no: `PRT-${Date.now().toString().slice(-4)}`,
    supplier_id: supplier.id,
    supplier_name: supplier.company_name || supplier.name,
    return_date: new Date().toISOString().slice(0, 10),
    debit_note_no: debitNoteNo,
    total_amount: totalDebitAmount,
    reason: reason || 'Near Expiry / Expired / Damaged',
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
    items: processedItems,
  };

  memStore.purchase_returns.unshift(purchReturn);

  // Deduct from supplier payable balance
  supplier.current_balance = Math.max(0, (Number(supplier.current_balance) || 0) - totalDebitAmount);

  res.status(201).json(purchReturn);
});

module.exports = router;
