-- ==============================================================================
-- 001_multi_tenant_migration.sql
-- Safe, Idempotent Database Migration for Medical Shops
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create Primary SHOPS Table
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  tagline TEXT DEFAULT 'Your Trusted Pharmacy & Healthcare Partner',
  owner_id UUID,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  alt_phone TEXT DEFAULT '',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Delhi',
  state_code TEXT NOT NULL DEFAULT '07',
  pincode TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  dl_number_20b TEXT DEFAULT '',
  dl_number_21b TEXT DEFAULT '',
  fssai_no TEXT DEFAULT '',
  pan_no TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TRIAL')),
  subscription_plan TEXT NOT NULL DEFAULT 'PRO' CHECK (subscription_plan IN ('BASIC', 'PRO', 'ENTERPRISE')),
  subscription_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 year'),
  dl_expiry_date DATE DEFAULT (CURRENT_DATE + interval '3 years'),
  bill_prefix TEXT NOT NULL DEFAULT 'INV',
  bill_counter INT NOT NULL DEFAULT 1001,
  purchase_prefix TEXT NOT NULL DEFAULT 'PUR',
  purchase_counter INT NOT NULL DEFAULT 101,
  return_prefix TEXT NOT NULL DEFAULT 'SRT',
  return_counter INT NOT NULL DEFAULT 1,
  thermal_printer_size TEXT NOT NULL DEFAULT '80mm' CHECK (thermal_printer_size IN ('80mm', '58mm', 'A4')),
  invoice_terms TEXT DEFAULT '1. Goods once sold will not be taken back without original bill. 2. Refrigerated medicines are non-returnable.',
  enable_fefo BOOLEAN NOT NULL DEFAULT true,
  allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
  require_doctor_on_schedule_h BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shops_status ON shops (status);
CREATE INDEX IF NOT EXISTS idx_shops_email ON shops (lower(email));

-- 2. Update USERS Table for Multi-Tenancy & Platform Admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;

-- Update role check constraint safely
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('SUPER_ADMIN', 'SHOP_OWNER', 'ADMIN', 'PHARMACIST', 'CASHIER', 'STAFF'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Safely Add shop_id to all Business Tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'categories', 'medicines', 'medicine_batches', 'suppliers', 'purchases', 
    'purchase_items', 'customers', 'prescriptions', 'sales_invoices', 
    'sales_invoice_items', 'sales_returns', 'sales_return_items', 
    'purchase_returns', 'purchase_return_items', 'expense_categories', 
    'expenses', 'cash_registers', 'audit_logs', 'stock_movements'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE', tbl);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (shop_id)', 'idx_' || tbl || '_shop_id', tbl);
    END IF;
  END LOOP;
END $$;

-- 4. Compound Unique Constraints per Tenant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_invoices') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_shop_no ON sales_invoices (shop_id, invoice_no);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchases') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_shop_no ON purchases (shop_id, purchase_no);
  END IF;
END $$;
