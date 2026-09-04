require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const USE_SQLITE = process.env.USE_SQLITE === 'true';
if (USE_SQLITE) {
  console.error("Please set USE_SQLITE=false in .env before running migration.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Please set DATABASE_URL in .env before running migration.");
  process.exit(1);
}

const sqliteDb = new sqlite3.Database(require('path').join(__dirname, '../lifeshare.db'), sqlite3.OPEN_READONLY);
const pgDb = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const tablesToMigrate = [
  'hospitals',
  'hospital_directory',
  'blood_bank_directory',
  'organ_catalog',
  'equipment_catalog',
  'organs',
  'blood',
  'equipment',
  'requests',
  'transactions',
  'notifications',
  'audit_logs'
];

async function fetchSqlite(table) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM ${table}`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function migrateTable(tableName) {
  console.log(`\nMigrating table: ${tableName}`);
  const rows = await fetchSqlite(tableName);
  if (rows.length === 0) {
    console.log(`  - 0 rows found, skipping.`);
    return 0;
  }
  
  const columns = Object.keys(rows[0]);
  const columnStr = columns.join(', ');
  
  // PostgreSQL uses 65535 parameter limit.
  // Number of parameters per row = columns.length.
  const batchSize = Math.floor(60000 / columns.length);
  const chunks = chunkArray(rows, batchSize);
  
  let totalInserted = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let valueStrs = [];
    let values = [];
    let paramIndex = 1;
    
    for (const row of chunk) {
      const rowParams = [];
      for (const col of columns) {
        rowParams.push(`$${paramIndex++}`);
        values.push(row[col]);
      }
      valueStrs.push(`(${rowParams.join(', ')})`);
    }
    
    const queryStr = `INSERT INTO ${tableName} (${columnStr}) VALUES ${valueStrs.join(', ')} ON CONFLICT (id) DO NOTHING`;
    const res = await pgDb.query(queryStr, values);
    totalInserted += res.rowCount;
    if (chunks.length > 1) {
      console.log(`  - Inserted batch ${i + 1}/${chunks.length} (${res.rowCount} rows)`);
    }
  }
  
  console.log(`  - Total inserted: ${totalInserted} / ${rows.length}`);
  
  // Update sequence so new inserts don't collide with migrated IDs
  if (columns.includes('id')) {
    try {
      await pgDb.query(`SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE(MAX(id), 1)) FROM ${tableName}`);
      console.log(`  - Sequence updated for ${tableName}`);
    } catch(err) {
      console.log(`  - Warning: Failed to update sequence for ${tableName}: ${err.message}`);
    }
  }
  
  return totalInserted;
}

async function run() {
  console.log('--- STARTING SQLITE TO SUPABASE MIGRATION ---');
  let success = true;
  for (const table of tablesToMigrate) {
    try {
      await migrateTable(table);
    } catch (e) {
      console.error(`\n❌ Error migrating table ${table}:`, e.message);
      success = false;
    }
  }
  
  if (success) {
    console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY!');
  } else {
    console.log('\n⚠️ MIGRATION COMPLETED WITH ERRORS.');
  }
  
  sqliteDb.close();
  pgDb.end();
}

run();
