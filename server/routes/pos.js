const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

let heldBills = [];

// GET /api/pos/bills - Sales history scoped to tenant shop
router.get('/bills', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const { search, startDate, endDate, customerId, paymentMode } = req.query;
  let list = memStore.bills;

  if (currentShopId) {
    list = list.filter((b) => b.shop_id === currentShopId);
  }

  if (startDate) list = list.filter((b) => b.invoice_date >= startDate);
  if (endDate) list = list.filter((b) => b.invoice_date <= endDate);
  if (customerId) list = list.filter((b) => b.customer_id === customerId);
  if (paymentMode && paymentMode !== 'ALL') list = list.filter((b) => b.payment_mode === paymentMode);

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (b) =>
        b.invoice_no.toLowerCase().includes(q) ||
        (b.customer_name || '').toLowerCase().includes(q) ||
        (b.customer_phone || '').includes(q) ||
        (b.doctor_name || '').toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => (b.invoice_no > a.invoice_no ? 1 : -1));
  res.json(list);
});

// GET /api/pos/bills/:id - Bill detail for thermal/A4 printing
router.get('/bills/:id', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const bill = memStore.bills.find(
    (b) =>
      (b.id === req.params.id || b.invoice_no === req.params.id) &&
      (!currentShopId || b.shop_id === currentShopId)
  );
  if (!bill) return res.status(404).json({ error: 'Invoice not found' });
  res.json(bill);
});

// POST /api/pos/check-drug-safety - Safety validator for duplicate salts / interactions
router.post('/check-drug-safety', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const { items } = req.body; // [{ medicineId }]
  if (!Array.isArray(items) || items.length < 2) {
    return res.json({ warnings: [] });
  }

  const warnings = [];
  const saltMap = {};

  items.forEach((it) => {
    const med = memStore.medicines.find((m) => m.id === it.medicineId && (!currentShopId || m.shop_id === currentShopId));
    if (med && med.salt_composition) {
      const primarySalt = med.salt_composition.split('+')[0].trim().toLowerCase().replace(/[0-9mg\s]/g, '');
      if (primarySalt.length > 2) {
        if (!saltMap[primarySalt]) {
          saltMap[primarySalt] = [];
        }
        saltMap[primarySalt].push(med.name);
      }
    }
  });

  Object.entries(saltMap).forEach(([salt, meds]) => {
    if (meds.length > 1) {
      warnings.push({
        type: 'DUPLICATE_SALT',
        message: `Duplicate active molecule detected: "${meds.join('" & "')}" both contain ${salt.toUpperCase()}. Verify prescription to prevent accidental overdose.`,
        medicines: meds,
      });
    }
  });

  res.json({ warnings });
});

