import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Plus,
  Trash2,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Users,
  Printer,
  Receipt,
  PauseCircle,
  PlayCircle,
  FileText,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Percent,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useShop } from '../context/ShopContext';
import { Modal } from '../components/common/Modal';
import { Badge, DrugScheduleBadge } from '../components/common/Badge';
import { fmtMoney, fmtDate, expiryStatus } from '../utils/formatters';

export function POSBillingPage() {
  const { showSuccess, showError, showWarn } = useToast();
  const { settings, triggerPrint } = useShop();

  // Inventory & Search states
  const [medicines, setMedicines] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Active Billing Cart
  const [cart, setCart] = useState([]); // [{ medicineId, medicineName, batchId, batchNo, expiryDate, qty, maxQty, packSize, unit, mrp, sellingPrice, discountPercent, gstRate, scheduleType }]
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorRegNo, setDoctorRegNo] = useState('');
  const [billDiscount, setBillDiscount] = useState(0);

  // Modals & UI states
  const [batchModalMedicine, setBatchModalMedicine] = useState(null);
  const [batchModalList, setBatchModalList] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [heldBills, setHeldBills] = useState([]);
  const [processing, setProcessing] = useState(false);

  // Payment State
  const [paymentMode, setPaymentMode] = useState('CASH'); // CASH, UPI, CARD, CREDIT, SPLIT
  const [cashTendered, setCashTendered] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');

  const searchInputRef = useRef(null);

  // Load medicines & customers
  const loadInitialData = useCallback(async () => {
    try {
      const [meds, custs, held] = await Promise.all([
        api.get('/medicines'),
        api.get('/customers'),
        api.get('/pos/held'),
      ]);
      setMedicines(meds);
      setCustomers(custs);
      setHeldBills(held);
    } catch (err) {
      showError('Failed to initialize POS terminal: ' + err.message);
    }
  }, [showError]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Live Medicine Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(medicines.slice(0, 8));
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const matches = medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.generic_name || '').toLowerCase().includes(q) ||
        (m.barcode || '').includes(q) ||
        (m.brand || '').toLowerCase().includes(q) ||
        (m.salt_composition || '').toLowerCase().includes(q)
    );
    setSearchResults(matches.slice(0, 12));
  }, [searchQuery, medicines]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setDoctorName('');
        setDoctorRegNo('');
        setBillDiscount(0);
        searchInputRef.current?.focus();
        showSuccess('New billing session initialized');
      } else if (e.key === 'F4') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (cart.length > 0) setIsPaymentModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  // Select medicine and auto-pick FEFO batch or show batch selector
  const handleSelectMedicine = async (med) => {
    try {
      const batches = await api.get(`/batches/fefo/${med.id}`);
      if (!batches || batches.length === 0) {
        showError(`No stock available for "${med.name}"`);
        return;
      }

      if (batches.length === 1) {
        // Only 1 batch available, add directly
        addBatchToCart(med, batches[0]);
      } else {
        // Multiple batches available, let pharmacist choose or verify FEFO
        setBatchModalMedicine(med);
        setBatchModalList(batches);
      }
    } catch (err) {
      showError('Failed to fetch batches: ' + err.message);
    }
  };

  const addBatchToCart = (med, batch) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.medicineId === med.id && item.batchId === batch.id);
      if (existing) {
        if (existing.qty >= batch.currentStock) {
          showWarn(`Maximum available stock (${batch.currentStock}) reached for batch ${batch.batchNo}`);
          return prev;
        }
        return prev.map((item) =>
          item.medicineId === med.id && item.batchId === batch.id
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          medicineId: med.id,
          medicineName: med.name,
          genericName: med.generic_name,
          batchId: batch.id,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          packSize: med.pack_size || 10,
          unit: med.unit || 'Strips',
          mrp: Number(batch.mrp),
          sellingPrice: Number(batch.sellingPrice),
          purchaseCost: Number(batch.purchaseCost),
          qty: 1,
          maxStock: Number(batch.currentStock),
          discountPercent: selectedCustomer ? Number(selectedCustomer.discountPercent || 0) : 0,
          gstRate: Number(med.gst_rate || 12),
          scheduleType: med.schedule_type || 'NONE',
        },
      ];
    });

    setBatchModalMedicine(null);
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const updateCartItemQty = (medicineId, batchId, qty) => {
    const val = parseInt(qty) || 1;
    setCart((prev) =>
      prev.map((item) => {
        if (item.medicineId === medicineId && item.batchId === batchId) {
          const clamped = Math.max(1, Math.min(val, item.maxStock));
          return { ...item, qty: clamped };
        }
        return item;
      })
    );
  };

  const updateCartItemDiscount = (medicineId, batchId, disc) => {
    const val = Math.max(0, Math.min(parseFloat(disc) || 0, 100));
    setCart((prev) =>
      prev.map((item) =>
        item.medicineId === medicineId && item.batchId === batchId
          ? { ...item, discountPercent: val }
          : item
      )
    );
  };

  const removeFromCart = (medicineId, batchId) => {
    setCart((prev) => prev.filter((i) => !(i.medicineId === medicineId && i.batchId === batchId)));
  };

  // Financial calculations
  const cartLines = cart.map((item) => {
    const grossPrice = item.qty * item.sellingPrice;
    const discAmt = grossPrice * (item.discountPercent / 100);
    const taxable = grossPrice - discAmt;
    const gstAmt = taxable * (item.gstRate / 100);
    const lineTotal = taxable + gstAmt;
    return {
      ...item,
      grossPrice,
      discAmt,
      taxable,
      gstAmt,
      lineTotal,
    };
  });

  const subtotal = cartLines.reduce((s, c) => s + c.taxable, 0);
  const totalGst = cartLines.reduce((s, c) => s + c.gstAmt, 0);
  const billDiscAmt = parseFloat(billDiscount) || 0;
  const netPayable = Math.max(0, subtotal + totalGst - billDiscAmt);
  const grandTotal = Math.round(netPayable);
  const roundOff = Number((grandTotal - netPayable).toFixed(2));

  // Check if any schedule H / H1 medicine is in cart
  const hasScheduleDrugs = cart.some(
    (item) => item.scheduleType === 'H' || item.scheduleType === 'H1' || item.scheduleType === 'X'
  );

  // Handle Customer Select
  const handleSelectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    if (cust.discountPercent > 0) {
      setCart((prev) =>
        prev.map((item) => ({ ...item, discountPercent: Number(cust.discountPercent) }))
      );
      showSuccess(`Applied ${cust.discountPercent}% customer discount (${cust.customerType})`);
    }
  };

  // Hold Bill
  const handleHoldBill = async () => {
    if (cart.length === 0) {
      showWarn('Cannot park an empty cart');
      return;
    }
    try {
      await api.post('/pos/hold', {
        cart,
        customerName,
        customerPhone,
        doctorName,
        doctorRegNo,
        discount: billDiscount,
      });
      showSuccess('Bill parked on hold successfully');
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDoctorName('');
      setDoctorRegNo('');
      setBillDiscount(0);
      const held = await api.get('/pos/held');
      setHeldBills(held);
    } catch (err) {
      showError('Failed to hold bill: ' + err.message);
    }
  };

  // Resume Bill
  const handleResumeBill = async (heldId) => {
    try {
      const held = await api.del(`/pos/held/${heldId}`);
      if (held) {
        setCart(held.cart || []);
        setCustomerName(held.customerName || '');
        setCustomerPhone(held.customerPhone || '');
        setDoctorName(held.doctorName || '');
        setDoctorRegNo(held.doctorRegNo || '');
        setBillDiscount(held.discount || 0);
        showSuccess('Restored parked bill');
        const updated = await api.get('/pos/held');
        setHeldBills(updated);
      }
    } catch (err) {
      showError('Failed to resume bill: ' + err.message);
    }
  };

  // Drug Safety Warnings
  const [safetyWarnings, setSafetyWarnings] = useState([]);
  const [completedInvoice, setCompletedInvoice] = useState(null);

  // Check drug safety when cart changes
  useEffect(() => {
    if (cart.length < 2) {
      setSafetyWarnings([]);
      return;
    }
    const checkSafety = async () => {
      try {
        const res = await api.post('/pos/check-drug-safety', {
          items: cart.map((i) => ({ medicineId: i.medicineId, batchId: i.batchId })),
        });
        setSafetyWarnings(res.warnings || []);
      } catch (e) {
        console.warn('Safety check skipped:', e.message);
      }
    };
    checkSafety();
  }, [cart]);

  // Checkout & Finalize Bill
  const handleCompleteSale = async () => {
    if (cart.length === 0) return;

    if (hasScheduleDrugs && settings.require_doctor_on_schedule_h && (!doctorName || !doctorName.trim())) {
      showError('Prescribing Doctor Name is mandatory for Schedule H / H1 medicines.');
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        customerId: selectedCustomer ? selectedCustomer.id : 'cust-walkin',
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim(),
        doctorName: doctorName.trim(),
        doctorRegNo: doctorRegNo.trim(),
        billDiscount: parseFloat(billDiscount) || 0,
        paymentMode,
        paymentDetails: {
          cashTendered: parseFloat(cashTendered) || 0,
          upiRef: upiRef.trim(),
          cardRef: cardRef.trim(),
          splitCash: parseFloat(splitCash) || 0,
          splitUpi: parseFloat(splitUpi) || 0,
        },
        items: cart.map((i) => ({
          medicineId: i.medicineId,
          batchId: i.batchId,
          qty: i.qty,
          sellingPrice: i.sellingPrice,
          discountPercent: i.discountPercent,
        })),
      };

      const invoice = await api.post('/pos/checkout', payload);
      showSuccess(`Invoice #${invoice.invoice_no} generated successfully!`);
      setCompletedInvoice(invoice);

      // Reset POS
      setCart([]);
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      setDoctorName('');
      setDoctorRegNo('');
      setBillDiscount(0);
      setIsPaymentModalOpen(false);
      setCashTendered('');
      setUpiRef('');

      // Refresh medicines stock
      const updatedMeds = await api.get('/medicines');
      setMedicines(updatedMeds);

      // Trigger Print
      triggerPrint(invoice);
    } catch (err) {
      showError(err.message || 'Failed to complete transaction');
    } finally {
      setProcessing(false);
    }
  };

  const [mobileTab, setMobileTab] = useState('catalog'); // 'catalog' | 'cart'

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      {/* POS Top Bar & Parked Bills */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">Fast POS Billing Terminal</h1>
            <p className="text-xs text-slate-400">Keyboard shortcuts enabled · Barcode ready</p>
          </div>
        </div>

        {/* Parked / Held Bills Queue */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {heldBills.length > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-800">
              <PauseCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{heldBills.length} Held:</span>
              <div className="flex gap-1 overflow-x-auto max-w-[150px]">
                {heldBills.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handleResumeBill(h.id)}
                    className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-bold shrink-0"
                  >
                    Resume {h.customerName || 'Walk-in'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleHoldBill}
            disabled={cart.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 transition-colors shrink-0"
            title="Park Bill (F8)"
          >
            <PauseCircle className="w-4 h-4 text-slate-500" />
            <span>Hold Bill (F8)</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher (Visible only on < lg screens) */}
      <div className="lg:hidden flex p-1 bg-slate-200/80 rounded-2xl">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'catalog'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Search className="w-4 h-4 text-emerald-600" />
          <span>Medicine Catalog & Patient</span>
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'cart'
              ? 'bg-white text-emerald-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4 text-emerald-600" />
          <span>Cart ({cart.length}) · {fmtMoney(grandTotal)}</span>
        </button>
      </div>

      {/* Main Billing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Search & Catalog Picker (7 cols) */}
        <div className={`lg:col-span-7 space-y-4 ${mobileTab === 'catalog' ? 'block' : 'hidden lg:block'}`}>
          {/* Medicine Search Box */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                placeholder="Search medicine by Name, Generic, Brand, Salt, or scan Barcode… (F4)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* Live Search Results List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {medicines.length === 0 ? 'No medicines in catalog.' : 'No medicines matched your query.'}
                </div>
              ) : (
                searchResults.map((med) => {
                  const outOfStock = Number(med.totalStock) <= 0;
                  return (
                    <div
                      key={med.id}
                      onClick={() => !outOfStock && handleSelectMedicine(med)}
                      className={`p-3 flex items-center justify-between gap-3 hover:bg-emerald-50/50 transition-colors ${
                        outOfStock ? 'opacity-40 cursor-not-allowed bg-slate-50/50' : 'cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">{med.name}</span>
                          <DrugScheduleBadge scheduleType={med.schedule_type} />
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {med.generic_name} {med.strength ? `· ${med.strength}` : ''} · Pack: {med.pack_size} {med.unit}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Earliest Exp: {fmtDate(med.earliestExpiry)} · GST: {med.gst_rate}%
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs text-slate-900">{fmtMoney(med.sellingPrice || med.mrp)}</div>
                        <div
                          className={`text-[10px] font-mono font-bold mt-0.5 ${
                            outOfStock ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {outOfStock ? 'Out of Stock' : `Stock: ${med.totalStock}`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Patient & Doctor Details Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Customer & Prescribing Doctor</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Customer / Patient Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="Walk-in Customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Mobile Number</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="98xxxxxxxx"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Doctor Name {hasScheduleDrugs && <span className="text-rose-500">* (Sched H1)</span>}
                </label>
                <input
                  type="text"
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 ${
                    hasScheduleDrugs && !doctorName
                      ? 'border-amber-300 ring-2 ring-amber-400/20'
                      : 'border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                  }`}
                  placeholder="Dr. Rajesh / Hospital"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Doctor Reg. No.</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="DMC-12948"
                  value={doctorRegNo}
                  onChange={(e) => setDoctorRegNo(e.target.value)}
                />
              </div>
            </div>

            {/* Regular Customers Quick Picker */}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
              <span className="text-slate-400 font-semibold shrink-0">Quick Pick:</span>
              {customers.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCustomer(c)}
                  className={`px-2 py-1 rounded-lg border text-xs font-medium shrink-0 transition-colors ${
                    selectedCustomer?.id === c.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {c.name} {c.currentBalance > 0 ? `(Due: ${fmtMoney(c.currentBalance)})` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Billing Cart & Summary (5 cols) */}
        <div className={`lg:col-span-5 space-y-4 ${mobileTab === 'cart' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Sale Cart</h3>
                <div className="text-xs font-bold text-slate-900 mt-0.5">
                  {cart.length} Item{cart.length === 1 ? '' : 's'} Added
                </div>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Cart
                </button>
              )}
            </div>

            {/* Drug Safety Warnings Banner */}
            {safetyWarnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Drug Interaction & Salt Safety Alert:</span>
                </div>
                <div className="space-y-1 pl-5">
                  {safetyWarnings.map((w, idx) => (
                    <div key={idx} className="text-amber-800 text-[11px] leading-tight">
                      • {w.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cart Items List */}
            <div className="max-h-80 overflow-y-auto space-y-2.5">
              {cartLines.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                  <div className="font-semibold">Cart is currently empty</div>
                  <div>Search or click a medicine on the left to add</div>
                </div>
              ) : (
                cartLines.map((item) => (
                  <div
                    key={`${item.medicineId}-${item.batchId}`}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-900 truncate">{item.medicineName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Batch: <span className="font-bold text-slate-700">{item.batchNo}</span> · Exp: {fmtDate(item.expiryDate)} · MRP: {fmtMoney(item.mrp)}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.medicineId, item.batchId)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      {/* Qty Counter */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold text-slate-400">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          max={item.maxStock}
                          value={item.qty}
                          onChange={(e) => updateCartItemQty(item.medicineId, item.batchId, e.target.value)}
                          className="w-14 text-center py-1 bg-white border border-slate-200 rounded-lg font-mono font-bold text-xs"
                        />
                        <span className="text-[10px] text-slate-400 font-mono">/ {item.maxStock}</span>
                      </div>

                      {/* Item Discount % */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold text-slate-400">Disc%:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent}
                          onChange={(e) => updateCartItemDiscount(item.medicineId, item.batchId, e.target.value)}
                          className="w-12 text-center py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                        />
                      </div>

                      {/* Line Total */}
                      <div className="text-right">
                        <div className="font-mono font-bold text-slate-900 text-xs">{fmtMoney(item.lineTotal)}</div>
                        <div className="text-[9px] text-slate-400 font-mono">GST: {fmtMoney(item.gstAmt)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bill Summary Calculations */}
            <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Taxable Subtotal:</span>
                <span className="font-mono text-slate-900 font-semibold">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Estimated GST (CGST+SGST):</span>
                <span className="font-mono text-slate-900 font-semibold">{fmtMoney(totalGst)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 font-medium">
                <span>Special Bill Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={billDiscount}
                  onChange={(e) => setBillDiscount(e.target.value)}
                  className="w-20 text-right py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-900"
                />
              </div>
              {roundOff !== 0 && (
                <div className="flex justify-between text-slate-400 font-mono text-[11px]">
                  <span>Round Off:</span>
                  <span>{roundOff > 0 ? `+${roundOff}` : roundOff}</span>
                </div>
              )}

              {/* Grand Total Bar */}
              <div className="border-t-2 border-slate-900 pt-2 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Net Payable</div>
                  <div className="text-[10px] text-emerald-600 font-semibold">Inclusive of all taxes</div>
                </div>
                <div className="text-2xl font-black font-mono text-emerald-700">{fmtMoney(grandTotal)}</div>
              </div>
            </div>

            {/* Complete Sale Button */}
            <button
              disabled={cart.length === 0 || processing}
              onClick={() => setIsPaymentModalOpen(true)}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-700/20 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Collect Payment & Print (F10)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Mobile Checkout Bar (Visible on < lg when cart has items) */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 text-white p-3 z-30 lg:hidden shadow-2xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">
              {cart.length} Item{cart.length > 1 ? 's' : ''} in cart
            </div>
            <div className="text-base font-black font-mono text-emerald-400 leading-tight">
              {fmtMoney(grandTotal)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {mobileTab === 'catalog' ? (
              <button
                onClick={() => setMobileTab('cart')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
              >
                View Cart
              </button>
            ) : (
              <button
                onClick={() => setMobileTab('catalog')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
              >
                + Add More
              </button>
            )}
            <button
              disabled={processing}
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950/50 flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              <span>Checkout</span>
            </button>
          </div>
        </div>
      )}

      {/* Batch Selection Modal (FEFO / Specific Batch) */}
      <Modal
        isOpen={!!batchModalMedicine}
        onClose={() => setBatchModalMedicine(null)}
        title={`Select Batch — ${batchModalMedicine?.name || ''}`}
        subtitle="Earliest expiring batches listed first for FEFO compliance"
      >
        <div className="space-y-3">
          {batchModalList.map((batch, idx) => (
            <div
              key={batch.id}
              onClick={() => addBatchToCart(batchModalMedicine, batch)}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 cursor-pointer transition-all flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-slate-900">Batch #{batch.batchNo}</span>
                  {idx === 0 && <Badge tone="ok">FEFO Recommended</Badge>}
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-1">
                  Expiry: <strong className="text-slate-800">{fmtDate(batch.expiryDate)}</strong> ({batch.daysLeft} days left) · Rack: {batch.rackShelf || 'A-1'}
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono font-bold text-xs text-slate-900">Rate: {fmtMoney(batch.sellingPrice)}</div>
                <div className="text-[11px] font-mono text-emerald-700 font-bold mt-0.5">Stock: {batch.currentStock}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Payment & Settlement Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Complete POS Sale & Payment"
        subtitle={`Invoice Net Amount: ${fmtMoney(grandTotal)}`}
      >
        <div className="space-y-4 text-xs">
          {/* Payment Method Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Select Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: 'CASH', label: 'Cash (₹)', icon: Banknote },
                { key: 'UPI', label: 'UPI / QR', icon: QrCode },
                { key: 'CARD', label: 'Card / POS', icon: CreditCard },
                { key: 'CREDIT', label: 'Khata (Due)', icon: Users },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setPaymentMode(m.key)}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 font-bold transition-all ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-950/20'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Details Input Fields */}
          {paymentMode === 'CASH' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-500">Cash Tendered by Patient (₹)</label>
              <input
                type="number"
                step="10"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono font-bold"
                placeholder={grandTotal.toString()}
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
              />
              {parseFloat(cashTendered) > grandTotal && (
                <div className="text-xs font-mono font-bold text-emerald-700">
                  Change to Return: {fmtMoney(parseFloat(cashTendered) - grandTotal)}
                </div>
              )}
            </div>
          )}

          {paymentMode === 'UPI' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-500">UPI Transaction ID / Ref No.</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                placeholder="UPI-129482938"
                value={upiRef}
                onChange={(e) => setUpiRef(e.target.value)}
              />
            </div>
          )}

          {paymentMode === 'CREDIT' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <div className="font-bold text-amber-900">Patient Khata (Credit) Sale</div>
              <div className="text-[11px] text-amber-700">
                Amount of {fmtMoney(grandTotal)} will be added to <strong>{customerName || 'Walk-in'}</strong>'s ledger account.
              </div>
            </div>
          )}

          {/* Confirm & Print Buttons */}
          <div className="pt-3 border-t border-slate-200 flex gap-2">
            <button
              disabled={processing}
              onClick={handleCompleteSale}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-950/10"
            >
              <Printer className="w-4 h-4" />
              <span>{processing ? 'Processing…' : 'Generate & Print Receipt'}</span>
            </button>
            <button
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Sale Completed & WhatsApp Sharing Modal */}
      {completedInvoice && (
        <Modal
          isOpen={!!completedInvoice}
          onClose={() => setCompletedInvoice(null)}
          title={`Invoice #${completedInvoice.invoice_no} Generated`}
          subtitle="Tax invoice recorded successfully in database"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center space-y-1">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-full mx-auto flex items-center justify-center shadow-lg shadow-emerald-950/20">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="text-lg font-black text-slate-900 mt-2">
                ₹{Number(completedInvoice.total_amount || 0).toLocaleString('en-IN')}
              </div>
              <p className="text-[11px] text-slate-500">
                Customer: <strong className="text-slate-800">{completedInvoice.customer_name || 'Walk-in'}</strong> • Mode:{' '}
                <strong className="text-slate-800 uppercase">{completedInvoice.payment_mode}</strong>
              </p>
            </div>

            {/* WhatsApp Direct Share Button */}
            {completedInvoice.customer_phone && (
              <a
                href={`https://wa.me/91${completedInvoice.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Namaste ${completedInvoice.customer_name || 'Customer'},\n\nThank you for shopping with *${settings.shop_name}*!\n\n🧾 *Invoice No:* ${completedInvoice.invoice_no}\n📅 *Date:* ${completedInvoice.invoice_date}\n💰 *Total Amount:* ₹${completedInvoice.total_amount}\n\nFor any queries or medicine dosage assistance, call us at ${settings.phone || ''}.\n\nGet well soon! 🏥💊`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-950/20 transition-all text-xs"
              >
                <span>📲 Share Digital Invoice on WhatsApp</span>
              </a>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  triggerPrint(completedInvoice);
                }}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Re-print Invoice</span>
              </button>
              <button
                onClick={() => setCompletedInvoice(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
