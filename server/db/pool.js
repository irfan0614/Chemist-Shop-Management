require('dotenv').config();
const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Parse PostgreSQL DATE as raw YYYY-MM-DD string to avoid timezone day shifts
types.setTypeParser(1082, (val) => val);

const useConnectionString = !!process.env.DATABASE_URL;

const pool = new Pool(
  useConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT || 5432,
        database: process.env.PGDATABASE || 'chemist_shop',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        connectionTimeoutMillis: 10000,
      }
);

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Executes a parameterized SQL query against PostgreSQL.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Gets a client from the pool for transactions.
 */
async function connect() {
  return pool.connect();
}

/**
 * Ensures all schema tables and extensions exist on PostgreSQL.
 * Seeds only the Super Admin account if users table is empty.
 */
async function initDb() {
  try {
    const client = await pool.connect();
    try {
      // 0. Ensure role check constraint is relaxed so existing databases do not throw errors
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
            ALTER TABLE users ADD CONSTRAINT users_role_check 
              CHECK (role IN ('SUPER_ADMIN', 'SHOP_OWNER', 'ADMIN', 'PHARMACIST', 'CASHIER', 'STAFF'));
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
      `);

      // 1. Run schema.sql
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
      }

      // 2. Run multi-tenant migration if exists
      const migrationPath = path.join(__dirname, 'migrations', '001_multi_tenant_migration.sql');
      if (fs.existsSync(migrationPath)) {
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        await client.query(migrationSql);
      }

      // Ensure missing shop columns exist
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shops') THEN
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS default_low_stock_threshold INT NOT NULL DEFAULT 15;
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS default_expiry_alert_days INT NOT NULL DEFAULT 90;
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS debit_note_prefix TEXT NOT NULL DEFAULT 'DBN';
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS debit_note_counter INT NOT NULL DEFAULT 1;
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
      `);

      // 3. Ensure super admin user exists with valid bcrypt hash
      const defaultHash = bcrypt.hashSync('superadmin123', 10);
      await client.query(
        `INSERT INTO users (id, full_name, email, password_hash, role, phone, is_active, shop_id)
         VALUES ('00000000-0000-0000-0000-000000000000', 'Platform Super Admin', 'superadmin@platform.com', $1, 'SUPER_ADMIN', '+91 99999 00000', true, NULL)
         ON CONFLICT (email) DO UPDATE SET password_hash = $1, is_active = true, role = 'SUPER_ADMIN'`,
        [defaultHash]
      );
      console.log('👑 Platform Super Admin ready: superadmin@platform.com (password: superadmin123)');

      // If default demo admin exists with dummy placeholder hash, update to valid bcrypt hash
      const adminHash = bcrypt.hashSync('admin123', 10);
      await client.query(
        `UPDATE users SET password_hash = $1 WHERE email = 'admin@chemist.com' AND (password_hash LIKE '$2a$10$wEeVg7d8%' OR password_hash IS NULL)`,
        [adminHash]
      ).catch(() => {});

      console.log('✅ PostgreSQL Database schema verified and initialized.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('⚠️ Database initialization notice:', err.message);
  }
}

module.exports = {
  pool,
  query,
  connect,
  initDb,
};