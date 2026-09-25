const express = require('express');
const { query } = require('../db/pool');
const { authMiddleware, tenantShopId } = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/prescriptions
router.get('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const { search, doctorName, startDate, endDate } = req.query;

  try {
    let sql = `
      SELECT p.id, p.shop_id as "shopId", p.prescription_no as "prescriptionNo",
             p.customer_id as "customerId",
             p.patient_name as "patientName", p.patient_name,
             p.doctor_name as "doctorName", p.doctor_name,
             p.doctor_reg_no as "doctorRegNo", p.doctor_reg_no,
             p.prescription_date as "prescriptionDate", p.prescription_date,
             p.image_data as "imageUrl", p.image_data as "imageData", p.notes, p.created_at,
             c.name as "customerName", c.phone as "customerPhone"
      FROM prescriptions p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE ($1::uuid IS NULL OR p.shop_id = $1)
    `;
    const params = [shopId];

    if (doctorName) {
      params.push(`%${doctorName.trim().toLowerCase()}%`);
      sql += ` AND lower(p.doctor_name) LIKE $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND p.prescription_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND p.prescription_date <= $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(p.patient_name) LIKE $${params.length} OR
        lower(p.doctor_name) LIKE $${params.length} OR
        lower(p.doctor_reg_no) LIKE $${params.length}
      )`;
    }

    sql += ` ORDER BY p.prescription_date DESC, p.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get prescriptions error:', err);
    res.status(500).json({ error: 'Failed to retrieve prescriptions: ' + err.message });
  }
});

// GET /api/prescriptions/schedule-h1-register - Indian Drug Law Schedule H/H1/X Register
router.get('/schedule-h1-register', async (req, res) => {
  const shopId = tenantShopId(req);
  const { startDate, endDate } = req.query;

  try {
    let sql = `
      SELECT sii.id,
             si.shop_id as "shopId",
             si.invoice_date as date,
             si.invoice_no as "invoiceNo",
             si.customer_name as "patientName",
             'Local' as "patientAddress",
             si.doctor_name as "doctorName",
             si.doctor_reg_no as "doctorRegNo",
             sii.medicine_name as "drugName",
             m.generic_name as "genericName",
             m.schedule_type as "scheduleType",
             sii.batch_no as "batchNo",
             sii.qty as "qtySold",
             m.unit
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id
      JOIN medicines m ON sii.medicine_id = m.id
      WHERE ($1::uuid IS NULL OR si.shop_id = $1)
        AND m.schedule_type IN ('H', 'H1', 'X', 'NARCOTIC')
    `;
    const params = [shopId];

    if (startDate) {
      params.push(startDate);
      sql += ` AND si.invoice_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND si.invoice_date <= $${params.length}`;
    }

    sql += ` ORDER BY si.invoice_date DESC, si.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get schedule H1 register error:', err);
    res.status(500).json({ error: 'Failed to load Schedule H1 compliance register: ' + err.message });
  }
});

// POST /api/prescriptions
router.post('/', async (req, res) => {
  const shopId = tenantShopId(req);
  const {
    customerId,
    patientName,
    doctorName,
    doctorRegNo,
    prescriptionDate = new Date().toISOString().slice(0, 10),
    imageData,
    notes = '',
  } = req.body;

  if (!patientName || !doctorName || !doctorRegNo) {
    return res.status(400).json({
      error: 'Patient name, doctor name, and doctor registration number are required',
    });
  }

  try {
    const finalCustId = customerId && !customerId.startsWith('cust-') ? customerId : null;
    const rxNo = `RX-${Date.now().toString().slice(-6)}`;

    const { rows } = await query(
      `INSERT INTO prescriptions (
        shop_id, prescription_no, customer_id, patient_name, doctor_name, doctor_reg_no,
        prescription_date, image_data, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        shopId,
        rxNo,
        finalCustId,
        patientName.trim(),
        doctorName.trim(),
        doctorRegNo.trim(),
        prescriptionDate,
        imageData || '',
        notes ? notes.trim() : '',
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create prescription error:', err);
    res.status(500).json({ error: 'Failed to save prescription: ' + err.message });
  }
});

module.exports = router;
