/**
 * LIFE_SHARE — Blood Bank Directory Import Pipeline (ETL)
 *
 * Reads data/Blood_bank_updated-sep_2015.xls, cleans/normalizes
 * each record and bulk-inserts into blood_bank_directory table.
 *
 * Features:
 * - Reads XLS using the xlsx package
 * - Idempotent: INSERT OR IGNORE on source_record_id
 * - Batch transactions for SQLite performance
 * - Converts "NA"/blank/0 placeholders → NULL
 * - Normalizes state/district/city to Title Case
 * - Cleans phone numbers
 * - Validates emails and pincodes
 * - Validates coordinates
 * - Logs rejected rows
 * - Reports final import summary
 *
 * Usage (from server/ directory):
 *   node scripts/importBloodBanks.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const XLSX    = require('xlsx');
const fs      = require('fs');
const path    = require('path');

const USE_SQLITE  = process.env.USE_SQLITE === 'true';
const SQLITE_PATH = path.resolve(__dirname, '..', process.env.SQLITE_PATH || './lifeshare.db');
const XLS_PATH    = path.resolve(__dirname, '../../data/Blood_bank_updated-sep_2015.xls');
const LOG_PATH    = path.resolve(__dirname, './import_blood_banks_rejected.json');
const BATCH_SIZE  = 200;

// ─── NULL / Placeholder Detection ────────────────────────────────────────────
const NULL_SET = new Set([
  '', '0', 'null', 'NULL', 'nil', 'NIL', 'na', 'NA', 'n/a', 'N/A',
  'none', 'NONE', '-', '--', 'not available', 'Not Available', 'nan', 'NaN',
  'N.A.', 'n.a.',
]);

const isNull = (v) => {
  if (v === null || v === undefined) return true;
  return NULL_SET.has(String(v).trim());
};

// ─── Cleaning Utilities ───────────────────────────────────────────────────────
const clean = (v) => {
  if (isNull(v)) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
};

const titleCase = (v) => {
  const s = clean(v);
  if (!s) return null;
  return s.toLowerCase()
    .replace(/(?:^|\s|\/|-)\S/g, c => c.toUpperCase())
    .trim();
};

const cleanPhone = (v) => {
  if (isNull(v)) return null;
  const s = String(v).trim();
  if (NULL_SET.has(s)) return null;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 5 ? s : null;
};

const cleanEmail = (v) => {
  if (isNull(v)) return null;
  const s = String(v).trim().toLowerCase();
  if (NULL_SET.has(s)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

const cleanPincode = (v) => {
  if (isNull(v)) return null;
  const s = String(v).trim();
  return /^\d{6}$/.test(s) ? s : null;
};

const cleanCoord = (v, min, max) => {
  if (isNull(v)) return null;
  const n = parseFloat(String(v).trim());
  if (isNaN(n)) return null;
  return (n >= min && n <= max) ? n : null;
};

const cleanCategory = (v) => {
  const s = clean(v);
  if (!s) return null;
  // Normalize variations
  const lc = s.toLowerCase();
  if (lc.includes('government') || lc.includes('govt') || lc.includes('public')) {
    if (lc.includes('private') || lc.includes('ngo')) return s; // mixed, keep as-is
    return 'Public/Government';
  }
  if (lc.includes('private')) return 'Private';
  if (lc.includes('ngo')) return 'NGO';
  return s;
};

// ─── Record Transformer ───────────────────────────────────────────────────────
function transformRecord(row) {
  return {
    source_record_id: parseInt(String(row.id || '').trim(), 10) || null,
    blood_bank_name:  clean(row.h_name),
    address:          clean(row.address),
    city:             titleCase(row.city),
    district:         titleCase(row.district),
    state:            titleCase(row.state),
    pincode:          cleanPincode(row.pincode),
    contact:          cleanPhone(row.contact),
    category:         cleanCategory(row.category),
    website:          clean(row.website),
    email:            cleanEmail(row.email),
    blood_component:  clean(row.blood_component),
    blood_groups_ref: clean(row.blood_group),
    service_time:     clean(row.service_time),
    latitude:         cleanCoord(row.latitude, -90, 90),
    longitude:        cleanCoord(row.longitude, -180, 180),
  };
}

// ─── SQLite Import ────────────────────────────────────────────────────────────
function importSQLite(records) {
  return new Promise((resolve, reject) => {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(SQLITE_PATH, (err) => {
      if (err) return reject(new Error(`Cannot open SQLite: ${err.message}`));
    });

    const INSERT_SQL = `
      INSERT OR IGNORE INTO blood_bank_directory (
        source_record_id, blood_bank_name, address, city, district, state,
        pincode, contact, category, website, email, blood_component,
        blood_groups_ref, service_time, latitude, longitude, source
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'government_blood_bank_directory')
    `;

    let imported = 0;
    let skipped  = 0;

    const batches = [];
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      batches.push(records.slice(i, i + BATCH_SIZE));
    }

    let batchIndex = 0;

    const processNextBatch = () => {
      if (batchIndex >= batches.length) {
        db.close((err) => {
          if (err) return reject(err);
          resolve({ imported, skipped });
        });
        return;
      }

      const batch = batches[batchIndex++];

      db.run('BEGIN TRANSACTION', (err) => {
        if (err) { console.error('BEGIN error:', err.message); setImmediate(processNextBatch); return; }

        const stmt = db.prepare(INSERT_SQL);
        let batchImported = 0;

        const processRow = (i) => {
          if (i >= batch.length) {
            stmt.finalize((ferr) => {
              if (ferr) console.error('Finalize error:', ferr.message);
              db.run('COMMIT', (cerr) => {
                if (cerr) console.error('COMMIT error:', cerr.message);
                imported += batchImported;
                skipped  += batch.length - batchImported;

                const done = batchIndex * BATCH_SIZE;
                if (done % 500 < BATCH_SIZE) {
                  process.stdout.write(`  Progress: ${Math.min(done, records.length)} / ${records.length}\r`);
                }
                setImmediate(processNextBatch);
              });
            });
            return;
          }

          const r = batch[i];
          const params = [
            r.source_record_id, r.blood_bank_name, r.address, r.city, r.district, r.state,
            r.pincode, r.contact, r.category, r.website, r.email, r.blood_component,
            r.blood_groups_ref, r.service_time, r.latitude, r.longitude,
          ];

          stmt.run(params, function(rerr) {
            if (rerr) console.error('Row error:', rerr.message);
            else if (this.changes > 0) batchImported++;
            processRow(i + 1);
          });
        };

        processRow(0);
      });
    };

    setTimeout(processNextBatch, 50);
  });
}

// ─── PostgreSQL Import ────────────────────────────────────────────────────────
async function importPostgres(records) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lifeshare',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const INSERT_SQL = `
    INSERT INTO blood_bank_directory (
      source_record_id, blood_bank_name, address, city, district, state,
      pincode, contact, category, website, email, blood_component,
      blood_groups_ref, service_time, latitude, longitude, source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'government_blood_bank_directory')
    ON CONFLICT (source_record_id) DO NOTHING
  `;

  let imported = 0, skipped = 0;
  const batches = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) batches.push(records.slice(i, i + BATCH_SIZE));

  for (let bi = 0; bi < batches.length; bi++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batches[bi]) {
        const res = await client.query(INSERT_SQL, [
          r.source_record_id, r.blood_bank_name, r.address, r.city, r.district, r.state,
          r.pincode, r.contact, r.category, r.website, r.email, r.blood_component,
          r.blood_groups_ref, r.service_time, r.latitude, r.longitude,
        ]);
        if (res.rowCount > 0) imported++; else skipped++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Batch ${bi + 1} error:`, err.message);
    } finally {
      client.release();
    }
  }

  await pool.end();
  return { imported, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();

  console.log('═'.repeat(64));
  console.log('  LIFE_SHARE — Blood Bank Directory Import Pipeline');
  console.log(`  Database: ${USE_SQLITE ? 'SQLite' : 'PostgreSQL'}`);
  console.log(`  Source:   ${XLS_PATH}`);
  console.log('═'.repeat(64));

  // ── 1. Verify XLS ────────────────────────────────────────────────────────
  if (!fs.existsSync(XLS_PATH)) {
    console.error(`\n❌  XLS not found: ${XLS_PATH}`);
    process.exit(1);
  }

  // ── 2. Read XLS ──────────────────────────────────────────────────────────
  console.log('\n[1/4] Reading XLS file...');
  const workbook = XLSX.readFile(XLS_PATH);
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`      Rows read: ${rawRows.length.toLocaleString()}`);

  // ── 3. Transform & Validate ──────────────────────────────────────────────
  console.log('\n[2/4] Cleaning and transforming records...');
  const validRecords = [];
  const rejectedRows = [];
  const seenIds      = new Set();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    let record;
    try {
      record = transformRecord(raw);
    } catch (err) {
      rejectedRows.push({ row: i + 2, reason: `Transform error: ${err.message}`, raw });
      continue;
    }

    // Required: name
    if (!record.blood_bank_name) {
      rejectedRows.push({ row: i + 2, reason: 'Missing blood_bank_name', raw });
      continue;
    }

    // Dedup by source_record_id
    if (record.source_record_id !== null) {
      if (seenIds.has(record.source_record_id)) {
        rejectedRows.push({ row: i + 2, reason: `Duplicate source_record_id: ${record.source_record_id}`, raw });
        continue;
      }
      seenIds.add(record.source_record_id);
    }

    validRecords.push(record);
  }

  console.log(`      Valid records:    ${validRecords.length.toLocaleString()}`);
  console.log(`      Rejected records: ${rejectedRows.length}`);

  // ── 4. Import ─────────────────────────────────────────────────────────────
  console.log('\n[3/4] Importing to database...');
  let result;
  try {
    if (USE_SQLITE) result = await importSQLite(validRecords);
    else            result = await importPostgres(validRecords);
  } catch (err) {
    console.error('\n❌  Import failed:', err.message);
    process.exit(1);
  }
  process.stdout.write(' '.repeat(60) + '\r');

  // ── 5. Write Log ──────────────────────────────────────────────────────────
  console.log('\n[4/4] Writing rejection log...');
  const logData = {
    importedAt:    new Date().toISOString(),
    xlsPath:       XLS_PATH,
    totalXlsRows:  rawRows.length,
    validRecords:  validRecords.length,
    imported:      result.imported,
    skipped:       result.skipped,
    rejected:      rejectedRows.length,
    rejectedRows,
  };
  fs.writeFileSync(LOG_PATH, JSON.stringify(logData, null, 2));
  console.log(`      Log: ${LOG_PATH}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(64));
  console.log('  IMPORT SUMMARY');
  console.log('═'.repeat(64));
  console.log(`  XLS total rows:        ${rawRows.length.toLocaleString()}`);
  console.log(`  Valid records:         ${validRecords.length.toLocaleString()}`);
  console.log(`  ✅ Newly imported:     ${result.imported.toLocaleString()}`);
  console.log(`  ⏭  Skipped (exist):   ${result.skipped.toLocaleString()}`);
  console.log(`  ❌ Rejected:           ${rejectedRows.length}`);
  console.log(`  Time:                  ${elapsed}s`);
  console.log('═'.repeat(64));

  if (result.imported > 0) {
    console.log('\n✅  Blood bank import complete!');
  } else if (result.skipped > 0 && result.imported === 0) {
    console.log('\n✅  All records already imported (idempotent). Database is up to date.');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
