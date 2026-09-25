import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Receipt,
  Boxes,
  AlertTriangle,
  Clock,
  Wallet,
  ShoppingBag,
  Plus,
  ArrowUpRight,
  ShieldAlert,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';
import { useToast } from '../context/ToastContext';

export function DashboardPage({ setView }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await api.get('/reports/dashboard-summary');
      setData(summary);
    } catch (err) {
      showError('Failed to load dashboard metrics: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2 text-slate-400 text-xs font-semibold">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
          <span>Loading live pharmacy metrics…</span>
        </div>
      </div>
    );
  }

  const d = data || {};

  return (
    <div className="space-y-6">
      {/* Compliance Alert Banner (Drug License & Subscription Expiry) */}
      {d.shop && (() => {
        if (!d.shop) return null;

        const getDays = (dateStr) => {
          if (!dateStr) return null;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return Math.round((new Date(dateStr + 'T00:00:00') - today) / (1000 * 60 * 60 * 24));
        };
        const dlDays = getDays(d.shop.drugLicenseExpiry);
        const subDays = getDays(d.shop.subscriptionExpiry);

        const dlWarning = dlDays !== null && dlDays <= 90;
        const subWarning = subDays !== null && subDays <= 30;

        if (!dlWarning && !subWarning) return null;

        return (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 shadow-md shadow-amber-900/20">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Medical Store Regulatory & License Notification</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded uppercase">
                    Compliance Action Required
                  </span>
                </div>
                <p className="text-slate-600 text-[11px]">
                  {dlWarning && (
                    <span className="mr-3">
                      • Form 20B/21B Drug License ({d.shop.dlNumber20b || 'DL-20B'}) expires in{' '}
                      <strong className="text-amber-700 font-mono font-bold">{dlDays} days</strong> ({d.shop.drugLicenseExpiry}).
                    </span>
                  )}
                  {subWarning && (
                    <span>
                      • Pharmacy Cloud SaaS Subscription ({d.shop.plan} Plan) renewal due in{' '}
                      <strong className="text-amber-700 font-mono font-bold">{subDays} days</strong>.
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => setView('settings')}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors shrink-0"
            >
              Update Shop Profile
            </button>
          </div>
        );
      })()}

      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-3xl p-4 sm:p-6 shadow-xl shadow-emerald-950/10 relative overflow-hidden">
        <div className="relative z-10 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30">
            Store Operations Overview
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Pharmacy Daily Dashboard</h1>
          <p className="text-xs text-emerald-100/70 max-w-xl">
            Real-time monitoring of counter sales, batch-wise inventory, drug compliance, and supplier payables.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 relative z-10">
          <button
            onClick={() => setView('pos')}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-950/40 transition-transform active:scale-95"
          >
            <Receipt className="w-4 h-4" />
            <span>Fast POS Bill (F2)</span>
          </button>
          <button
            onClick={() => setView('purchases')}
            className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-xs backdrop-blur-sm border border-white/10 transition-colors"
          >
            <ShoppingBag className="w-4 h-4 text-emerald-300" />
            <span>Inward Purchase</span>
          </button>
          <button
            onClick={() => setView('medicines')}
            className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-xs backdrop-blur-sm border border-white/10 transition-colors"
          >
            <Plus className="w-4 h-4 text-emerald-300" />
            <span>Add Medicine</span>
          </button>
        </div>

        {/* Subtle Background Art */}
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Today's Sales"
          value={fmtMoney(d.todaysSales)}
          icon={TrendingUp}
          tone="ok"
          subtext={`${d.todaysBillsCount || 0} bills completed today`}
          onClick={() => setView('history')}
        />
        <StatCard
          label="Est. Gross Profit"
          value={fmtMoney(d.estimatedGrossProfit)}
          icon={Wallet}
          tone="ok"
          subtext="Revenue minus purchase cost"
          onClick={() => setView('reports')}
        />
        <StatCard
          label="Low Stock Items"
          value={d.lowStockCount || 0}
          icon={AlertTriangle}
          tone={d.lowStockCount > 0 ? 'warn' : 'neutral'}
          subtext="Below reorder threshold"
          onClick={() => setView('batches')}
        />
        <StatCard
          label="Near-Expiry / Expired"
          value={(d.nearExpiryCount || 0) + (d.expiredCount || 0)}
          icon={Clock}
          tone={d.expiredCount > 0 ? 'alert' : d.nearExpiryCount > 0 ? 'warn' : 'neutral'}
          subtext={`${d.expiredCount || 0} expired (locked)`}
          onClick={() => setView('batches')}
        />
      </div>

      {/* Secondary Financial & Inventory Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Payment Modes Today */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Today's Collections</h3>
            <span className="text-xs font-bold font-mono text-slate-900">{fmtMoney(d.todaysSales)}</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Cash Collections</span>
              <span className="font-mono font-bold text-slate-900">{fmtMoney(d.cashSales)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">UPI / QR Payments</span>
              <span className="font-mono font-bold text-emerald-700">{fmtMoney(d.upiSales)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Credit / Khata Given</span>
              <span className="font-mono font-bold text-amber-700">{fmtMoney(d.creditSales)}</span>
            </div>
          </div>
        </div>

        {/* Stock Valuation */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Inventory Valuation</h3>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Live Store</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Cost Valuation</span>
              <span className="font-mono font-bold text-slate-900">{fmtMoney(d.totalStockValuation)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Retail MRP Valuation</span>
              <span className="font-mono font-bold text-emerald-700">{fmtMoney(d.totalStockMrpValuation)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Total Available Units</span>
              <span className="font-mono font-bold text-slate-900">{d.totalUnitsInStock || 0} Units</span>
            </div>
          </div>
        </div>

        {/* Khata & Payables */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ledger Outstanding</h3>
            <span className="text-xs font-semibold text-slate-400">Receivables vs Payables</span>
          </div>
          <div className="space-y-2 text-xs">
            <div
              onClick={() => setView('customers')}
              className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 border border-emerald-100 hover:bg-emerald-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-emerald-900">Customer Khata Dues</span>
              </div>
              <span className="font-mono font-bold text-emerald-800">{fmtMoney(d.customerReceivables)}</span>
            </div>
            <div
              onClick={() => setView('suppliers')}
              className="flex items-center justify-between p-2 rounded-xl bg-rose-50/50 border border-rose-100 hover:bg-rose-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-rose-600" />
                <span className="font-semibold text-rose-900">Supplier Payables</span>
              </div>
              <span className="font-mono font-bold text-rose-800">{fmtMoney(d.supplierPayables)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Counter Transactions Feed */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent POS Sales</h3>
            <p className="text-xs text-slate-400">Latest receipts generated at billing counters</p>
          </div>
          <button
            onClick={() => setView('history')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
          >
            View All Sales →
          </button>
        </div>

        {d.recentBills && d.recentBills.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {d.recentBills.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono font-bold text-slate-900">{b.invoiceNo}</div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Patient: {b.customerName || 'Walk-in'} · Pay: <span className="uppercase font-semibold">{b.paymentMode}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-700 text-sm">{fmtMoney(b.total)}</div>
                  <div className="text-[10px] text-slate-400">{new Date(b.time).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 text-xs">No sales recorded yet today. Click "Fast POS Bill" to start.</div>
        )}
      </div>
    </div>
  );
}
