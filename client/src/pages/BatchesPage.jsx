import React, { useState, useEffect, useCallback } from 'react';
import { Boxes, AlertTriangle, Clock, Edit, ShieldAlert, CheckCircle2, Lock, Unlock, Plus } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Badge, DrugScheduleBadge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';

export function BatchesPage() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [adjustBatch, setAdjustBatch] = useState(null);
  const [newStockVal, setNewStockVal] = useState('');
  const [adjustReason, setAdjustReason] = useState('Physical audit count');
  const { showSuccess, showError } = useToast();

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/batches');
      setBatches(data);
    } catch (err) {
      showError('Failed to load batch inventory: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleOpenAdjust = (b) => {
    setAdjustBatch(b);
    setNewStockVal(b.currentStock.toString());
    setAdjustReason('Physical stock audit');
  };

  const handleSaveAdjustment = async () => {
    if (!adjustBatch) return;
    const val = parseInt(newStockVal);
    if (isNaN(val) || val < 0) {
      showError('Please enter a valid non-negative stock count');
      return;
    }

    try {
      const res = await api.put(`/batches/${adjustBatch.id}/adjust-stock`, {
        newStock: val,
        reason: adjustReason,
      });
      showSuccess(`Stock adjusted: ${res.oldStock} → ${res.newStock} units`);
      setAdjustBatch(null);
      loadBatches();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleToggleBlock = async (b) => {
    try {
      const res = await api.put(`/batches/${b.id}/toggle-block`);
      showSuccess(`Batch ${b.batchNo} ${res.isBlocked ? 'locked / blocked from billing' : 'unlocked'}`);
      loadBatches();
    } catch (err) {
      showError(err.message);
    }
  };

  // Status Filter
  const filtered = batches.filter((b) => {
    if (statusFilter === 'NEAR_EXPIRY') return b.expiryStatus === 'NEAR_EXPIRY';
    if (statusFilter === 'EXPIRED') return b.expiryStatus === 'EXPIRED';
    if (statusFilter === 'LOW_STOCK') return b.isLowStock;
    return true;
  });

  const columns = [
    {
      header: 'Medicine',
      key: 'medicineName',
      render: (b) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <span>{b.medicineName}</span>
            <DrugScheduleBadge scheduleType={b.scheduleType} />
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            Pack: {b.packSize} {b.unit} · Rack: <strong className="text-slate-700">{b.rackShelf}</strong>
          </div>
        </div>
      ),
    },
    {
      header: 'Batch No.',
      key: 'batchNo',
      render: (b) => (
        <div className="font-mono">
          <div className="font-bold text-slate-900">{b.batchNo}</div>
          <div className="text-[10px] text-slate-400">MFD: {fmtDate(b.mfgDate)}</div>
        </div>
      ),
    },
    {
      header: 'Expiry Date',
      key: 'expiryDate',
      render: (b) => {
        let tone = 'ok';
        let label = `${b.daysToExpiry} days left`;
        if (b.expiryStatus === 'EXPIRED') {
          tone = 'alert';
          label = 'EXPIRED';
        } else if (b.expiryStatus === 'NEAR_EXPIRY') {
          tone = 'warn';
          label = `${b.daysToExpiry}d (Expiring)`;
        }
        return (
          <div className="space-y-0.5 font-mono">
            <div className="font-bold text-slate-800">{fmtDate(b.expiryDate)}</div>
            <Badge tone={tone}>{label}</Badge>
          </div>
        );
      },
    },
    {
      header: 'Cost / MRP / Selling',
      key: 'purchaseCost',
      align: 'right',
      render: (b) => (
        <div className="text-right font-mono text-[11px]">
          <div>Rate: <strong className="text-emerald-700">{fmtMoney(b.sellingPrice)}</strong></div>
          <div className="text-slate-400">MRP: {fmtMoney(b.mrp)} · Cost: {fmtMoney(b.purchaseCost)}</div>
        </div>
      ),
    },
    {
      header: 'Available Stock',
      key: 'currentStock',
      align: 'right',
      render: (b) => (
        <div className="text-right font-mono">
          <div className={`text-sm font-extrabold ${b.isLowStock ? 'text-amber-600' : 'text-slate-900'}`}>
            {b.currentStock} {b.unit}
          </div>
          {b.isBlocked && <span className="text-[10px] text-rose-600 font-bold block">BLOCKED</span>}
        </div>
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'center',
      sortable: false,
      exportable: false,
      render: (b) => (
        <div className="flex items-center justify-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => handleOpenAdjust(b)}
            className="hover:bg-emerald-50 hover:text-emerald-700"
          >
            Adjust Stock
          </Button>
          <Button
            size="icon-sm"
            variant={b.isBlocked ? 'danger-outline' : 'outline'}
            onClick={() => handleToggleBlock(b)}
            title={b.isBlocked ? 'Unlock Batch' : 'Block Batch from Sales'}
            icon={b.isBlocked ? Lock : Unlock}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Batch-wise Inventory & FEFO Engine</h1>
          <p className="text-xs text-slate-400">Manage individual medicine batches, physical adjustments, and expiry states</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Batches</option>
            <option value="NEAR_EXPIRY">Near Expiry (&lt; 90 days)</option>
            <option value="EXPIRED">Expired Batches (Blocked)</option>
            <option value="LOW_STOCK">Low Stock Batches</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Search batches by medicine, batch number, or rack location…"
        searchFields={['medicineName', 'batchNo', 'rackShelf', 'genericName']}
        exportFilename="batch_inventory_report"
      />

      {/* Stock Adjustment Modal */}
      <Modal
        isOpen={!!adjustBatch}
        onClose={() => setAdjustBatch(null)}
        title={`Stock Adjustment — ${adjustBatch?.medicineName || ''}`}
        subtitle={`Batch #${adjustBatch?.batchNo || ''} (Current: ${adjustBatch?.currentStock || 0} units)`}
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">New Physical Count (Units) *</label>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none"
              value={newStockVal}
              onChange={(e) => setNewStockVal(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Reason for Stock Adjustment *</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            >
              <option value="Physical stock audit count">Physical stock audit count</option>
              <option value="Damaged / Broken in store">Damaged / Broken in store</option>
              <option value="Supplier replacement received">Supplier replacement received</option>
              <option value="Sample / Doctor giveaway">Sample / Doctor giveaway</option>
              <option value="Correction of purchase entry error">Correction of purchase entry error</option>
            </select>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setAdjustBatch(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAdjustment}
            >
              Save Adjustment & Audit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
