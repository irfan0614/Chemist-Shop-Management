require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/pool');

// Initialize database schema
initDb();

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

const platformRouter = require('./routes/platform');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get(['/api/health', '/health'], (req, res) => res.json({
  status: 'ok',
  system: 'Chemist Shop Management API',
  version: '2.5.0',
  compliance: 'Indian Pharmacy Act, Drugs & Cosmetics Act 1940 (Schedule H/H1/X), GST Compliance Ready',
  timestamp: new Date().toISOString(),
}));

// API Routers (mounted on both /api/* and root /* for flexible client configs)
const routers = [
  { path: '/platform', router: platformRouter },
  { path: '/auth', router: authRouter },
  { path: '/medicines', router: medicinesRouter },
  { path: '/batches', router: batchesRouter },
  { path: '/suppliers', router: suppliersRouter },
  { path: '/purchases', router: purchasesRouter },
  { path: '/pos', router: posRouter },
  { path: '/bills', router: posRouter },
  { path: '/customers', router: customersRouter },
  { path: '/prescriptions', router: prescriptionsRouter },
  { path: '/returns', router: returnsRouter },
  { path: '/expenses', router: expensesRouter },
  { path: '/reports', router: reportsRouter },
  { path: '/settings', router: settingsRouter },
];

routers.forEach(({ path, router }) => {
  app.use(`/api${path}`, router);
  app.use(path, router);
});

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
const server = app.listen(PORT, () => {
  console.log(`✅ Chemist Shop Management API running on http://localhost:${PORT}`);
  console.log(`💊 Routers Active: Platform, Auth, Medicines, Batches, Suppliers, Purchases, POS, Customers, Prescriptions, Returns, Expenses, Reports, Settings`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use by an older server process.`);
    console.error(`👉 Please kill the running node process and restart:`);
    console.error(`   Windows PowerShell: Stop-Process -Name node -Force; node server.js`);
  } else {
    console.error('Server error:', err);
  }
});

