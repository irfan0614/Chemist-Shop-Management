const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, requireRole, tenantShopId } = require('../middleware/auth');
const router = express.Router();

// GET /api/purchases
router.get('/', (req, res) => {
  const shopId = tenantShopId(req);
  const { search, supplierId, startDate, endDate } = req.query;
  let list = memStore.purchases.filter((p) => p.shop_id === shopId);

  if (supplierId) {
    list = list.filter((p) => p.supplier_id === supplierId);
  }

  if (startDate) {
    list = list.filter((p) => p.purchase_date >= startDate);
  }

  if (endDate) {
    list = list.filter((p) => p.purchase_date <= endDate);
  }

  let enriched = list.map((p) => {
    const supplier = memStore.suppliers.find((s) => s.shop_id === shopId && s.id === p.supplier_id) || {};
    return {
      id: p.id,
      purchaseNo: p.purchase_no,
      supplierId: p.supplier_id,
      supplierName: supplier.company_name || supplier.name || 'Unknown Supplier',
      supplierGstin: supplier.gstin || '',
      supplierInvoiceNo: p.supplier_invoice_no,
      supplierInvoiceDate: p.supplier_invoice_date,
      purchaseDate: p.purchase_date,
      subtotal: Number(p.subtotal),
      discountAmount: Number(p.discount_amount),
      gstTotal: Number(p.gst_total),
      totalAmount: Number(p.total_amount),
      paidAmount: Number(p.paid_amount),
      paymentStatus: p.payment_status,
      paymentMode: p.payment_mode,
      itemCount: p.items ? p.items.length : 0,
      notes: p.notes,
    };
  });

  if (search) {
    const q = search.trim().toLowerCase();
    enriched = enriched.filter(
      (p) =>
        p.purchaseNo.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.supplierInvoiceNo.toLowerCase().includes(q)
    );
  }

  enriched.sort((a, b) => (b.purchaseDate > a.purchaseDate ? 1 : -1));
  res.json(enriched);
});

