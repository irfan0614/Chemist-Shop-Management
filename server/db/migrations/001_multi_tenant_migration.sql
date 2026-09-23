-- ==============================================================================
-- 001_multi_tenant_migration.sql
-- Safe, Idempotent Multi-Tenant Architecture Migration for Medical Shops
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

-- 2. Seed Default Primary Shop if none exists (Preserves existing data)
INSERT INTO shops (
  id,
  shop_name,
  slug,
  owner_name,
  email,
  phone,
  address,
  city,
  state,
  pincode,
  gstin,
  dl_number_20b,
  dl_number_21b
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Apollo Health Chemist & Druggist',
  'apollo-health-chemist',
  'Dr. Rajesh Sharma',
  'owner@apollochemist.in',
  '+91 98765 43210',
  'Shop No. 12, Ground Floor, Central Market',
  'New Delhi',
  'Delhi',
  '110001',
  '07AAAAA0000A1Z5',
  'DL-20B-129482',
  'DL-21B-129483'
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Update USERS Table for Multi-Tenancy & Platform Admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;

-- Update role check constraint strictly to SUPER_ADMIN and SHOP_OWNER
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('SUPER_ADMIN', 'SHOP_OWNER'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Seed Platform Super Admin User (password: superadmin123)
INSERT INTO users (id, full_name, email, password_hash, role, phone, is_active, shop_id)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Platform Super Admin',
  'superadmin@platform.com',
  '$2a$10$wEeVg7d8Y5aU4bS6b7kC7.y9V6qJz3qV6z9Y7wEeVg7d8Y5aU4bS6',
  'SUPER_ADMIN',
  '+91 99999 00000',
  true,
  NULL
)
ON CONFLICT (email) DO UPDATE SET role = 'SUPER_ADMIN';

-- Link existing default users to Primary Shop
UPDATE users SET shop_id = '11111111-1111-1111-1111-111111111111' WHERE shop_id IS NULL AND role != 'SUPER_ADMIN';

-- 4. Safely Add shop_id to all Business Tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'categories', 'medicines', 'batches', 'suppliers', 'purchases', 
    'purchase_items', 'customers', 'prescriptions', 'invoices', 
    'invoice_items', 'sales_returns', 'sales_return_items', 
    'purchase_returns', 'purchase_return_items', 'expense_categories', 
    'expenses', 'cash_registers', 'audit_logs', 'stock_ledger'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE DEFAULT %L', tbl, '11111111-1111-1111-1111-111111111111');
      EXECUTE format('UPDATE %I SET shop_id = %L WHERE shop_id IS NULL', tbl, '11111111-1111-1111-1111-111111111111');
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (shop_id)', 'idx_' || tbl || '_shop_id', tbl);
    END IF;
  END LOOP;
END $$;

-- 5. Compound Unique Constraints per Tenant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_shop_no ON invoices (shop_id, invoice_no);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchases') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_shop_no ON purchases (shop_id, purchase_no);
  END IF;
END $$;