// POST /api/pos/checkout - Atomic POS Billing (Tenant Scoped)
router.post('/checkout', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req) || '11111111-1111-1111-1111-111111111111';
  const shop = memStore.shops.find((s) => s.id === currentShopId) || memStore.shops[0];

  const {
    customerId = 'cust-walkin',
    customerName,
    customerPhone,
    doctorName,
    doctorRegNo,
    items, // [{ medicineId, batchId, qty, discountPercent }]
    billDiscount = 0,
    paymentMode = 'CASH', // 'CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT'
    paymentDetails = {}, // { cashAmount, upiAmount, upiRef, cardRef }
    billType = 'TAX_INVOICE',
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart cannot be empty' });
  }

  // Find or create customer within caller's shop
  let customer = memStore.customers.find((c) => c.id === customerId && c.shop_id === currentShopId);
  if (!customer && customerPhone) {
    customer = memStore.customers.find((c) => c.phone === customerPhone.trim() && c.shop_id === currentShopId);
  }

  const custName = customerName || (customer ? customer.name : 'Walk-in Customer');
  const custPhone = customerPhone || (customer ? customer.phone : '');

  // 1. Verify stock availability and schedule requirements
  let hasScheduleH = false;
  const resolvedItems = [];
  let subtotal = 0;
  let totalGst = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  for (const it of items) {
    const med = memStore.medicines.find((m) => m.id === it.medicineId && m.shop_id === currentShopId);
    if (!med) return res.status(400).json({ error: `Medicine not found for ID: ${it.medicineId}` });

    if (med.schedule_type === 'H' || med.schedule_type === 'H1' || med.schedule_type === 'X') {
      hasScheduleH = true;
    }

    // Find requested batch or FEFO batch
    let batch = null;
    if (it.batchId) {
      batch = memStore.batches.find((b) => b.id === it.batchId && b.medicine_id === med.id && b.shop_id === currentShopId);
    } else {
      // Auto-allocate FEFO batch
      const availableBatches = memStore.batches
        .filter((b) => b.medicine_id === med.id && b.shop_id === currentShopId && !b.is_blocked && Number(b.current_stock) > 0)
        .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

      batch = availableBatches[0];
    }

    if (!batch) {
      return res.status(400).json({ error: `No available stock batch for medicine "${med.name}" in your shop` });
    }

    const requestedQty = parseInt(it.qty) || 1;
    if (batch.current_stock < requestedQty && !shop.allow_negative_stock) {
      return res.status(400).json({
        error: `Insufficient stock for ${med.name} (Batch: ${batch.batch_no}). Available: ${batch.current_stock}, Requested: ${requestedQty}`,
      });
    }

    // Check expiry
    const todayStr = new Date().toISOString().slice(0, 10);
    if (batch.expiry_date < todayStr) {
      return res.status(400).json({
        error: `Cannot sell expired medicine "${med.name}" (Batch: ${batch.batch_no}, Expired: ${batch.expiry_date})`,
      });
    }

    const unitPrice = parseFloat(it.sellingPrice) || Number(batch.selling_price) || Number(batch.mrp);
    const itemDiscPct = parseFloat(it.discountPercent) || 0;
    const gstRate = Number(med.gst_rate || 12.0);

    const grossPrice = requestedQty * unitPrice;
    const itemDiscAmt = grossPrice * (itemDiscPct / 100);
    const taxablePrice = grossPrice - itemDiscAmt;
    const lineGst = taxablePrice * (gstRate / 100);
    const lineCgst = lineGst / 2;
    const lineSgst = lineGst / 2;
    const lineTotal = taxablePrice + lineGst;

    subtotal += taxablePrice;
    totalGst += lineGst;
    totalCgst += lineCgst;
    totalSgst += lineSgst;

    resolvedItems.push({
      medicineId: med.id,
      medicineName: med.name,
      batchId: batch.id,
      batchNo: batch.batch_no,
      expiryDate: batch.expiry_date,
      hsnCode: med.hsn_code || '3004',
      packSize: med.pack_size,
      qty: requestedQty,
      unit: med.unit,
      purchaseCost: Number(batch.purchase_cost),
      mrp: Number(batch.mrp),
      unitPrice,
      discountPercent: itemDiscPct,
      gstRate,
      gstAmount: lineGst,
      cgstAmount: lineCgst,
      sgstAmount: lineSgst,
      totalAmount: lineTotal,
    });
  }

  // Schedule compliance check
  if (hasScheduleH && shop.require_doctor_on_schedule_h && (!doctorName || !doctorName.trim())) {
    return res.status(400).json({
      error: 'Schedule H / H1 medicine detected. Prescribing Doctor Name & Registration details are required for Indian pharmacy compliance.',
    });
  }

  // Calculate bill totals
  const billDiscAmt = parseFloat(billDiscount) || 0;
  const netPayable = Math.max(0, subtotal + totalGst - billDiscAmt);
  const roundedTotal = Math.round(netPayable);
  const roundOff = Number((roundedTotal - netPayable).toFixed(2));

  // Generate Invoice No for this shop
  shop.bill_counter = (shop.bill_counter || 1000) + 1;
  const invoiceNo = `${shop.bill_prefix || 'INV'}-${String(shop.bill_counter).padStart(4, '0')}`;

  // Deduct batch stock atomically
  for (const it of resolvedItems) {
    const batch = memStore.batches.find((b) => b.id === it.batchId && b.shop_id === currentShopId);
    if (batch) {
      batch.current_stock -= it.qty;
    }
  }

  // Handle Khata / Credit
  if (paymentMode === 'CREDIT' && customer) {
    customer.current_balance = (Number(customer.current_balance) || 0) + roundedTotal;
  }

  // Handle Cash Register
  if (paymentMode === 'CASH') {
    const todayRegister = memStore.cash_registers.find(
      (cr) =>
        cr.shop_id === currentShopId &&
        cr.register_date === new Date().toISOString().slice(0, 10) &&
        cr.status === 'OPEN'
    );
    if (todayRegister) {
      todayRegister.cash_sales += roundedTotal;
      todayRegister.expected_cash += roundedTotal;
    }
  }

  const invoice = {
    id: `inv-${Date.now()}`,
    shop_id: currentShopId,
    invoice_no: invoiceNo,
    invoice_date: new Date().toISOString().slice(0, 10),
    customer_id: customer ? customer.id : null,
    customer_name: custName,
    customer_phone: custPhone,
    doctor_name: doctorName ? doctorName.trim() : '',
    doctor_reg_no: doctorRegNo ? doctorRegNo.trim() : '',
    subtotal,
    discount_amount: billDiscAmt,
    discount_percent: 0,
    gst_total: totalGst,
    cgst_total: totalCgst,
    sgst_total: totalSgst,
    igst_total: totalIgst,
    round_off: roundOff,
    total_amount: roundedTotal,
    paid_amount: paymentMode === 'CREDIT' ? 0 : roundedTotal,
    change_amount: 0,
    payment_mode: paymentMode,
    payment_details: paymentDetails,
    payment_status: paymentMode === 'CREDIT' ? 'UNPAID' : 'PAID',
    bill_type: billType,
    status: 'COMPLETED',
    cashier_id: req.user?.id || '00000000-0000-0000-0000-000000000003',
    created_at: new Date().toISOString(),
    items: resolvedItems,
  };

  memStore.bills.unshift(invoice);

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
    shop_id: currentShopId,
    user_id: req.user?.id,
    user_name: req.user?.name,
    action: 'CREATE_SALE_INVOICE',
    entity_type: 'SALES_INVOICE',
    entity_id: invoice.id,
    new_values: { invoice_no: invoiceNo, total: roundedTotal, customer: custName },
    created_at: new Date().toISOString(),
  });

  res.status(201).json(invoice);
});

