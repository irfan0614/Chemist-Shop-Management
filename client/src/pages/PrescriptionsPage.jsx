import React, { useState, useEffect, useCallback } from 'react';
import { FileText, ShieldAlert, Plus, Download, Search, Eye } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { fmtDate } from '../utils/formatters';

export function PrescriptionsPage() {
  const [activeTab, setActiveTab] = useState('register'); // 'register' | 'archive'
  const [scheduleH1List, setScheduleH1List] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  const [form, setForm] = useState({
    patientName: '',
    patientAge: '',
    patientGender: 'Male',
    doctorName: '',
    doctorRegNo: '',
    hospitalClinic: '',
    prescriptionDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [h1, presc] = await Promise.all([
        api.get('/prescriptions/schedule-h1-register'),
        api.get('/prescriptions'),
      ]);
      setScheduleH1List(h1);
      setPrescriptions(presc);
    } catch (err) {
      showError('Failed to load prescription compliance records: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSavePrescription = async () => {
    if (!form.patientName.trim() || !form.doctorName.trim() || !form.doctorRegNo.trim()) {
      showError('Patient Name, Doctor Name, and Doctor Registration Number are mandatory under Indian Drug Rules.');
      return;
    }

    try {
      const res = await api.post('/prescriptions', form);
      showSuccess(`Prescription #${res.prescription_no} recorded successfully!`);
      setIsAddModalOpen(false);
      loadData();
    } catch (err) {
      showError(err.message);
    }
  };

  // Columns for Statutory Schedule H1 Register
  const h1Columns = [
    {
      header: 'Date',
      key: 'date',
      render: (r) => <span className="font-mono font-bold">{fmtDate(r.date)}</span>,
    },
    {
      header: 'Invoice #',
      key: 'invoiceNo',
      render: (r) => <span className="font-mono text-emerald-700 font-bold">{r.invoiceNo}</span>,
    },
    {
      header: 'Patient Details',
      key: 'patientName',
      render: (r) => (
        <div>
          <div className="font-bold text-slate-900">{r.patientName}</div>
          <div className="text-[10px] text-slate-400">{r.patientAddress || 'New Delhi'}</div>
        </div>
      ),
    },
    {
      header: 'Prescribing Doctor',
      key: 'doctorName',
      render: (r) => (
        <div>
          <div className="font-bold text-slate-900">{r.doctorName}</div>
          <div className="text-[10px] font-mono text-slate-500 font-bold">Reg: {r.doctorRegNo}</div>
        </div>
      ),
    },
    {
      header: 'Schedule Drug & Generic',
      key: 'drugName',
      render: (r) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1">
            <span>{r.drugName}</span>
            <Badge tone="alert">{r.scheduleType}</Badge>
          </div>
          <div className="text-[11px] text-slate-500">{r.genericName}</div>
        </div>
      ),
    },
    {
      header: 'Batch No.',
      key: 'batchNo',
      render: (r) => <span className="font-mono font-bold text-slate-800">{r.batchNo}</span>,
    },
    {
      header: 'Qty Dispensed',
      key: 'qtySold',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-emerald-800">
          {r.qtySold} {r.unit}
        </span>
      ),
    },
  ];

  // Columns for Prescription Archive
  const prescColumns = [
    {
      header: 'Rx Number',
      key: 'prescription_no',
      render: (p) => <span className="font-mono font-bold text-slate-900">{p.prescription_no}</span>,
    },
    {
      header: 'Date',
      key: 'prescription_date',
      render: (p) => <span className="font-mono">{fmtDate(p.prescription_date)}</span>,
    },
    {
      header: 'Patient Name & Age',
      key: 'patient_name',
      render: (p) => (
        <div>
          <div className="font-bold text-slate-900">{p.patient_name}</div>
          <div className="text-[11px] text-slate-400">
            {p.patient_gender}, {p.patient_age ? `${p.patient_age} yrs` : 'Age unspecified'}
          </div>
        </div>
      ),
    },
    {
      header: 'Doctor Details',
      key: 'doctor_name',
      render: (p) => (
        <div>
          <div className="font-bold text-slate-900">{p.doctor_name}</div>
          <div className="text-[10px] font-mono text-slate-500">Reg: {p.doctor_reg_no} · {p.hospital_clinic || 'Clinic'}</div>
        </div>
      ),
    },
    {
      header: 'Diagnosis / Notes',
      key: 'notes',
      render: (p) => <span className="text-xs text-slate-600">{p.notes || '—'}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header & Compliance Badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold text-slate-900">Drug Regulatory Compliance & Prescriptions</h1>
            <Badge tone="warn">Schedule H1 / X Mandate</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Statutory records under Drugs and Cosmetics Rules (India) for inspection audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('register')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'register'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Schedule H1 Register
            </button>
            <button
              onClick={() => setActiveTab('archive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'archive'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Prescriptions Archive
            </button>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Prescription</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      {activeTab === 'register' ? (
        <DataTable
          columns={h1Columns}
          data={scheduleH1List}
          searchPlaceholder="Search Schedule H1 register by patient, doctor, or drug name…"
          searchFields={['patientName', 'doctorName', 'doctorRegNo', 'drugName', 'batchNo', 'invoiceNo']}
          exportFilename="Schedule_H1_Register_Drug_Compliance"
        />
      ) : (
        <DataTable
          columns={prescColumns}
          data={prescriptions}
          searchPlaceholder="Search prescriptions by Rx number, patient, or doctor…"
          searchFields={['prescription_no', 'patient_name', 'doctor_name', 'doctor_reg_no']}
          exportFilename="prescription_archive"
        />
      )}

      {/* Add Prescription Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Doctor Prescription"
        subtitle="Captures statutory prescriber details for Schedule H/H1 records"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Patient Full Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                placeholder="e.g. Anil Kashyap"
                value={form.patientName}
                onChange={(e) => setForm({ ...form, patientName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Prescription Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                value={form.prescriptionDate}
                onChange={(e) => setForm({ ...form, prescriptionDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Doctor Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
                placeholder="Dr. S. K. Gupta"
                value={form.doctorName}
                onChange={(e) => setForm({ ...form, doctorName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Doctor State Medical Reg. No. *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none uppercase"
                placeholder="DMC-29481 / MCI-9921"
                value={form.doctorRegNo}
                onChange={(e) => setForm({ ...form, doctorRegNo: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Hospital / Clinic Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="Max Super Speciality Hospital"
                value={form.hospitalClinic}
                onChange={(e) => setForm({ ...form, hospitalClinic: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Patient Age & Gender</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Age (yrs)"
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  value={form.patientAge}
                  onChange={(e) => setForm({ ...form, patientAge: e.target.value })}
                />
                <select
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  value={form.patientGender}
                  onChange={(e) => setForm({ ...form, patientGender: e.target.value })}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Prescription Notes / Clinical Findings</label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                placeholder="Dosage duration, special instructions..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
              onClick={handleSavePrescription}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20"
            >
              Save Prescription
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
