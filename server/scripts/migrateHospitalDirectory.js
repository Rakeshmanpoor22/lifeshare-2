/**
 * LIFE_SHARE — Hospital Directory Migration
 * Creates the hospital_directory table and all search indexes.
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).
 *
 * Usage (from server/ directory):
 *   node scripts/migrateHospitalDirectory.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const USE_SQLITE = process.env.USE_SQLITE === 'true';

// ─── SQLite Schema ────────────────────────────────────────────────────────────
const SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS hospital_directory (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    source_record_id      INTEGER  UNIQUE,          -- Sr_No from source CSV
    hospital_name         TEXT     NOT NULL,
    hospital_category     TEXT,                     -- Private | Public/Government | NULL
    hospital_care_type    TEXT,                     -- Hospital | Clinic | etc.
    medical_system        TEXT,                     -- Allopathic | Ayush | etc.
    address               TEXT,
    location_desc         TEXT,                     -- Landmark / location description
    state                 TEXT,
    state_id              INTEGER,
    district              TEXT,
    district_id           INTEGER,
    subdistrict           TEXT,
    town                  TEXT,
    pincode               TEXT,
    latitude              REAL,                     -- parsed from Location_Coordinates
    longitude             REAL,                     -- parsed from Location_Coordinates
    telephone             TEXT,
    mobile                TEXT,
    emergency_phone       TEXT,
    ambulance_phone       TEXT,
    bloodbank_phone       TEXT,
    email                 TEXT,
    website               TEXT,
    specialties           TEXT,                     -- semicolon-separated list
    facilities            TEXT,                     -- semicolon-separated list
    total_beds            INTEGER,
    emergency_services    TEXT,
    accreditation         TEXT,
    hospital_reg_number   TEXT,
    established_year      INTEGER,
    number_doctors        INTEGER,
    source                TEXT DEFAULT 'government_dataset',
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Indexes for search performance
  `CREATE INDEX IF NOT EXISTS idx_hd_state      ON hospital_directory(state)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_district   ON hospital_directory(district)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_pincode    ON hospital_directory(pincode)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_name       ON hospital_directory(hospital_name)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_category   ON hospital_directory(hospital_category)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_coords     ON hospital_directory(latitude, longitude)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_emergency  ON hospital_directory(emergency_services)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_state_dist ON hospital_directory(state, district)`,
];

// ─── PostgreSQL Schema ────────────────────────────────────────────────────────
const PG_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS hospital_directory (
    id                    SERIAL        PRIMARY KEY,
    source_record_id      INTEGER       UNIQUE,
    hospital_name         TEXT          NOT NULL,
    hospital_category     TEXT,
    hospital_care_type    TEXT,
    medical_system        TEXT,
    address               TEXT,
    location_desc         TEXT,
    state                 TEXT,
    state_id              INTEGER,
    district              TEXT,
    district_id           INTEGER,
    subdistrict           TEXT,
    town                  TEXT,
    pincode               TEXT,
    latitude              DOUBLE PRECISION,
    longitude             DOUBLE PRECISION,
    telephone             TEXT,
    mobile                TEXT,
    emergency_phone       TEXT,
    ambulance_phone       TEXT,
    bloodbank_phone       TEXT,
    email                 TEXT,
    website               TEXT,
    specialties           TEXT,
    facilities            TEXT,
    total_beds            INTEGER,
    emergency_services    TEXT,
    accreditation         TEXT,
    hospital_reg_number   TEXT,
    established_year      INTEGER,
    number_doctors        INTEGER,
    source                TEXT DEFAULT 'government_dataset',
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hd_state      ON hospital_directory(state)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_district   ON hospital_directory(district)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_pincode    ON hospital_directory(pincode)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_name       ON hospital_directory(hospital_name)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_category   ON hospital_directory(hospital_category)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_coords     ON hospital_directory(latitude, longitude)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_emergency  ON hospital_directory(emergency_services)`,
  `CREATE INDEX IF NOT EXISTS idx_hd_state_dist ON hospital_directory(state, district)`,
];

// ─── Run Migration ────────────────────────────────────────────────────────────

async function migratePostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lifeshare',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of PG_STATEMENTS) {
      await client.query(stmt);
    }
    await client.query('COMMIT');
    console.log('✅  PostgreSQL: hospital_directory table and indexes created/verified.');
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
    const dbPath = path.resolve(__dirname, '..', process.env.SQLITE_PATH || './lifeshare.db');
    console.log(`SQLite database path: ${dbPath}`);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(new Error(`Cannot open SQLite: ${err.message}`));
    });

    db.serialize(() => {
      for (const stmt of SQLITE_STATEMENTS) {
        db.run(stmt, (err) => {
          if (err) console.error('Statement error:', err.message, '\nSQL:', stmt.slice(0, 80));
        });
      }
    });

    db.close((err) => {
      if (err) return reject(err);
      console.log('✅  SQLite: hospital_directory table and indexes created/verified.');
      resolve();
    });
  });
}

async function main() {
  console.log('─'.repeat(60));
  console.log('LIFE_SHARE — Hospital Directory Migration');
  console.log(`Database: ${USE_SQLITE ? 'SQLite' : 'PostgreSQL'}`);
  console.log('─'.repeat(60));

  try {
    if (USE_SQLITE) {
      await migrateSQLite();
    } else {
      await migratePostgres();
    }
    console.log('\n✅  Migration complete. Ready for hospital import.');
  } catch (err) {
    console.error('\n❌  Migration failed:', err.message);
    process.exit(1);
  }
}

main();
