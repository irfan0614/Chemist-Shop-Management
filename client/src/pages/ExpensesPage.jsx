import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, DollarSign, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';

export function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cashRegister, setCashRegister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCloseDrawerModalOpen, setIsCloseDrawerModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const { showSuccess, showError } = useToast();

  const [form, setForm] = useState({
    categoryId: '',
    title: '',
    amount: '',
    paymentMode: 'CASH',
    paidTo: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [exps, cats, reg] = await Promise.all([
        api.get('/expenses'),
        api.get('/expenses/categories'),
        api.get('/expenses/cash-register/status'),
      ]);
      setExpenses(exps);
      setCategories(cats);
      setCashRegister(reg);
      if (cats.length > 0) setForm((f) => ({ ...f, categoryId: cats[0].id }));
    } catch (err) {
      showError('Failed to load expense records: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveExpense = async () => {
    if (!form.title.trim() || !form.amount || parseFloat(form.amount) <= 0) {
      showError('Expense title and valid amount are required');
      return;
    }

    try {
      await api.post('/expenses', form);
      showSuccess(`Expense "${form.title}" recorded successfully!`);
      setIsAddModalOpen(false);
      setForm((f) => ({ ...f, title: '', amount: '', paidTo: '', notes: '' }));
      loadData();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleCloseDrawer = async () => {
    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) {
      showError('Please enter the physical cash counted in drawer');
      return;
    }

    try {
      const res = await api.post('/expenses/cash-register/close', {
        countedClosingCash: counted,
        notes: closeNotes,
      });
      showSuccess(`Day-End Cash Drawer closed. Difference: ${fmtMoney(res.cash_difference)}`);
      setIsCloseDrawerModalOpen(false);
      loadData();
    } catch (err) {
      showError(err.message);
    }
  };

  const columns = [
    {
      header: 'Expense Title',
      key: 'title',
      render: (e) => (
        <div>
          <div className="font-bold text-slate-900">{e.title}</div>
          {e.paid_to && <div className="text-[10px] text-slate-400">Paid to: {e.paid_to}</div>}
        </div>
      ),
    },
    {
      header: 'Category',
      key: 'categoryName',
      render: (e) => <Badge tone="neutral">{e.categoryName}</Badge>,
    },
    {
      header: 'Date',
      key: 'expense_date',
      render: (e) => <span className="font-mono">{fmtDate(e.expense_date)}</span>,
    },
    {
      header: 'Payment Mode',
      key: 'payment_mode',
      render: (e) => <span className="font-semibold text-slate-700">{e.payment_mode}</span>,
    },
    {
      header: 'Amount',
      key: 'amount',
      align: 'right',
      render: (e) => <span className="font-mono font-bold text-rose-700">{fmtMoney(e.amount)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header & Cash Drawer Reconciliation Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Drawer Status Card */}
        <div className="md:col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Daily Cash Drawer Status</span>
              <Badge tone={cashRegister?.status === 'OPEN' ? 'ok' : 'neutral'}>{cashRegister?.status || 'OPEN'}</Badge>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight">{fmtMoney(cashRegister?.expected_cash || 0)}</div>
            <div className="text-[11px] text-slate-300">
              Opening: {fmtMoney(cashRegister?.opening_cash)} · Sales In: {fmtMoney(cashRegister?.cash_sales)} · Expenses Out: {fmtMoney(cashRegister?.cash_expenses)}
            </div>
          </div>

          {cashRegister?.status === 'OPEN' ? (
            <button
              onClick={() => {
                setCountedCash(cashRegister?.expected_cash?.toString() || '');
                setIsCloseDrawerModalOpen(true);
              }}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition-all shrink-0"
            >
              Close Cash Drawer (Day End)
            </button>
          ) : (
            <div className="text-right font-mono text-xs">
              <div className="text-emerald-400 font-bold">Closed at {new Date(cashRegister?.closed_at).toLocaleTimeString()}</div>
              <div className="text-slate-400">Counted: {fmtMoney(cashRegister?.closing_cash)}</div>
            </div>
          )}
        </div>

        {/* Add Expense Action */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Store Operations</h3>
            <p className="text-xs text-slate-400 mt-1">Record rent, utility, logistics, and pantry vouchers</p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Record New Expense</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={expenses}
        searchPlaceholder="Search store expenses by title, category, or recipient…"
        searchFields={['title', 'categoryName', 'paid_to', 'payment_mode']}
        exportFilename="pharmacy_expenses_register"
      />

      {/* Record Expense Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Operating Expense"
        subtitle="Deducts automatically from daily cash drawer if paid in cash"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Expense Title *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              placeholder="e.g. Electricity Bill / Thermal Paper Rolls"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Category</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount (₹) *</label>
              <input
                type="number"
                step="10"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm focus:outline-none"
                placeholder="450"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Payment Mode</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                value={form.paymentMode}
                onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
              >
                <option value="CASH">Cash Drawer</option>
                <option value="UPI">UPI / QR</option>
                <option value="BANK_TRANSFER">Bank Account</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Paid To / Vendor</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="e.g. BSES / Super Stationery"
                value={form.paidTo}
                onChange={(e) => setForm({ ...form, paidTo: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Notes</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
              placeholder="Voucher details..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveExpense}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Save Expense Voucher
            </button>
          </div>
        </div>
      </Modal>

      {/* Cash Drawer Close Modal */}
      <Modal
        isOpen={isCloseDrawerModalOpen}
        onClose={() => setIsCloseDrawerModalOpen(false)}
        title="Close Daily Cash Register (Day End)"
        subtitle={`System Expected Balance: ${fmtMoney(cashRegister?.expected_cash || 0)}`}
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Physical Cash Counted in Drawer (₹) *</label>
            <input
              type="number"
              step="10"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm focus:outline-none"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
            />
          </div>

          {parseFloat(countedCash) !== cashRegister?.expected_cash && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
              Difference: {fmtMoney(parseFloat(countedCash || 0) - (cashRegister?.expected_cash || 0))}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Day Close Notes</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              placeholder="e.g. Verified by Pharmacist on duty"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={() => setIsCloseDrawerModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleCloseDrawer}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs"
            >
              Confirm Day End Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
