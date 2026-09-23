import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Phone, MapPin, DollarSign, CreditCard, Building2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { fmtMoney } from '../utils/formatters';

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [paySupplier, setPaySupplier] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('NEFT/RTGS');
  const [payRef, setPayRef] = useState('');
  const { showSuccess, showError } = useToast();

  const [form, setForm] = useState({
    name: '',
    companyName: '',
    contactPerson: '',
    phone: '',
    altPhone: '',
    email: '',
    address: '',
    city: 'New Delhi',
    state: 'Delhi',
    gstin: '',
    dlNumbers: '',
    paymentTermsDays: 30,
    creditLimit: 100000,
  });

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/suppliers');
      setSuppliers(data);
    } catch (err) {
      showError('Failed to load suppliers: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleSaveSupplier = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      showError('Supplier name and contact phone are required');
      return;
    }

    try {
      await api.post('/suppliers', form);
      showSuccess(`Supplier "${form.companyName || form.name}" registered successfully!`);
      setIsAddModalOpen(false);
      loadSuppliers();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleRecordPayment = async () => {
    if (!paySupplier) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      showError('Please enter a valid payment amount');
      return;
    }

    try {
      const res = await api.post(`/suppliers/${paySupplier.id}/pay`, {
        amount,
        paymentMode: payMode,
        referenceNo: payRef,
      });
      showSuccess(`Recorded payment of ${fmtMoney(amount)} to ${paySupplier.name}`);
      setPaySupplier(null);
      setPayAmount('');
      setPayRef('');
      loadSuppliers();
    } catch (err) {
      showError(err.message);
    }
  };

  const columns = [
    {
      header: 'Supplier & Agency',
      key: 'name',
      render: (s) => (
        <div>
          <div className="font-bold text-slate-900">{s.companyName || s.name}</div>
          <div className="text-[11px] text-slate-500">Contact: {s.contactPerson || s.name}</div>
          {s.gstin && <div className="text-[10px] font-mono text-slate-400">GSTIN: {s.gstin}</div>}
        </div>
      ),
    },
    {
      header: 'Phone & City',
      key: 'phone',
      render: (s) => (
        <div className="text-xs">
          <div className="font-mono font-bold text-slate-800">{s.phone}</div>
          <div className="text-[11px] text-slate-500">{s.city}, {s.state}</div>
        </div>
      ),
    },
    {
      header: 'Drug Licenses',
      key: 'dlNumbers',
      render: (s) => <span className="font-mono text-[11px] text-slate-600">{s.dlNumbers || '—'}</span>,
    },
    {
      header: 'Credit Terms',
      key: 'paymentTermsDays',
      render: (s) => <span className="font-mono">{s.paymentTermsDays || 30} Days</span>,
    },
    {
      header: 'Outstanding Balance',
      key: 'currentBalance',
      align: 'right',
      render: (s) => (
        <div className="text-right font-mono">
          <div className={`font-bold ${s.currentBalance > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {fmtMoney(s.currentBalance)}
          </div>
          <div className="text-[10px] text-slate-400">{s.purchaseCount || 0} bills</div>
        </div>
      ),
    },
    {
      header: 'Action',
      key: 'actions',
      align: 'center',
      sortable: false,
      exportable: false,
      render: (s) => (
        <button
          onClick={() => {
            setPaySupplier(s);
            setPayAmount(s.currentBalance.toString());
          }}
          disabled={s.currentBalance <= 0}
          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-40 disabled:pointer-events-none rounded-lg text-xs font-bold transition-colors"
        >
          Pay Due
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Pharma Distributors & Suppliers</h1>
          <p className="text-xs text-slate-400">Manage pharmaceutical stockists, GSTIN, payment terms, and payables</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Supplier</span>
        </button>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={suppliers}
        searchPlaceholder="Search suppliers by agency name, phone, or GSTIN…"
        searchFields={['name', 'companyName', 'phone', 'gstin', 'city']}
        exportFilename="supplier_directory"
      />

      {/* Add Supplier Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Pharmaceutical Supplier / Distributor"
        subtitle="Register distributor profile, GSTIN, and credit payment terms"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Company / Agency Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs focus:outline-none"
                placeholder="e.g. MedPlus Pharma Distributors"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value, name: form.name || e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Contact Person</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="e.g. Sanjay Gupta"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Mobile Phone *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                placeholder="+91 98xxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Email Address</label>
              <input
                type="email"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="orders@agency.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">GSTIN Number</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none uppercase"
                placeholder="07AAAAA0000A1Z5"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Drug License Numbers (20B/21B)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                placeholder="DL-20B-8812, DL-21B-8813"
                value={form.dlNumbers}
                onChange={(e) => setForm({ ...form, dlNumbers: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Warehouse Address</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="Plot / Street, Area, City"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSupplier}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Save Supplier
            </button>
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={!!paySupplier}
        onClose={() => setPaySupplier(null)}
        title={`Record Supplier Payment — ${paySupplier?.companyName || paySupplier?.name || ''}`}
        subtitle={`Current Payable Due: ${fmtMoney(paySupplier?.currentBalance || 0)}`}
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount to Pay (₹) *</label>
            <input
              type="number"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm focus:outline-none"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Mode</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
            >
              <option value="NEFT/RTGS">NEFT / Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="UPI">UPI / QR</option>
              <option value="CASH">Cash</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Bank UTR / Cheque / Ref Number</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
              placeholder="UTR-12948293"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => setPaySupplier(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleRecordPayment}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Confirm Settlement
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
