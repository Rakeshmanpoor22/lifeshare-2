const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

async function migratePG() {
  console.log('--- Applying Phase 9.5B PostgreSQL Migration ---');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query(`
      ALTER TABLE requests 
      ADD COLUMN IF NOT EXISTS requested_item_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS requested_blood_group VARCHAR(10);
    `);
    console.log('✅ PostgreSQL requests table columns added successfully.');
  } catch (err) {
    console.error('❌ PostgreSQL Migration Error:', err.message);
  } finally {
    await pool.end();
  }
}

function migrateSQLite() {
  return new Promise((resolve) => {
    console.log('--- Applying Phase 9.5B SQLite Migration ---');
    const dbPath = path.resolve(__dirname, '../lifeshare.db');
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.log('SQLite database file not found or inaccessible, skipping SQLite migration.');
        return resolve();
      }
    });

    db.serialize(() => {
      db.run(`ALTER TABLE requests ADD COLUMN requested_item_type TEXT`, () => {});
      db.run(`ALTER TABLE requests ADD COLUMN requested_blood_group TEXT`, () => {});
      console.log('✅ SQLite requests table migration completed.');
      db.close(() => resolve());
    });
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    await migratePG();
  }
  await migrateSQLite();
  console.log('Phase 9.5B Schema Migration Complete.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
