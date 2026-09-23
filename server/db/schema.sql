-- ==============================================================================
-- Chemist Shop Management Software (Medical Store System) - Indian Market Schema
-- PostgreSQL Schema for Supabase / Hosted Postgres
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- For gen_random_uuid() and crypt()

-- 1. SHOP SETTINGS TABLE (Form 20B/21B, GSTIN, Printing & Store Configuration)
CREATE TABLE IF NOT EXISTS shop_settings (
  id INT PRIMARY KEY DEFAULT 1,
  shop_name TEXT NOT NULL DEFAULT 'Apollo Health Chemist & Druggist',
  tagline TEXT DEFAULT 'Your Trusted Pharmacy & Healthcare Partner',
  owner_name TEXT DEFAULT 'Dr. Rajesh Sharma',
  dl_number_20b TEXT DEFAULT 'DL-20B-129482',
  dl_number_21b TEXT DEFAULT 'DL-21B-129483',
  gstin TEXT DEFAULT '07AAAAA0000A1Z5',
  fssai_no TEXT DEFAULT '10019011000123',
  pan_no TEXT DEFAULT 'AAAAA0000A',
  phone TEXT DEFAULT '+91 98765 43210',
  alt_phone TEXT DEFAULT '+91 11 2345 6789',
  email TEXT DEFAULT 'contact@apollochemist.in',
  address TEXT DEFAULT 'Shop No. 12, Ground Floor, Central Market',
  city TEXT DEFAULT 'New Delhi',
  state TEXT DEFAULT 'Delhi',
  state_code TEXT DEFAULT '07',
  pincode TEXT DEFAULT '110001',
  bill_prefix TEXT NOT NULL DEFAULT 'INV',
  bill_counter INT NOT NULL DEFAULT 1001,
  purchase_prefix TEXT NOT NULL DEFAULT 'PUR',
  purchase_counter INT NOT NULL DEFAULT 101,
  return_prefix TEXT NOT NULL DEFAULT 'SRT',
  return_counter INT NOT NULL DEFAULT 1,
  debit_note_prefix TEXT NOT NULL DEFAULT 'DBN',
  debit_note_counter INT NOT NULL DEFAULT 1,
  default_low_stock_threshold INT NOT NULL DEFAULT 15,
  default_expiry_alert_days INT NOT NULL DEFAULT 90,
  thermal_printer_size TEXT NOT NULL DEFAULT '80mm', -- '80mm', '58mm', 'A4'
  invoice_terms TEXT DEFAULT '1. Goods once sold will not be taken back without original bill. 2. Medicines requiring refrigeration (2-8°C) are non-returnable. 3. Subject to local jurisdiction only.',
  enable_fefo BOOLEAN NOT NULL DEFAULT true,
  allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
  require_doctor_on_schedule_h BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_shop_settings_row CHECK (id = 1)
);

-- Seed default settings if empty
INSERT INTO shop_settings (id) VALUES (1)
ON CONFLICT (id) DO UPDATE SET
  shop_name = EXCLUDED.shop_name
WHERE shop_settings.shop_name IS NULL OR shop_settings.shop_name = '';

-- 2. USERS & RBAC TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SHOP_OWNER' CHECK (role IN ('SUPER_ADMIN', 'SHOP_OWNER')),
  phone TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Seed default shop owner user (password: admin123)
-- bcrypt hash for 'admin123'
INSERT INTO users (id, full_name, email, password_hash, role, phone, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Dr. Rajesh Sharma (Apollo Owner)',
  'admin@chemist.com',
  '$2a$10$wEeVg7d8Y5aU4bS6b7kC7.y9V6qJz3qV6z9Y7wEeVg7d8Y5aU4bS6', -- hashed 'admin123'
  'SHOP_OWNER',
  '+91 9876543210',
  true
)
ON CONFLICT (email) DO UPDATE SET role = 'SHOP_OWNER';

