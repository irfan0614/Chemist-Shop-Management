import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Phone, MapPin, DollarSign, CreditCard, Clock } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { fmtMoney } from '../utils/formatters';

export function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [collectCust, setCollectCust] = useState(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState('CASH');
  const [collectRef, setCollectRef] = useState('');
  const { showSuccess, showError } = useToast();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    preferredDoctor: '',
    creditLimit: 5000,
    customerType: 'REGULAR',
    discountPercent: 0,
  });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/customers');
      setCustomers(data);
    } catch (err) {
      showError('Failed to load customers: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleSaveCustomer = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      showError('Customer name and phone number are required');
      return;
    }

    try {
      await api.post('/customers', form);
      showSuccess(`Customer "${form.name}" registered successfully!`);
      setIsAddModalOpen(false);
      loadCustomers();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleCollectPayment = async () => {
    if (!collectCust) return;
    const amount = parseFloat(collectAmount);
    if (!amount || amount <= 0) {
      showError('Please enter a valid collection amount');
      return;
    }

    try {
      const res = await api.post(`/customers/${collectCust.id}/collect-payment`, {
        amount,
        paymentMode: collectMode,
        referenceNo: collectRef,
      });
      showSuccess(`Collected ${fmtMoney(amount)} from ${collectCust.name}. Remaining Due: ${fmtMoney(res.newBalance)}`);
      setCollectCust(null);
      setCollectAmount('');
      loadCustomers();
    } catch (err) {
      showError(err.message);
    }
  };

  const columns = [
    {
      header: 'Customer Name',
      key: 'name',
      render: (c) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <span>{c.name}</span>
            <Badge tone={c.customerType === 'SENIOR_CITIZEN' ? 'purple' : c.customerType === 'REGULAR' ? 'ok' : 'neutral'}>
              {c.customerType}
            </Badge>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">Ph: {c.phone}</div>
        </div>
      ),
    },
    {
      header: 'Doctor / Clinic',
      key: 'preferredDoctor',
      render: (c) => <span className="text-xs text-slate-700">{c.preferredDoctor || '—'}</span>,
    },
    {
      header: 'Special Discount',
      key: 'discountPercent',
      align: 'center',
      render: (c) => <span className="font-mono font-bold text-emerald-700">{c.discountPercent}%</span>,
    },
    {
      header: 'Credit Limit',
      key: 'creditLimit',
      align: 'right',
      render: (c) => <span className="font-mono text-slate-600">{fmtMoney(c.creditLimit)}</span>,
    },
    {
      header: 'Khata Outstanding',
      key: 'currentBalance',
      align: 'right',
      render: (c) => (
        <div className="text-right font-mono">
          <div className={`font-bold ${c.currentBalance > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {fmtMoney(c.currentBalance)}
          </div>
          <div className="text-[10px] text-slate-400">{c.totalPurchases || 0} visits</div>
        </div>
      ),
    },
    {
      header: 'Action',
      key: 'actions',
      align: 'center',
      sortable: false,
      exportable: false,
      render: (c) => (
        <button
          onClick={() => {
            setCollectCust(c);
            setCollectAmount(c.currentBalance.toString());
          }}
          disabled={c.currentBalance <= 0}
          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-40 disabled:pointer-events-none rounded-lg text-xs font-bold transition-colors"
        >
          Collect Due
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Customer & Patient Khata Directory</h1>
          <p className="text-xs text-slate-400">Manage patient credit accounts, due payment receipts, and loyalty discounts</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={customers}
        searchPlaceholder="Search customers by name, phone, or address…"
        searchFields={['name', 'phone', 'preferredDoctor', 'address']}
        exportFilename="customer_khata_directory"
      />

      {/* Add Customer Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Patient / Khata Customer"
        subtitle="Set credit limit and default discount percentage"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs focus:outline-none"
                placeholder="e.g. Anil Kashyap"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Mobile Phone *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                placeholder="98xxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer Type</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                value={form.customerType}
                onChange={(e) => setForm({ ...form, customerType: e.target.value })}
              >
                <option value="REGULAR">Regular Patient</option>
                <option value="SENIOR_CITIZEN">Senior Citizen (10% Discount)</option>
                <option value="RETAIL">Retail / Walk-in</option>
                <option value="WHOLESALE">Wholesale / Clinic</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Special Discount %</label>
              <input
                type="number"
                min="0"
                max="50"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Credit Limit (₹)</label>
              <input
                type="number"
                step="500"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Consulting Doctor</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="Dr. S. K. Gupta"
                value={form.preferredDoctor}
                onChange={(e) => setForm({ ...form, preferredDoctor: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Residential Address</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="House No, Street, Landmark"
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
              onClick={handleSaveCustomer}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Save Customer
            </button>
          </div>
        </div>
      </Modal>

      {/* Collect Khata Payment Modal */}
      <Modal
        isOpen={!!collectCust}
        onClose={() => setCollectCust(null)}
        title={`Collect Khata Due — ${collectCust?.name || ''}`}
        subtitle={`Outstanding Ledger Balance: ${fmtMoney(collectCust?.currentBalance || 0)}`}
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount Collected (₹) *</label>
            <input
              type="number"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm focus:outline-none"
              value={collectAmount}
              onChange={(e) => setCollectAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Mode</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              value={collectMode}
              onChange={(e) => setCollectMode(e.target.value)}
            >
              <option value="CASH">Cash (In Drawer)</option>
              <option value="UPI">UPI / QR</option>
              <option value="CARD">Debit / Credit Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Ref / Receipt Note</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
              placeholder="e.g. Cash handed over at counter"
              value={collectRef}
              onChange={(e) => setCollectRef(e.target.value)}
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => setCollectCust(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleCollectPayment}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Confirm Collection Receipt
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
