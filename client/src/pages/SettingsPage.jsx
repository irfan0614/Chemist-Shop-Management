import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Printer, Shield, Building2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/common/Button';

export function SettingsPage() {
  const { settings, updateSettings } = useShop();
  const { showSuccess, showError } = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(form);
      showSuccess('Pharmacy settings and compliance numbers updated successfully!');
    } catch (err) {
      showError('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Shop Profile & Pharmacy Configuration</h1>
          <p className="text-xs text-slate-400">Drug License 20B/21B numbers, GSTIN, and printer customization</p>
        </div>
        <Button
          onClick={handleSave}
          variant="primary"
          icon={Save}
          loading={saving}
          loadingText="Saving Settings…"
          className="shrink-0"
        >
          Save Settings
        </Button>
      </div>

      {/* Main Settings Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pharmacy Details */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>Pharmacy Identity</span>
          </h3>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Pharmacy / Chemist Shop Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none"
                value={form.shop_name || ''}
                onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Tagline / Subtitle</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                value={form.tagline || ''}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Owner / Lead Pharmacist Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                value={form.owner_name || ''}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Phone Number(s)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Address</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">City</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                  value={form.city || ''}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Pincode</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                  value={form.pincode || ''}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Legal & Compliance Numbers */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>Drug Licenses & GST Compliance</span>
          </h3>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Drug License 20B (Retail Allopathic)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.dl_number_20b || ''}
                onChange={(e) => setForm({ ...form, dl_number_20b: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Drug License 21B (Retail Specific)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.dl_number_21b || ''}
                onChange={(e) => setForm({ ...form, dl_number_21b: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">GSTIN Number (15 Digits)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs uppercase focus:outline-none"
                value={form.gstin || ''}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">FSSAI Number (Food / Supplements)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.fssai_no || ''}
                onChange={(e) => setForm({ ...form, fssai_no: e.target.value })}
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Thermal Receipt Printer Format</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                value={form.thermal_printer_size || '80mm'}
                onChange={(e) => setForm({ ...form, thermal_printer_size: e.target.value })}
              >
                <option value="80mm">Standard 80mm (3-Inch Thermal)</option>
                <option value="58mm">Compact 58mm (2-Inch Thermal)</option>
                <option value="A4">A4 Full Sheet GST Tax Invoice</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
