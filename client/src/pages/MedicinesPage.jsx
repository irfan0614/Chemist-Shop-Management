import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Filter, Package, AlertCircle, Search, UploadCloud, FileSpreadsheet, Download } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Badge, DrugScheduleBadge } from '../components/common/Badge';
import { fmtMoney, fmtDate } from '../utils/formatters';
import { BulkMedicineExcelModal } from '../components/medicines/BulkMedicineExcelModal';
import { triggerExcelTemplateDownload, exportMedicinesToExcel } from '../utils/excelParser';

export function MedicinesPage() {
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | 'add' | 'edit'
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [selectedMed, setSelectedMed] = useState(null);
  const [filterSchedule, setFilterSchedule] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('');
  const { showSuccess, showError } = useToast();

  const [form, setForm] = useState({
    name: '',
    generic_name: '',
    brand: '',
    manufacturer: '',
    category_id: '',
    salt_composition: '',
    dosage_form: 'Tablet',
    strength: '',
    pack_size: 10,
    unit: 'Strips',
    barcode: '',
    hsn_code: '3004',
    gst_rate: 12.0,
    schedule_type: 'NONE',
    is_prescription_required: false,
    reorder_level: 15,
    storage_temperature: 'Room Temperature',
    // Optional initial batch
    batch_no: '',
    expiry_date: '',
    mfg_date: '',
    purchase_cost: '',
    mrp: '',
    selling_price: '',
    initial_stock: '',
    rack_shelf: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [meds, cats] = await Promise.all([
        api.get('/medicines'),
        api.get('/medicines/categories'),
      ]);
      setMedicines(Array.isArray(meds) ? meds : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) {
      showError('Failed to load medicines: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setSelectedMed(null);
    setForm({
      name: '',
      generic_name: '',
      brand: '',
      manufacturer: '',
      category_id: categories[0]?.id || '',
      salt_composition: '',
      dosage_form: 'Tablet',
      strength: '',
      pack_size: 10,
      unit: 'Strips',
      barcode: '',
      hsn_code: '3004',
      gst_rate: 12.0,
      schedule_type: 'NONE',
      is_prescription_required: false,
      reorder_level: 15,
      storage_temperature: 'Room Temperature',
      batch_no: '',
      expiry_date: '',
      mfg_date: '',
      purchase_cost: '',
      mrp: '',
      selling_price: '',
      initial_stock: '',
      rack_shelf: '',
    });
    setModalMode('add');
  };

  const handleOpenEdit = (med) => {
    setSelectedMed(med);
    setForm({
      name: med.name || '',
      generic_name: med.generic_name || '',
      brand: med.brand || '',
      manufacturer: med.manufacturer || '',
      category_id: med.category_id || (categories[0]?.id || ''),
      salt_composition: med.salt_composition || '',
      dosage_form: med.dosage_form || 'Tablet',
      strength: med.strength || '',
      pack_size: med.pack_size || 10,
      unit: med.unit || 'Strips',
      barcode: med.barcode || '',
      hsn_code: med.hsn_code || '3004',
      gst_rate: med.gst_rate || 12.0,
      schedule_type: med.schedule_type || 'NONE',
      is_prescription_required: !!med.is_prescription_required,
      reorder_level: med.reorder_level || 15,
      storage_temperature: med.storage_temperature || 'Room Temperature',
    });
    setModalMode('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showError('Medicine Name is required.');
      return;
    }

    const payload = {
      ...form,
      category_id: form.category_id && form.category_id.trim() !== '' ? form.category_id.trim() : null,
    };

    setSaving(true);
    try {
      if (modalMode === 'add') {
        const created = await api.post('/medicines', payload);
        showSuccess(`Medicine "${created.name}" created successfully!`);
      } else {
        const updated = await api.put(`/medicines/${selectedMed.id}`, payload);
        showSuccess(`Medicine "${updated.name}" updated successfully!`);
      }
      setModalMode(null);
      await loadData();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate "${name}"?`)) return;
    setDeletingId(id);
    try {
      await api.del(`/medicines/${id}`);
      showSuccess(`Medicine "${name}" deactivated.`);
      loadData();
    } catch (err) {
      showError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered data
  const filteredMedicines = medicines.filter((m) => {
    if (filterSchedule !== 'ALL' && m.schedule_type !== filterSchedule) return false;
    if (filterCategory && m.category_id !== filterCategory) return false;
    return true;
  });

  const columns = [
    {
      header: 'Medicine & Composition',
      key: 'name',
      render: (m) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <span>{m.name}</span>
            <DrugScheduleBadge scheduleType={m.schedule_type} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {m.generic_name} {m.strength ? `· ${m.strength}` : ''}
          </div>
          {m.brand && <div className="text-[10px] text-slate-400">Brand: {m.brand} · Mfr: {m.manufacturer || '—'}</div>}
        </div>
      ),
    },
    {
      header: 'Category',
      key: 'categoryName',
      render: (m) => <Badge tone="neutral">{m.categoryName || 'General'}</Badge>,
    },
    {
      header: 'Pack / Unit',
      key: 'pack_size',
      render: (m) => (
        <span className="font-mono text-slate-700">
          {m.pack_size} / {m.unit}
        </span>
      ),
    },
    {
      header: 'GST & HSN',
      key: 'gst_rate',
      render: (m) => (
        <div className="font-mono text-[11px]">
          <div>{m.gst_rate}% GST</div>
          <div className="text-slate-400">HSN: {m.hsn_code}</div>
        </div>
      ),
    },
    {
      header: 'Total Stock',
      key: 'totalStock',
      align: 'right',
      render: (m) => (
        <div className="text-right font-mono">
          <div className={`font-bold ${m.totalStock <= (m.reorder_level || 15) ? 'text-amber-600' : 'text-slate-900'}`}>
            {m.totalStock} {m.unit}
          </div>
          <div className="text-[10px] text-slate-400">{m.batchCount || 0} batches</div>
        </div>
      ),
    },
    {
      header: 'Est. MRP',
      key: 'mrp',
      align: 'right',
      render: (m) => <span className="font-mono font-bold text-slate-900">{fmtMoney(m.mrp)}</span>,
    },
    {
      header: 'Actions',
      key: 'actions',
      sortable: false,
      exportable: false,
      align: 'center',
      render: (m) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => handleOpenEdit(m)}
            className="text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
            title="Edit Medicine"
            icon={Edit2}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => handleDelete(m.id, m.name)}
            loading={deletingId === m.id}
            className="text-slate-500 hover:text-rose-600 hover:bg-rose-50"
            title="Deactivate"
            icon={Trash2}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Medicine Master Catalog</h1>
          <p className="text-xs text-slate-400">Master database of pharmaceuticals, schedules, and GST classifications</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Schedule Filter */}
          <select
            value={filterSchedule}
            onChange={(e) => setFilterSchedule(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Drug Schedules</option>
            <option value="NONE">General (OTC)</option>
            <option value="H">Schedule H (Rx)</option>
            <option value="H1">Schedule H1 (Controlled)</option>
            <option value="X">Schedule X (Strict)</option>
          </select>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Excel Template & Export Controls */}
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={triggerExcelTemplateDownload}
            title="Download formatted Excel template for bulk uploading"
          >
            Template
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
            onClick={() => exportMedicinesToExcel(filteredMedicines)}
            title="Export filtered medicines to Excel (.xls)"
          >
            Export Excel
          </Button>

          <Button
            variant="indigo-outline"
            size="sm"
            icon={<UploadCloud className="w-4 h-4 text-indigo-600" />}
            onClick={() => setIsExcelModalOpen(true)}
            title="Upload bulk medicines via Excel or CSV"
          >
            Bulk Upload Excel
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleOpenAdd}
          >
            Add New Medicine
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filteredMedicines}
        searchPlaceholder="Search catalog by name, salt, generic, or barcode…"
        searchFields={['name', 'generic_name', 'brand', 'salt_composition', 'barcode']}
        exportFilename="medicine_master_catalog"
      />

      {/* Add / Edit Medicine Master Modal */}
      <Modal
        isOpen={!!modalMode}
        onClose={() => setModalMode(null)}
        title={modalMode === 'add' ? 'Add Medicine to Master Catalog' : `Edit — ${selectedMed?.name || ''}`}
        subtitle="Specify Indian pharma classification, drug schedule, and GST rates"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Medicine Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="e.g. Augmentin 625 Duo Tablet"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Generic Name / Composition</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="e.g. Amoxycillin + Potassium Clavulanate"
                value={form.generic_name}
                onChange={(e) => setForm({ ...form, generic_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Category</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                value={form.category_id || ''}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">General / Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Manufacturer / Pharma Brand</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="e.g. GlaxoSmithKline / Cipla"
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Drug Schedule Classification</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-800 focus:outline-none"
                value={form.schedule_type}
                onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
              >
                <option value="NONE">General / OTC</option>
                <option value="H">Schedule H (Prescription Required)</option>
                <option value="H1">Schedule H1 (Special Antibiotic / Sedative Register)</option>
                <option value="X">Schedule X (Psychotropic / Narcotics)</option>
                <option value="G">Schedule G</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Dosage Form & Strength</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                  value={form.dosage_form}
                  onChange={(e) => setForm({ ...form, dosage_form: e.target.value })}
                >
                  <option value="Tablet">Tablet</option>
                  <option value="Capsule">Capsule</option>
                  <option value="Syrup">Syrup</option>
                  <option value="Injection">Injection</option>
                  <option value="Ointment">Ointment</option>
                  <option value="Drops">Drops</option>
                  <option value="Inhaler">Inhaler</option>
                  <option value="Powder">Powder</option>
                  <option value="Suspension">Suspension</option>
                  <option value="Gel">Gel</option>
                  <option value="Sachet">Sachet</option>
                  <option value="Sachets">Sachets</option>
                  <option value="Device">Device</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  type="text"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                  placeholder="e.g. 625mg / 500mg"
                  value={form.strength}
                  onChange={(e) => setForm({ ...form, strength: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Pack Size & Unit</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="1"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none"
                  value={form.pack_size}
                  onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
                />
                <select
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                >
                  <option value="Strips">Strips</option>
                  <option value="Bottles">Bottles</option>
                  <option value="Vials">Vials</option>
                  <option value="Tubes">Tubes</option>
                  <option value="Boxes">Boxes</option>
                  <option value="Sachets">Sachets</option>
                  <option value="Pieces">Pieces</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">GST Rate & HSN Code</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none"
                  value={form.gst_rate}
                  onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
                >
                  <option value="0">0% (Nil)</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST</option>
                  <option value="28">28% GST</option>
                </select>
                <input
                  type="text"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
                  placeholder="HSN (3004)"
                  value={form.hsn_code}
                  onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Barcode / EAN</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
                placeholder="Scan or enter barcode"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Reorder Level Alert Threshold</label>
              <input
                type="number"
                min="0"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </div>
          </div>

          {/* Optional Opening Batch Section (Add mode only) */}
          {modalMode === 'add' && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-emerald-600" />
                <span>Initial Stock Batch (Optional)</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  placeholder="Batch No (e.g. B2401)"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  value={form.batch_no}
                  onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                />
                <input
                  type="date"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Qty in Stock"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  value={form.initial_stock}
                  onChange={(e) => setForm({ ...form, initial_stock: e.target.value })}
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="MRP (₹)"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  value={form.mrp}
                  onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setModalMode(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              loadingText="Saving Medicine…"
            >
              Save Medicine
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Medicine Excel Import Modal */}
      <BulkMedicineExcelModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
