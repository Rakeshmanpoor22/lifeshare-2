/**
 * LIFE_SHARE — Blood Bank Directory Migration
 * Creates blood_bank_directory table + indexes.
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 * Does NOT modify any existing tables.
 *
 * Usage (from server/ directory):
 *   node scripts/migrateBloodBankDirectory.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path      = require('path');
const USE_SQLITE = process.env.USE_SQLITE === 'true';

const SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS blood_bank_directory (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    source_record_id      INTEGER  UNIQUE,
    blood_bank_name       TEXT     NOT NULL,
    address               TEXT,
    city                  TEXT,
    district              TEXT,
    state                 TEXT,
    pincode               TEXT,
    contact               TEXT,
    category              TEXT,
    website               TEXT,
    email                 TEXT,
    blood_component       TEXT,
    blood_groups_ref      TEXT,
    service_time          TEXT,
    latitude              REAL,
    longitude             REAL,
    hospital_directory_id INTEGER REFERENCES hospital_directory(id),
    source                TEXT DEFAULT 'government_blood_bank_directory',
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_state      ON blood_bank_directory(state)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_district   ON blood_bank_directory(district)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_city       ON blood_bank_directory(city)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_pincode    ON blood_bank_directory(pincode)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_name       ON blood_bank_directory(blood_bank_name)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_state_dist ON blood_bank_directory(state, district)`,
];

const PG_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS blood_bank_directory (
    id                    SERIAL PRIMARY KEY,
    source_record_id      INTEGER  UNIQUE,
    blood_bank_name       TEXT     NOT NULL,
    address               TEXT,
    city                  TEXT,
    district              TEXT,
    state                 TEXT,
    pincode               TEXT,
    contact               TEXT,
    category              TEXT,
    website               TEXT,
    email                 TEXT,
    blood_component       TEXT,
    blood_groups_ref      TEXT,
    service_time          TEXT,
    latitude              DOUBLE PRECISION,
    longitude             DOUBLE PRECISION,
    hospital_directory_id INTEGER REFERENCES hospital_directory(id),
    source                TEXT DEFAULT 'government_blood_bank_directory',
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_state      ON blood_bank_directory(state)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_district   ON blood_bank_directory(district)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_city       ON blood_bank_directory(city)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_pincode    ON blood_bank_directory(pincode)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_name       ON blood_bank_directory(blood_bank_name)`,
  `CREATE INDEX IF NOT EXISTS idx_bbd_state_dist ON blood_bank_directory(state, district)`,
];

async function migratePostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lifeshare',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of PG_STATEMENTS) await client.query(stmt);
    await client.query('COMMIT');
    console.log('✅  PostgreSQL: blood_bank_directory table and indexes created/verified.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

function migrateSQLite() {
  return new Promise((resolve, reject) => {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath  = path.resolve(__dirname, '..', process.env.SQLITE_PATH || './lifeshare.db');
    console.log('SQLite database path:', dbPath);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(new Error(`Cannot open SQLite: ${err.message}`));
    });

    db.serialize(() => {
      for (const stmt of SQLITE_STATEMENTS) {
        db.run(stmt, (err) => {
          if (err) console.error('Statement error:', err.message);
        });
      }
    });

    db.close((err) => {
      if (err) return reject(err);
      console.log('✅  SQLite: blood_bank_directory table and indexes created/verified.');
      resolve();
    });
  });
}

async function main() {
  console.log('─'.repeat(60));
  console.log('LIFE_SHARE — Blood Bank Directory Migration');
  console.log(`Database: ${USE_SQLITE ? 'SQLite' : 'PostgreSQL'}`);
  console.log('─'.repeat(60));

  try {
    if (USE_SQLITE) await migrateSQLite();
    else await migratePostgres();
    console.log('\n✅  Migration complete. Ready for blood bank import.');
  } catch (err) {
    console.error('\n❌  Migration failed:', err.message);
    process.exit(1);
  }
}

main();