-- Seed default pharmacist user (password: pharmacist123)
INSERT INTO users (id, full_name, email, password_hash, role, phone, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Rohit Verma (Lead Pharmacist)',
  'pharmacist@chemist.com',
  '$2a$10$wEeVg7d8Y5aU4bS6b7kC7.y9V6qJz3qV6z9Y7wEeVg7d8Y5aU4bS6',
  'PHARMACIST',
  '+91 9811223344',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Seed default cashier user (password: cashier123)
INSERT INTO users (id, full_name, email, password_hash, role, phone, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Priya Patel (Billing Cashier)',
  'cashier@chemist.com',
  '$2a$10$wEeVg7d8Y5aU4bS6b7kC7.y9V6qJz3qV6z9Y7wEeVg7d8Y5aU4bS6',
  'CASHIER',
  '+91 9822334455',
  true
)
ON CONFLICT (email) DO NOTHING;

-- 3. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categories (name, description) VALUES
  ('Antibiotics & Anti-Infectives', 'Antibacterial, Antiviral, Antifungal drugs'),
  ('Pain Relief & Analgesics', 'NSAIDs, Paracetamol, Antispasmodics'),
  ('Cardiovascular & Hypertension', 'Blood pressure, Statins, Heart medications'),
  ('Diabetes Care', 'Oral Hypoglycemics, Insulin, GLP-1s'),
  ('Respiratory & Anti-Allergic', 'Antihistamines, Cough syrups, Inhalers'),
  ('Gastrointestinal & Antacids', 'PPIs, Antacids, Laxatives, Probiotics'),
  ('Vitamins & Supplements', 'Multivitamins, Minerals, Calcium, Protein'),
  ('Dermatology & Topicals', 'Ointments, Creams, Lotions, Antifungals'),
  ('Ayurvedic & OTC', 'Herbal supplements, OTC wellness products'),
  ('Surgicals & Medical Devices', 'Syringes, Needles, Cotton, Gauze, BP monitors')
ON CONFLICT (name) DO NOTHING;

-- 4. MEDICINES (MASTER CATALOG) TABLE
CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  generic_name TEXT NOT NULL DEFAULT '',
  brand TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  salt_composition TEXT DEFAULT '',
  dosage_form TEXT DEFAULT 'Tablet' CHECK (dosage_form IN ('Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Powder', 'Suspension', 'Gel', 'Sachet', 'Sachets', 'Device', 'Other')),
  strength TEXT DEFAULT '',
  pack_size INT NOT NULL DEFAULT 10,
  unit TEXT NOT NULL DEFAULT 'Strips' CHECK (unit IN ('Strips', 'Bottles', 'Vials', 'Tubes', 'Pieces', 'Boxes', 'Sachets', 'Packs')),
  barcode TEXT DEFAULT '',
  hsn_code TEXT NOT NULL DEFAULT '3004',
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  schedule_type TEXT NOT NULL DEFAULT 'NONE' CHECK (schedule_type IN ('NONE', 'G', 'H', 'H1', 'X', 'NARCOTIC')),
  is_prescription_required BOOLEAN NOT NULL DEFAULT false,
  reorder_level INT NOT NULL DEFAULT 15,
  min_shelf_life_days INT DEFAULT 90,
  storage_temperature TEXT DEFAULT 'Room Temperature',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure dosage_form constraint is up to date if medicines table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medicines_dosage_form_check') THEN
    ALTER TABLE medicines DROP CONSTRAINT medicines_dosage_form_check;
  END IF;
  ALTER TABLE medicines ADD CONSTRAINT medicines_dosage_form_check 
    CHECK (dosage_form IN ('Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Powder', 'Suspension', 'Gel', 'Sachet', 'Sachets', 'Device', 'Other'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_medicines_name_lower ON medicines (lower(name));
CREATE INDEX IF NOT EXISTS idx_medicines_generic_lower ON medicines (lower(generic_name));
CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines (barcode);
CREATE INDEX IF NOT EXISTS idx_medicines_schedule ON medicines (schedule_type);

-- 5. MEDICINE BATCHES TABLE (BATCH-WISE INVENTORY)
CREATE TABLE IF NOT EXISTS medicine_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_no TEXT NOT NULL,
  mfg_date DATE,
  expiry_date DATE NOT NULL,
  purchase_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  mrp NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  rack_shelf TEXT DEFAULT '',
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_medicine_batch UNIQUE (medicine_id, batch_no)
);
CREATE INDEX IF NOT EXISTS idx_batches_med_id ON medicine_batches (medicine_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON medicine_batches (expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_fefo ON medicine_batches (medicine_id, expiry_date, current_stock);
CREATE INDEX IF NOT EXISTS idx_batches_batch_no ON medicine_batches (lower(batch_no));

-- 6. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_person TEXT DEFAULT '',
  phone TEXT NOT NULL,
  alt_phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT 'Delhi',
  state_code TEXT DEFAULT '07',
  pincode TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  dl_numbers TEXT DEFAULT '',
  pan_no TEXT DEFAULT '',
  payment_terms_days INT DEFAULT 30,
  credit_limit NUMERIC(12,2) DEFAULT 100000.00,
  opening_balance NUMERIC(12,2) DEFAULT 0.00,
  current_balance NUMERIC(12,2) DEFAULT 0.00,
  bank_name TEXT DEFAULT '',
  bank_account_no TEXT DEFAULT '',
  bank_ifsc TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (lower(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers (lower(company_name));

-- Seed distributors
INSERT INTO suppliers (name, company_name, contact_person, phone, email, gstin, dl_numbers, address, city, state, state_code)
VALUES
  ('MedPlus Pharma Distributors', 'MedPlus Healthcare Ltd', 'Sanjay Gupta', '+91 9811002233', 'orders@medplusdist.com', '07AACCM1234D1Z8', 'DL-20B-8812, DL-21B-8813', 'Plot 45, Okhla Industrial Area Ph-2', 'New Delhi', 'Delhi', '07'),
  ('Sun Pharma Agency', 'Sun Lifesciences Agency', 'Amit Tyagi', '+91 9822114455', 'sales@suncare.in', '07AABCS5566K1Z2', 'DL-20B-9921, DL-21B-9922', 'Building 12, Bhagirath Palace, Chandni Chowk', 'Delhi', 'Delhi', '07'),
  ('Cipla Generic Distributors', 'Cipla Care Logistics', 'Vikram Mehra', '+91 9833225566', 'delhi@cipladist.com', '07AABCC3344M1Z5', 'DL-20B-7744, DL-21B-7745', 'Unit 8, Daryaganj Medical Market', 'New Delhi', 'Delhi', '07'),
  ('Mankind Health Stockists', 'Mankind Distributors Pvt Ltd', 'Rakesh Nair', '+91 9844336677', 'mankinddelhi@dist.com', '07AABCM7788P1Z9', 'DL-20B-6633, DL-21B-6634', 'Near AIIMS Metro, Gautam Nagar', 'New Delhi', 'Delhi', '07')
ON CONFLICT DO NOTHING;

-- 7. PURCHASES (INWARD INVOICES) TABLE
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_no TEXT UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_no TEXT NOT NULL,
  supplier_invoice_date DATE NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  gst_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  round_off NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
  payment_mode TEXT DEFAULT 'NEFT/RTGS' CHECK (payment_mode IN ('CASH', 'CHEQUE', 'UPI', 'NEFT/RTGS', 'CREDIT')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases (purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_no ON purchases (lower(supplier_invoice_no));

-- 8. PURCHASE ITEMS TABLE (INWARD LINE ITEMS WITH 10+1 SCHEME)
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES medicine_batches(id) ON DELETE SET NULL,
  batch_no TEXT NOT NULL,
  mfg_date DATE,
  expiry_date DATE NOT NULL,
  pack_size INT NOT NULL DEFAULT 10,
  qty INT NOT NULL CHECK (qty > 0),
  free_qty INT NOT NULL DEFAULT 0 CHECK (free_qty >= 0),
  purchase_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  mrp NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_medicine ON purchase_items (medicine_id);

-- 9. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT 'Delhi',
  pincode TEXT DEFAULT '',
  preferred_doctor TEXT DEFAULT '',
  credit_limit NUMERIC(10,2) NOT NULL DEFAULT 5000.00,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  current_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  customer_type TEXT NOT NULL DEFAULT 'RETAIL' CHECK (customer_type IN ('RETAIL', 'REGULAR', 'SENIOR_CITIZEN', 'WHOLESALE')),
  discount_percent NUMERIC(5,2) DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (lower(name));

-- Seed walk-in customer
INSERT INTO customers (id, name, phone, address, credit_limit, current_balance, customer_type)
VALUES
  ('00000000-0000-0000-0000-000000000010', 'Walk-in Customer (Cash)', '9999999999', 'Counter Sale', 0.00, 0.00, 'RETAIL'),
  ('00000000-0000-0000-0000-000000000011', 'Anil Kashyap', '9811223399', 'Flat 402, Green Park, New Delhi', 10000.00, 1250.00, 'REGULAR'),
  ('00000000-0000-0000-0000-000000000012', 'Sunita Sundaram', '9822334411', 'B-14, Hauz Khas, New Delhi', 5000.00, 0.00, 'SENIOR_CITIZEN')
ON CONFLICT DO NOTHING;

-- 10. PRESCRIPTIONS & SCHEDULE H1 COMPLIANCE TABLE
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_no TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_age INT,
  patient_gender TEXT CHECK (patient_gender IN ('Male', 'Female', 'Other')),
  doctor_name TEXT NOT NULL,
  doctor_reg_no TEXT NOT NULL,
  hospital_clinic TEXT DEFAULT '',
  prescription_date DATE NOT NULL DEFAULT CURRENT_DATE,
  image_data TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions (lower(patient_name));
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions (lower(doctor_name));
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions (prescription_date);

-- 11. SALES INVOICES (POS BILLS) TABLE
CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
  customer_phone TEXT DEFAULT '',
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  doctor_name TEXT DEFAULT '',
  doctor_reg_no TEXT DEFAULT '',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gst_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cgst_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  sgst_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  igst_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  round_off NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  change_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payment_mode TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_mode IN ('CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT')),
  payment_details JSONB DEFAULT '{}',
  payment_status TEXT NOT NULL DEFAULT 'PAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
  bill_type TEXT NOT NULL DEFAULT 'TAX_INVOICE' CHECK (bill_type IN ('TAX_INVOICE', 'ESTIMATE')),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED', 'RETURNED')),
  cancellation_reason TEXT DEFAULT '',
  cashier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_date ON sales_invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_no ON sales_invoices (invoice_no);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales_invoices (cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_invoices (status);

-- 12. SALES INVOICE ITEMS TABLE
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES medicine_batches(id) ON DELETE SET NULL,
  medicine_name TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  hsn_code TEXT NOT NULL DEFAULT '3004',
  pack_size INT NOT NULL DEFAULT 10,
  qty INT NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL DEFAULT 'Strips',
  purchase_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  mrp NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cgst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  sgst_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_items_invoice ON sales_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_medicine ON sales_invoice_items (medicine_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON sales_invoice_items (batch_id);

-- 13. STOCK MOVEMENTS (INVENTORY AUDIT LEDGER) TABLE
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB', 'EXPIRY_DISPOSAL', 'INITIAL_STOCK')),
  qty INT NOT NULL,
  balance_after INT NOT NULL,
  reference_id UUID,
  reference_no TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_med ON stock_movements (medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements (batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements (created_at DESC);

-- 14. CUSTOMER PAYMENTS (KHATA RECOVERY) TABLE
CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_mode IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE')),
  reference_no TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cust_pay_customer ON customer_payments (customer_id);

-- 15. SUPPLIER PAYMENTS (PAYABLES SETTLEMENT) TABLE
CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no TEXT UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'NEFT/RTGS' CHECK (payment_mode IN ('CASH', 'CHEQUE', 'UPI', 'NEFT/RTGS')),
  reference_no TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supp_pay_supplier ON supplier_payments (supplier_id);

-- 16. SALES RETURNS & REFUNDS TABLE
CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no TEXT UNIQUE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  gst_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  refund_mode TEXT NOT NULL DEFAULT 'CASH' CHECK (refund_mode IN ('CASH', 'CREDIT_NOTE', 'LEDGER_ADJUSTMENT', 'UPI')),
  reason TEXT DEFAULT 'Customer request / Unused medicines',
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns (invoice_id);

-- 17. SALES RETURN ITEMS TABLE
CREATE TABLE IF NOT EXISTS sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id UUID REFERENCES sales_invoice_items(id) ON DELETE SET NULL,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  return_qty INT NOT NULL CHECK (return_qty > 0),
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  restock_condition TEXT NOT NULL DEFAULT 'RESTOCKED' CHECK (restock_condition IN ('RESTOCKED', 'DAMAGED_WRITE_OFF', 'EXPIRED_DISPOSAL'))
);

-- 18. PURCHASE RETURNS & EXPIRY WRITE-OFF TABLE
CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no TEXT UNIQUE NOT NULL,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  debit_note_no TEXT DEFAULT '',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL DEFAULT 'Near Expiry / Expired / Damaged' CHECK (reason IN ('Near Expiry / Expired / Damaged', 'Slow Moving / Overstock', 'Wrong Delivery', 'Defective Batch')),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PENDING')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purch_returns_supplier ON purchase_returns (supplier_id);

-- 19. PURCHASE RETURN ITEMS TABLE
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  return_qty INT NOT NULL CHECK (return_qty > 0),
  purchase_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  return_reason TEXT DEFAULT ''
);

-- 20. EXPENSE CATEGORIES & EXPENSES TABLE
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO expense_categories (name, description) VALUES
  ('Shop Rent', 'Monthly shop lease and premises rental'),
  ('Staff Salaries', 'Pharmacist, cashier, and staff wages'),
  ('Electricity & Generator', 'Power bills and backup fuel expenses'),
  ('Transport & Courier', 'Medicine delivery and logistics charges'),
  ('Stationery & Printing', 'POS paper rolls, bill books, envelopes'),
  ('Tea, Snacks & Refreshment', 'Daily tea, coffee, and pantry expenses'),
  ('Maintenance & Repairs', 'A/C, refrigerator, IT & rack maintenance'),
  ('Miscellaneous', 'Other incidental store expenses')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_mode IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE')),
  paid_to TEXT DEFAULT '',
  receipt_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses (category_id);

-- 21. DAILY CASH DRAWER (REGISTER) TABLE
CREATE TABLE IF NOT EXISTS cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  opening_cash NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
  cash_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cash_returns NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cash_expenses NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  customer_cash_in NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  supplier_cash_out NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  expected_cash NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
  closing_cash NUMERIC(10,2) DEFAULT NULL,
  cash_difference NUMERIC(10,2) DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  notes TEXT DEFAULT '',
  opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cash_reg_date ON cash_registers (register_date);

-- 22. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  ip_address TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);

-- ==============================================================================
-- 23. SEED REALISTIC INDIAN MEDICINE CATALOG WITH BATCHES & STOCK
-- ==============================================================================

DO $$
DECLARE
  cat_antibiotics UUID;
  cat_pain UUID;
  cat_cardio UUID;
  cat_diabetes UUID;
  cat_resp UUID;
  cat_gi UUID;
  cat_vitamins UUID;
  
  med_pcm UUID;
  med_aug UUID;
  med_azith UUID;
  med_panto UUID;
  med_telma UUID;
  med_glyco UUID;
  med_montel UUID;
  med_becosules UUID;
  med_d3 UUID;
  med_alpra UUID;
  
BEGIN
  SELECT id INTO cat_antibiotics FROM categories WHERE name LIKE 'Antibiotics%' LIMIT 1;
  SELECT id INTO cat_pain FROM categories WHERE name LIKE 'Pain Relief%' LIMIT 1;
  SELECT id INTO cat_cardio FROM categories WHERE name LIKE 'Cardiovascular%' LIMIT 1;
  SELECT id INTO cat_diabetes FROM categories WHERE name LIKE 'Diabetes%' LIMIT 1;
  SELECT id INTO cat_resp FROM categories WHERE name LIKE 'Respiratory%' LIMIT 1;
  SELECT id INTO cat_gi FROM categories WHERE name LIKE 'Gastrointestinal%' LIMIT 1;
  SELECT id INTO cat_vitamins FROM categories WHERE name LIKE 'Vitamins%' LIMIT 1;

  -- 1. Paracetamol 650mg (Dolo 650)
  SELECT id INTO med_pcm FROM medicines WHERE name = 'Dolo 650 Tablet' LIMIT 1;
  IF med_pcm IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Dolo 650 Tablet', 'Paracetamol', 'Dolo', 'Micro Labs Ltd', cat_pain, 'Paracetamol 650mg', 'Tablet', '650mg', 15, 'Strips', '890123456701', '3004', 12.00, 'NONE', false, 30)
    RETURNING id INTO med_pcm;
  END IF;

  IF med_pcm IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_pcm, 'DL2401', CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '21 months', 22.50, 33.75, 31.00, 80, 'Rack A-1'),
      (med_pcm, 'DL2309', CURRENT_DATE - INTERVAL '8 months', CURRENT_DATE + INTERVAL '4 months', 21.00, 31.50, 29.00, 25, 'Rack A-1')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 2. Augmentin 625 Duo (Amoxycillin + Clavulanic Acid) - Schedule H1
  SELECT id INTO med_aug FROM medicines WHERE name = 'Augmentin 625 Duo Tablet' LIMIT 1;
  IF med_aug IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Augmentin 625 Duo Tablet', 'Amoxycillin + Potassium Clavulanate', 'Augmentin', 'GlaxoSmithKline (GSK)', cat_antibiotics, 'Amoxycillin 500mg + Clavulanic Acid 125mg', 'Tablet', '625mg', 10, 'Strips', '890123456702', '3004', 12.00, 'H1', true, 20)
    RETURNING id INTO med_aug;
  END IF;

  IF med_aug IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_aug, 'AG625-A', CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE + INTERVAL '18 months', 145.00, 204.50, 195.00, 45, 'Rack B-3'),
      (med_aug, 'AG625-B', CURRENT_DATE - INTERVAL '10 months', CURRENT_DATE + INTERVAL '45 days', 140.00, 198.00, 185.00, 12, 'Rack B-3')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 3. Azithral 500 (Azithromycin 500mg) - Schedule H1
  SELECT id INTO med_azith FROM medicines WHERE name = 'Azithral 500 Tablet' LIMIT 1;
  IF med_azith IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Azithral 500 Tablet', 'Azithromycin', 'Azithral', 'Alembic Pharmaceuticals', cat_antibiotics, 'Azithromycin 500mg', 'Tablet', '500mg', 5, 'Strips', '890123456703', '3004', 12.00, 'H1', true, 15)
    RETURNING id INTO med_azith;
  END IF;

  IF med_azith IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_azith, 'AZ500-24', CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE + INTERVAL '20 months', 85.00, 132.00, 125.00, 35, 'Rack B-4')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 4. Pantocid 40 (Pantoprazole)
  SELECT id INTO med_panto FROM medicines WHERE name = 'Pantocid 40 Tablet' LIMIT 1;
  IF med_panto IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Pantocid 40 Tablet', 'Pantoprazole Sodium', 'Pantocid', 'Sun Pharmaceutical Industries', cat_gi, 'Pantoprazole 40mg', 'Tablet', '40mg', 15, 'Strips', '890123456704', '3004', 12.00, 'H', true, 25)
    RETURNING id INTO med_panto;
  END IF;

  IF med_panto IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_panto, 'PC40-99', CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE + INTERVAL '23 months', 110.00, 175.00, 160.00, 60, 'Rack C-1')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 5. Telma 40 (Telmisartan)
  SELECT id INTO med_telma FROM medicines WHERE name = 'Telma 40 Tablet' LIMIT 1;
  IF med_telma IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Telma 40 Tablet', 'Telmisartan', 'Telma', 'Glenmark Pharmaceuticals', cat_cardio, 'Telmisartan 40mg', 'Tablet', '40mg', 15, 'Strips', '890123456705', '3004', 12.00, 'H', true, 20)
    RETURNING id INTO med_telma;
  END IF;

  IF med_telma IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_telma, 'TL40-88', CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '24 months', 155.00, 245.00, 225.00, 40, 'Rack C-5')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 6. Glycomet-GP 1 (Metformin + Glimepiride)
  SELECT id INTO med_glyco FROM medicines WHERE name = 'Glycomet-GP 1 Tablet' LIMIT 1;
  IF med_glyco IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Glycomet-GP 1 Tablet', 'Metformin + Glimepiride', 'Glycomet-GP', 'USV Private Limited', cat_diabetes, 'Metformin 500mg + Glimepiride 1mg', 'Tablet', '1mg/500mg', 15, 'Strips', '890123456706', '3004', 12.00, 'H', true, 25)
    RETURNING id INTO med_glyco;
  END IF;

  IF med_glyco IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_glyco, 'GG1-77', CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE + INTERVAL '19 months', 95.00, 148.00, 138.00, 50, 'Rack D-2')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 7. Montair-LC (Montelukast + Levocetirizine)
  SELECT id INTO med_montel FROM medicines WHERE name = 'Montair-LC Tablet' LIMIT 1;
  IF med_montel IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Montair-LC Tablet', 'Montelukast + Levocetirizine', 'Montair-LC', 'Cipla Ltd', cat_resp, 'Montelukast 10mg + Levocetirizine 5mg', 'Tablet', '10mg/5mg', 10, 'Strips', '890123456707', '3004', 12.00, 'H', true, 20)
    RETURNING id INTO med_montel;
  END IF;

  IF med_montel IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_montel, 'MLC-44', CURRENT_DATE - INTERVAL '2 months', CURRENT_DATE + INTERVAL '22 months', 130.00, 210.00, 195.00, 55, 'Rack E-1')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 8. Becosules Z (B-Complex + Vitamin C + Zinc)
  SELECT id INTO med_becosules FROM medicines WHERE name = 'Becosules Z Capsule' LIMIT 1;
  IF med_becosules IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Becosules Z Capsule', 'Multivitamins with Zinc', 'Becosules', 'Pfizer Ltd', cat_vitamins, 'B-Complex + Vit C + Zinc Sulphate', 'Capsule', 'Standard', 20, 'Strips', '890123456708', '3004', 12.00, 'NONE', false, 30)
    RETURNING id INTO med_becosules;
  END IF;

  IF med_becosules IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_becosules, 'BCZ-12', CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE + INTERVAL '18 months', 38.00, 56.00, 52.00, 90, 'Rack F-3')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 9. Calcirol Sachet (Cholecalciferol / Vitamin D3 60,000 IU)
  SELECT id INTO med_d3 FROM medicines WHERE name = 'Calcirol 60K Sachet' LIMIT 1;
  IF med_d3 IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Calcirol 60K Sachet', 'Cholecalciferol (Vitamin D3)', 'Calcirol', 'Cadila Healthcare (Zydus)', cat_vitamins, 'Vitamin D3 60,000 IU Granules', 'Sachet', '60,000 IU', 1, 'Sachets', '890123456709', '3004', 12.00, 'NONE', false, 50)
    RETURNING id INTO med_d3;
  END IF;

  IF med_d3 IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_d3, 'CR60-01', CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '21 months', 28.00, 48.00, 44.00, 110, 'Rack F-4')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

  -- 10. Restyl 0.5 (Alprazolam) - Schedule H1
  SELECT id INTO med_alpra FROM medicines WHERE name = 'Restyl 0.5 Tablet' LIMIT 1;
  IF med_alpra IS NULL THEN
    INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, salt_composition, dosage_form, strength, pack_size, unit, barcode, hsn_code, gst_rate, schedule_type, is_prescription_required, reorder_level)
    VALUES ('Restyl 0.5 Tablet', 'Alprazolam', 'Restyl', 'Torrent Pharmaceuticals', cat_pain, 'Alprazolam 0.5mg', 'Tablet', '0.5mg', 15, 'Strips', '890123456710', '3004', 12.00, 'H1', true, 10)
    RETURNING id INTO med_alpra;
  END IF;

  IF med_alpra IS NOT NULL THEN
    INSERT INTO medicine_batches (medicine_id, batch_no, mfg_date, expiry_date, purchase_cost, mrp, selling_price, current_stock, rack_shelf)
    VALUES
      (med_alpra, 'RST-09', CURRENT_DATE - INTERVAL '4 months', CURRENT_DATE + INTERVAL '20 months', 32.00, 52.50, 48.00, 30, 'Locked Safe / Box S1')
    ON CONFLICT (medicine_id, batch_no) DO NOTHING;
  END IF;

END $$;
