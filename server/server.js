require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const medicinesRouter = require('./routes/medicines');
const batchesRouter = require('./routes/batches');
const suppliersRouter = require('./routes/suppliers');
const purchasesRouter = require('./routes/purchases');
const posRouter = require('./routes/pos');
const customersRouter = require('./routes/customers');
const prescriptionsRouter = require('./routes/prescriptions');
const returnsRouter = require('./routes/returns');
const expensesRouter = require('./routes/expenses');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  system: 'Chemist Shop Management API',
  version: '2.0.0',
  compliance: 'Indian Pharmacy Act, Drugs & Cosmetics Act 1940 (Schedule H/H1/X), GST Ready',
  timestamp: new Date().toISOString(),
}));

app.use('/api/auth', authRouter);
app.use('/api/medicines', medicinesRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/pos', posRouter);
app.use('/api/bills', posRouter); // Backward compatibility alias
app.use('/api/customers', customersRouter);
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Chemist Shop API v2.0 running on http://localhost:${PORT}`);
  console.log(`💊 Modules Loaded: Auth, Medicines, Batches, Suppliers, Purchases, POS, Customers, Prescriptions, Returns, Expenses, Reports, Settings`);
});