// POST /api/pos/hold - Hold current bill
router.post('/hold', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const { cart, customerName, customerPhone, doctorName, doctorRegNo, discount } = req.body;
  if (!cart || cart.length === 0) return res.status(400).json({ error: 'Cannot hold empty cart' });

  const heldItem = {
    id: `hold-${Date.now()}`,
    shop_id: currentShopId,
    time: new Date().toLocaleTimeString(),
    cart,
    customerName: customerName || 'Walk-in',
    customerPhone: customerPhone || '',
    doctorName: doctorName || '',
    doctorRegNo: doctorRegNo || '',
    discount: discount || 0,
  };

  heldBills.push(heldItem);
  const shopHeld = heldBills.filter((h) => !currentShopId || h.shop_id === currentShopId);
  res.json({ message: 'Bill held successfully', heldBills: shopHeld });
});

// GET /api/pos/held
router.get('/held', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const shopHeld = heldBills.filter((h) => !currentShopId || h.shop_id === currentShopId);
  res.json(shopHeld);
});

// DELETE /api/pos/held/:id - Resume / discard held bill
router.delete('/held/:id', authMiddleware, (req, res) => {
  const currentShopId = tenantShopId(req);
  const item = heldBills.find((h) => h.id === req.params.id && (!currentShopId || h.shop_id === currentShopId));
  heldBills = heldBills.filter((h) => h.id !== req.params.id);
  res.json(item || null);
});

module.exports = router;

