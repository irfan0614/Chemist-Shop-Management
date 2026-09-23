const express = require('express');
const { memStore } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/prescriptions
router.get('/', (req, res) => {
  const { search, doctorName, startDate, endDate } = req.query;
  let list = [...memStore.prescriptions];

  if (doctorName) {
    list = list.filter((p) => p.doctor_name.toLowerCase().includes(doctorName.toLowerCase()));
  }

  if (startDate) {
    list = list.filter((p) => p.prescription_date >= startDate);
  }

  if (endDate) {
    list = list.filter((p) => p.prescription_date <= endDate);
  }

  if (search) {
    const q = search.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.prescription_no.toLowerCase().includes(q) ||
        p.patient_name.toLowerCase().includes(q) ||
        p.doctor_name.toLowerCase().includes(q) ||
        p.doctor_reg_no.toLowerCase().includes(q) ||
        (p.hospital_clinic || '').toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => (b.prescription_date > a.prescription_date ? 1 : -1));
  res.json(list);
});

// GET /api/prescriptions/schedule-h1-register - Indian Drug Law Schedule H1 Register
router.get('/schedule-h1-register', (req, res) => {
  const { startDate, endDate } = req.query;
  const entries = [];

  for (const invoice of memStore.sales_invoices) {
    if (startDate && invoice.invoice_date < startDate) continue;
    if (endDate && invoice.invoice_date > endDate) continue;

    for (const item of invoice.items || []) {
      const med = memStore.medicines.find((m) => m.id === item.medicineId);
      if (med && (med.schedule_type === 'H1' || med.schedule_type === 'X')) {
        entries.push({
          id: `${invoice.id}-${item.id || item.batchId}`,
          date: invoice.invoice_date,
          invoiceNo: invoice.invoice_no,
          patientName: invoice.customer_name || 'Walk-in',
          patientAddress: 'New Delhi',
          doctorName: invoice.doctor_name || 'Dr. S. K. Gupta',
          doctorRegNo: invoice.doctor_reg_no || 'DMC-29481',
          drugName: med.name,
          genericName: med.generic_name,
          scheduleType: med.schedule_type,
          batchNo: item.batchNo,
          qtySold: item.qty,
          unit: item.unit || 'Strips',
        });
      }
    }
  }

  res.json(entries);
});

// POST /api/prescriptions - Record a new prescription
router.post('/', authMiddleware, (req, res) => {
  const {
    customerId,
    patientName,
    patientAge,
    patientGender,
    doctorName,
    doctorRegNo,
    hospitalClinic,
    prescriptionDate,
    imageData,
    notes,
  } = req.body;

  if (!patientName || !doctorName || !doctorRegNo) {
    return res.status(400).json({ error: 'Patient name, doctor name, and doctor registration number are required' });
  }

  const newPresc = {
    id: `pr-${Date.now()}`,
    prescription_no: `RX-${new Date().getFullYear()}-${String(memStore.prescriptions.length + 1).padStart(3, '0')}`,
    customer_id: customerId || null,
    patient_name: patientName.trim(),
    patient_age: parseInt(patientAge) || null,
    patient_gender: patientGender || 'Male',
    doctor_name: doctorName.trim(),
    doctor_reg_no: doctorRegNo.trim(),
    hospital_clinic: (hospitalClinic || '').trim(),
    prescription_date: prescriptionDate || new Date().toISOString().slice(0, 10),
    image_data: imageData || '',
    notes: (notes || '').trim(),
    created_at: new Date().toISOString(),
  };

  memStore.prescriptions.unshift(newPresc);
  res.status(201).json(newPresc);
});

module.exports = router;
