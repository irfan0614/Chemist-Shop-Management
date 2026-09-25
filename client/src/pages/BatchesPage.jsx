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
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [togglingBlockId, setTogglingBlockId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Stock Adjustment State
  const [adjustBatch, setAdjustBatch] = useState(null);
  const [newStockVal, setNewStockVal] = useState('');
  const [adjustReason, setAdjustReason] = useState('Physical stock audit count');

  // Add Batch Modal State
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [newBatchForm, setNewBatchForm] = useState({
    medicine_id: '',
    batch_no: '',
    expiry_date: '',
    mfg_date: '',
    purchase_cost: '',
    mrp: '',
    selling_price: '',
    current_stock: '',
    rack_shelf: '',
  });

  const { showSuccess, showError } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [batchData, medData] = await Promise.all([
        api.get('/batches'),
        api.get('/medicines'),
      ]);
      setBatches(batchData || []);
      setMedicines(medData || []);
    } catch (err) {
      showError('Failed to load batch inventory: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAddBatch = () => {
    setNewBatchForm({
      medicine_id: medicines[0]?.id || '',
      batch_no: '',
      expiry_date: '',
      mfg_date: '',
      purchase_cost: '',
      mrp: '',
      selling_price: '',
      current_stock: '',
      rack_shelf: 'Rack A-1',
    });
    setIsAddBatchOpen(true);
  };

  const handleSaveNewBatch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newBatchForm.medicine_id) {
      showError('Please select a medicine');
      return;
    }
    if (!newBatchForm.batch_no.trim()) {
      showError('Batch Number is required');
      return;
    }
    if (!newBatchForm.expiry_date) {
      showError('Expiry Date is required');
      return;
    }

    setCreatingBatch(true);
    try {
      const payload = {
        ...newBatchForm,
        current_stock: parseInt(newBatchForm.current_stock) || 0,
        purchase_cost: parseFloat(newBatchForm.purchase_cost) || 0,
        mrp: parseFloat(newBatchForm.mrp) || 0,
        selling_price: parseFloat(newBatchForm.selling_price) || parseFloat(newBatchForm.mrp) || 0,
      };

      await api.post('/batches', payload);
      showSuccess(`Batch #${newBatchForm.batch_no} created and inwarded to inventory!`);
      setIsAddBatchOpen(false);
      loadData();
    } catch (err) {
      showError(err.message || 'Failed to create batch');
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleOpenAdjust = (b) => {
    setAdjustBatch(b);
    setNewStockVal(b.currentStock.toString());
    setAdjustReason('Physical stock audit count');
  };

  const handleSaveAdjustment = async () => {
    if (!adjustBatch) return;
    const val = parseInt(newStockVal);
    if (isNaN(val) || val < 0) {
      showError('Please enter a valid non-negative stock count');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put(`/batches/${adjustBatch.id}/stock`, {
        newStock: val,
        reason: adjustReason,
      });
      showSuccess(`Stock adjusted: ${res.oldStock || res.previousStock} → ${res.newStock} units`);
      setAdjustBatch(null);
      loadData();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBlock = async (b) => {
    setTogglingBlockId(b.id);
    try {
      const res = await api.put(`/batches/${b.id}/toggle-block`);
      showSuccess(`Batch ${b.batchNo} ${res.isBlocked ? 'locked / blocked from billing' : 'unlocked'}`);
      loadData();
    } catch (err) {
      showError(err.message);
    } finally {
      setTogglingBlockId(null);
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
      header: 'Batch No',
      key: 'batchNo',
      render: (b) => <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{b.batchNo}</span>,
    },
    {
      header: 'Expiry Date & FEFO',
      key: 'expiryDate',
      render: (b) => (
        <div>
          <div className="font-mono font-bold text-slate-900">{fmtDate(b.expiryDate)}</div>
          <div className="text-[10px] mt-0.5">
            {b.expiryStatus === 'EXPIRED' && (
              <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.2 rounded">EXPIRED ({Math.abs(b.daysToExpiry)}d ago)</span>
            )}
            {b.expiryStatus === 'NEAR_EXPIRY' && (
              <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.2 rounded">Near Expiry ({b.daysToExpiry}d left)</span>
            )}
            {b.expiryStatus === 'OK' && (
              <span className="text-emerald-700 font-medium">Valid ({b.daysToExpiry}d left)</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Purchase Rate',
      key: 'purchaseCost',
      align: 'right',
      render: (b) => <span className="font-mono text-slate-600">{fmtMoney(b.purchaseCost)}</span>,
    },
    {
      header: 'MRP / Retail',
      key: 'mrp',
      align: 'right',
      render: (b) => (
        <div className="text-right">
          <div className="font-mono font-bold text-slate-900">{fmtMoney(b.mrp)}</div>
          {b.sellingPrice !== b.mrp && (
            <div className="text-[10px] font-mono text-emerald-700">Sell: {fmtMoney(b.sellingPrice)}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Current Stock',
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
            loading={togglingBlockId === b.id}
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

          <Button
            variant="primary"
            icon={Plus}
            onClick={handleOpenAddBatch}
          >
            + Inward Batch
          </Button>
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

      {/* Modal: Direct Inward / Add Batch */}
      <Modal
        isOpen={isAddBatchOpen}
        onClose={() => setIsAddBatchOpen(false)}
        title="Direct Batch Inward / Entry"
        subtitle="Add a new production batch or opening consignment for an existing medicine"
      >
        <form onSubmit={handleSaveNewBatch} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Medicine *</label>
            <select
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
              value={newBatchForm.medicine_id}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, medicine_id: e.target.value })}
            >
              <option value="">-- Choose Medicine from Catalog --</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.strength ? `(${m.strength})` : ''} · {m.dosage_form || 'Tablet'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Batch Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. B2401, LOT-890"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold uppercase"
                value={newBatchForm.batch_no}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, batch_no: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Expiry Date *</label>
              <input
                type="date"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold"
                value={newBatchForm.expiry_date}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, expiry_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Mfg Date (Optional)</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                value={newBatchForm.mfg_date}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, mfg_date: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Rack / Shelf Location</label>
              <input
                type="text"
                placeholder="e.g. Rack A-1, Fridge"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                value={newBatchForm.rack_shelf}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, rack_shelf: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Received Stock Qty (Units) *</label>
              <input
                type="number"
                min="0"
                required
                placeholder="50"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold text-emerald-800"
                value={newBatchForm.current_stock}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, current_stock: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Purchase Cost Rate (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="85.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                value={newBatchForm.purchase_cost}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, purchase_cost: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Retail MRP (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="110.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold"
                value={newBatchForm.mrp}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, mrp: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Selling Price (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Same as MRP"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                value={newBatchForm.selling_price}
                onChange={(e) => setNewBatchForm({ ...newBatchForm, selling_price: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsAddBatchOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={creatingBatch}
              loadingText="Inwarding Batch…"
            >
              Confirm & Inward Batch
            </Button>
          </div>
        </form>
      </Modal>

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
              loading={saving}
              loadingText="Saving Adjustment…"
            >
              Save Adjustment & Audit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