// GET /api/purchases/:id
router.get('/:id', (req, res) => {
  const shopId = tenantShopId(req);
  const p = memStore.purchases.find((pur) => pur.shop_id === shopId && pur.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Purchase invoice not found' });

  const supplier = memStore.suppliers.find((s) => s.shop_id === shopId && s.id === p.supplier_id) || {};
  res.json({
    ...p,
    supplier,
  });
});

// POST /api/purchases - Create Purchase Invoice + Update/Create Batches + Update Supplier Balance
router.post('/', authMiddleware, requireRole(['ADMIN', 'SHOP_OWNER', 'PHARMACIST', 'INVENTORY_MGR']), (req, res) => {
  const shopId = tenantShopId(req);
  const {
    supplierId,
    supplierInvoiceNo,
    supplierInvoiceDate,
    purchaseDate,
    items,
    discountAmount = 0,
    paidAmount = 0,
    paymentMode = 'NEFT/RTGS',
    notes,
  } = req.body;

  if (!supplierId || !supplierInvoiceNo || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Supplier, invoice number, and at least one item are required' });
  }

  const supplier = memStore.suppliers.find((s) => s.shop_id === shopId && s.id === supplierId);
  if (!supplier) return res.status(400).json({ error: 'Invalid supplier selected' });

  // Generate Purchase No
  memStore.settings.purchase_counter = (memStore.settings.purchase_counter || 100) + 1;
  const purchaseNo = `${memStore.settings.purchase_prefix || 'PUR'}-${String(memStore.settings.purchase_counter).padStart(4, '0')}`;

  let subtotal = 0;
  let gstTotal = 0;
  const purchaseItems = [];

  for (const it of items) {
    const med = memStore.medicines.find((m) => m.shop_id === shopId && m.id === it.medicineId);
    if (!med) throw new Error(`Medicine ${it.medicineId} not found`);

    const qty = parseInt(it.qty) || 0;
    const freeQty = parseInt(it.freeQty) || 0;
    const totalQty = qty + freeQty;
    const cost = parseFloat(it.purchaseCost) || 0;
    const mrp = parseFloat(it.mrp) || cost * 1.2;
    const sellingPrice = parseFloat(it.sellingPrice) || mrp * 0.95;
    const itemDiscPct = parseFloat(it.discountPercent) || 0;
    const gstRate = parseFloat(it.gstRate) !== undefined ? parseFloat(it.gstRate) : Number(med.gst_rate || 12);

    const lineCost = qty * cost;
    const lineDisc = lineCost * (itemDiscPct / 100);
    const taxableAmt = lineCost - lineDisc;
    const lineGst = taxableAmt * (gstRate / 100);
    const lineTotal = taxableAmt + lineGst;

    subtotal += taxableAmt;
    gstTotal += lineGst;

    // Check if batch already exists or create new
    let batch = memStore.batches.find(
      (b) => b.shop_id === shopId && b.medicine_id === med.id && b.batch_no.toLowerCase() === (it.batchNo || '').trim().toLowerCase()
    );

    if (batch) {
      batch.current_stock += totalQty;
      batch.purchase_cost = cost;
      batch.mrp = mrp;
      batch.selling_price = sellingPrice;
      batch.expiry_date = it.expiryDate || batch.expiry_date;
    } else {
      batch = {
        id: `b-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        shop_id: shopId,
        medicine_id: med.id,
        batch_no: (it.batchNo || `B-${Date.now()}`).trim(),
        mfg_date: it.mfgDate || null,
        expiry_date: it.expiryDate || '2028-12-31',
        purchase_cost: cost,
        mrp,
        selling_price: sellingPrice,
        current_stock: totalQty,
        rack_shelf: (it.rackShelf || '').trim(),
        is_blocked: false,
      };
      memStore.batches.push(batch);
    }

    purchaseItems.push({
      id: `pi-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      shop_id: shopId,
      medicineId: med.id,
      medicineName: med.name,
      batchId: batch.id,
      batchNo: batch.batch_no,
      expiryDate: batch.expiry_date,
      packSize: med.pack_size,
      qty,
      freeQty,
      purchaseCost: cost,
      mrp,
      sellingPrice,
      discountPercent: itemDiscPct,
      gstRate,
      gstAmount: lineGst,
      totalAmount: lineTotal,
    });
  }

  const discAmt = parseFloat(discountAmount) || 0;
  const grandTotal = Math.max(0, subtotal + gstTotal - discAmt);
  const paid = parseFloat(paidAmount) || 0;
  const paymentStatus = paid >= grandTotal ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

  const newPurchase = {
    id: `pur-${Date.now()}`,
    shop_id: shopId,
    purchase_no: purchaseNo,
    supplier_id: supplier.id,
    supplier_invoice_no: supplierInvoiceNo.trim(),
    supplier_invoice_date: supplierInvoiceDate || new Date().toISOString().slice(0, 10),
    purchase_date: purchaseDate || new Date().toISOString().slice(0, 10),
    subtotal,
    discount_amount: discAmt,
    gst_total: gstTotal,
    round_off: 0.0,
    total_amount: grandTotal,
    paid_amount: paid,
    payment_status: paymentStatus,
    payment_mode: paymentMode,
    notes: notes || '',
    created_at: new Date().toISOString(),
    items: purchaseItems,
  };

  memStore.purchases.unshift(newPurchase);

  // Update supplier outstanding ledger balance
  const remainingDue = grandTotal - paid;
  supplier.current_balance = (Number(supplier.current_balance) || 0) + remainingDue;

  // Log audit
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: shopId,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'CREATE_PURCHASE',
    entity_type: 'PURCHASE',
    entity_id: newPurchase.id,
    new_values: { purchase_no: purchaseNo, total: grandTotal, supplier: supplier.name },
    created_at: new Date().toISOString(),
  });

  res.status(201).json(newPurchase);
});

module.exports = router;
