const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

let heldBills = [];

// GET /api/pos/bills - Sales history
router.get('/bills', (req, res) => {
  const { search, startDate, endDate, customerId, paymentMode } = req.query;
  let list = [...memStore.sales_invoices];

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
router.get('/bills/:id', (req, res) => {
  const bill = memStore.sales_invoices.find((b) => b.id === req.params.id || b.invoice_no === req.params.id);
  if (!bill) return res.status(404).json({ error: 'Invoice not found' });
  res.json(bill);
});

// POST /api/pos/checkout - Atomic POS Billing
router.post('/checkout', authMiddleware, (req, res) => {
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

  // Find or create customer
  let customer = memStore.customers.find((c) => c.id === customerId);
  if (!customer && customerPhone) {
    customer = memStore.customers.find((c) => c.phone === customerPhone.trim());
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
    const med = memStore.medicines.find((m) => m.id === it.medicineId);
    if (!med) return res.status(400).json({ error: `Medicine not found for ID: ${it.medicineId}` });

    if (med.schedule_type === 'H' || med.schedule_type === 'H1' || med.schedule_type === 'X') {
      hasScheduleH = true;
    }

    // Find requested batch or FEFO batch
    let batch = null;
    if (it.batchId) {
      batch = memStore.batches.find((b) => b.id === it.batchId && b.medicine_id === med.id);
    } else {
      // Auto-allocate FEFO batch
      const availableBatches = memStore.batches
        .filter((b) => b.medicine_id === med.id && !b.is_blocked && Number(b.current_stock) > 0)
        .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

      batch = availableBatches[0];
    }

    if (!batch) {
      return res.status(400).json({ error: `No available stock batch for medicine "${med.name}"` });
    }

    const requestedQty = parseInt(it.qty) || 1;
    if (batch.current_stock < requestedQty && !memStore.settings.allow_negative_stock) {
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
  if (hasScheduleH && memStore.settings.require_doctor_on_schedule_h && (!doctorName || !doctorName.trim())) {
    return res.status(400).json({
      error: 'Schedule H / H1 medicine detected. Prescribing Doctor Name & Registration details are required for Indian pharmacy compliance.',
    });
  }

  // Calculate bill totals
  const billDiscAmt = parseFloat(billDiscount) || 0;
  const netPayable = Math.max(0, subtotal + totalGst - billDiscAmt);
  const roundedTotal = Math.round(netPayable);
  const roundOff = Number((roundedTotal - netPayable).toFixed(2));

  // Generate Invoice No
  memStore.settings.bill_counter = (memStore.settings.bill_counter || 1000) + 1;
  const invoiceNo = `${memStore.settings.bill_prefix || 'INV'}-${String(memStore.settings.bill_counter).padStart(4, '0')}`;

  // Deduct batch stock atomically
  for (const it of resolvedItems) {
    const batch = memStore.batches.find((b) => b.id === it.batchId);
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
      (cr) => cr.register_date === new Date().toISOString().slice(0, 10) && cr.status === 'OPEN'
    );
    if (todayRegister) {
      todayRegister.cash_sales += roundedTotal;
      todayRegister.expected_cash += roundedTotal;
    }
  }

  const invoice = {
    id: `inv-${Date.now()}`,
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

  memStore.sales_invoices.unshift(invoice);

  // Audit log
  memStore.audit_logs.unshift({
    id: `al-${Date.now()}`,
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
  const { cart, customerName, customerPhone, doctorName, doctorRegNo, discount } = req.body;
  if (!cart || cart.length === 0) return res.status(400).json({ error: 'Cannot hold empty cart' });

  const heldItem = {
    id: `hold-${Date.now()}`,
    time: new Date().toLocaleTimeString(),
    cart,
    customerName: customerName || 'Walk-in',
    customerPhone: customerPhone || '',
    doctorName: doctorName || '',
    doctorRegNo: doctorRegNo || '',
    discount: discount || 0,
  };

  heldBills.push(heldItem);
  res.json({ message: 'Bill held successfully', heldBills });
});

// GET /api/pos/held
router.get('/held', (req, res) => {
  res.json(heldBills);
});

// DELETE /api/pos/held/:id - Resume / discard held bill
router.delete('/held/:id', (req, res) => {
  const item = heldBills.find((h) => h.id === req.params.id);
  heldBills = heldBills.filter((h) => h.id !== req.params.id);
  res.json(item || null);
});

module.exports = router;
