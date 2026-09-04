/**
 * LIFE_SHARE — Hospital Directory Import Pipeline (ETL)
 *
 * Reads data/hospital_directory.csv, cleans/normalizes each record,
 * and bulk-inserts into the hospital_directory table.
 *
 * Features:
 * - Idempotent: runs migration first; uses INSERT OR IGNORE on source_record_id
 * - Batch transactions (500 records/batch) for SQLite performance
 * - Parses Location_Coordinates "lat, lng" → separate REAL columns
 * - Normalizes "0" placeholders → NULL for text fields
 * - Validates emails, pincodes, coordinates
 * - Logs rejected rows to scripts/import_rejected.json
 * - Prints summary at completion
 *
 * Usage (from server/ directory):
 *   node scripts/importHospitals.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

const USE_SQLITE  = process.env.USE_SQLITE === 'true';
const SQLITE_PATH = path.resolve(__dirname, '..', process.env.SQLITE_PATH || './lifeshare.db');
const CSV_PATH    = path.resolve(__dirname, '../../data/hospital_directory.csv');
const LOG_PATH    = path.resolve(__dirname, './import_rejected.json');
const BATCH_SIZE  = 500;

// ─── CSV Parser ───────────────────────────────────────────────────────────────
/**
 * Parse a single CSV line, correctly handling double-quoted fields
 * that may contain commas.
 */
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped quote ""
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Data Cleaning Utilities ──────────────────────────────────────────────────
const NULL_PLACEHOLDERS = new Set([
  '', '0', 'null', 'NULL', 'nil', 'NIL', 'na', 'NA', 'n/a', 'N/A',
  'none', 'NONE', '-', '--', 'not available', 'Not Available', 'na/0',
]);

function isNullValue(val) {
  if (val === null || val === undefined) return true;
  return NULL_PLACEHOLDERS.has(String(val).trim());
}

/** Return trimmed string or null */
function cleanText(val) {
  if (isNullValue(val)) return null;
  const s = String(val).trim();
  return s.length === 0 ? null : s;
}

/** Normalize state/district to Title Case */
function normalizeName(val) {
  const s = cleanText(val);
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/(?:^|\s|\/)\S/g, (c) => c.toUpperCase())
    .trim();
}

/** Clean phone numbers: keep only digits, spaces, hyphens, + */
function cleanPhone(val) {
  if (isNullValue(val)) return null;
  const s = String(val).trim();
  // Remove common placeholders before checking
  if (NULL_PLACEHOLDERS.has(s)) return null;
  // Must contain at least 5 digits to be a real phone
  const digits = s.replace(/\D/g, '');
  if (digits.length < 5) return null;
  return s;
}

/** Validate and clean email */
function cleanEmail(val) {
  if (isNullValue(val)) return null;
  const s = String(val).trim().toLowerCase();
  if (NULL_PLACEHOLDERS.has(s)) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  return null; // discard invalid emails
}

/** Validate 6-digit pincode */
function cleanPincode(val) {
  if (isNullValue(val)) return null;
  const s = String(val).trim();
  return /^\d{6}$/.test(s) ? s : null;
}

/**
 * Parse Location_Coordinates "lat, lng" into { lat, lng }
 * Both must be within valid ranges.
 */
function parseCoordinates(val) {
  if (isNullValue(val)) return { lat: null, lng: null };
  const s = String(val).trim();
  if (!s) return { lat: null, lng: null };

  const parts = s.split(',');
  if (parts.length !== 2) return { lat: null, lng: null };

  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());

  if (isNaN(lat) || isNaN(lng)) return { lat: null, lng: null };
  if (lat < -90 || lat > 90)   return { lat: null, lng: null };
  if (lng < -180 || lng > 180) return { lat: null, lng: null };

  return { lat, lng };
}

/** Parse integer, return null if invalid (but 0 is valid) */
function cleanInt(val) {
  if (isNullValue(val)) return null;
  const n = parseInt(String(val).trim(), 10);
  return isNaN(n) ? null : n;
}

/** Parse established year — must be plausible */
function cleanYear(val) {
  const y = cleanInt(val);
  if (y === null) return null;
  return (y >= 1800 && y <= new Date().getFullYear()) ? y : null;
}

/** Clean hospital category — "0" → null */
function cleanCategory(val) {
  const s = cleanText(val);
  if (!s || s === '0') return null;
  // Normalize "Public/ Government" → "Public/Government"
  return s.replace(/\s*\/\s*/g, '/');
}

// ─── Record Transformer ───────────────────────────────────────────────────────
function transformRecord(row) {
  const coords = parseCoordinates(row['Location_Coordinates']);

  return {
    source_record_id:   cleanInt(row['Sr_No']),
    hospital_name:      cleanText(row['Hospital_Name']),
    hospital_category:  cleanCategory(row['Hospital_Category']),
    hospital_care_type: cleanText(row['Hospital_Care_Type']),
    medical_system:     cleanText(row['Discipline_Systems_of_Medicine']),
    address:            cleanText(row['Address_Original_First_Line']),
    location_desc:      cleanText(row['Location']),
    state:              normalizeName(row['State']),
    state_id:           cleanInt(row['State_ID']),
    district:           normalizeName(row['District']),
    district_id:        cleanInt(row['District_ID']),
    subdistrict:        cleanText(row['Subdistrict']) === '0' ? null : cleanText(row['Subdistrict']),
    town:               cleanText(row['Town']),
    pincode:            cleanPincode(row['Pincode']),
    latitude:           coords.lat,
    longitude:          coords.lng,
    telephone:          cleanPhone(row['Telephone']),
    mobile:             cleanPhone(row['Mobile_Number']),
    emergency_phone:    cleanPhone(row['Emergency_Num']),
    ambulance_phone:    cleanPhone(row['Ambulance_Phone_No']),
    bloodbank_phone:    cleanPhone(row['Bloodbank_Phone_No']),
    email:              cleanEmail(row['Hospital_Primary_Email_Id']),
    website:            cleanText(row['Website']),
    specialties:        cleanText(row['Specialties']),
    facilities:         cleanText(row['Facilities']),
    total_beds:         cleanInt(row['Total_Num_Beds']),
    emergency_services: cleanText(row['Emergency_Services']),
    accreditation:      cleanText(row['Accreditation']),
    hospital_reg_number:cleanText(row['Hospital_Regis_Number']),
    established_year:   cleanYear(row['Establised_Year']),
    number_doctors:     cleanInt(row['Number_Doctor']),
  };
}

// ─── SQLite Import ────────────────────────────────────────────────────────────
function importSQLite(records, rejectedRows) {
  return new Promise((resolve, reject) => {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(SQLITE_PATH, (err) => {
      if (err) return reject(new Error(`Cannot open SQLite: ${err.message}`));
    });

    // Run migration first (ensure table exists)
    const CREATE_TABLE = `
      CREATE TABLE IF NOT EXISTS hospital_directory (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        source_record_id      INTEGER  UNIQUE,
        hospital_name         TEXT     NOT NULL,
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
        latitude              REAL,
        longitude             REAL,
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
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const INDEX_STMTS = [
      `CREATE INDEX IF NOT EXISTS idx_hd_state      ON hospital_directory(state)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_district   ON hospital_directory(district)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_pincode    ON hospital_directory(pincode)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_name       ON hospital_directory(hospital_name)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_category   ON hospital_directory(hospital_category)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_coords     ON hospital_directory(latitude, longitude)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_emergency  ON hospital_directory(emergency_services)`,
      `CREATE INDEX IF NOT EXISTS idx_hd_state_dist ON hospital_directory(state, district)`,
    ];

        accreditation, hospital_reg_number, established_year, number_doctors, source
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'government_dataset'
      )
    `;

    let imported = 0;
    let skipped  = 0;

    const runBatch = (batch, callback) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) return callback(err);

        const stmt = db.prepare(INSERT_SQL);
        let batchImported = 0;

        const processNext = (i) => {
          if (i >= batch.length) {
            stmt.finalize((err) => {
              if (err) return callback(err);
              db.run('COMMIT', (err) => {
                if (err) return callback(err);
                imported += batchImported;
                skipped  += (batch.length - batchImported);
                callback(null);
              });
            });
            return;
          }

          const r = batch[i];
          const params = [
            r.source_record_id, r.hospital_name, r.hospital_category, r.hospital_care_type,
            r.medical_system, r.address, r.location_desc, r.state, r.state_id, r.district,
            r.district_id, r.subdistrict, r.town, r.pincode, r.latitude, r.longitude,
            r.telephone, r.mobile, r.emergency_phone, r.ambulance_phone, r.bloodbank_phone,
            r.email, r.website, r.specialties, r.facilities, r.total_beds, r.emergency_services,
            r.accreditation, r.hospital_reg_number, r.established_year, r.number_doctors,
          ];

          stmt.run(params, function(err) {
            if (err) {
              console.error('Row insert error:', err.message);
            } else if (this.changes > 0) {
              batchImported++;
            }
            processNext(i + 1);
          });
        };

        processNext(0);
      });
    };

    // Build up work queue
    db.serialize(() => {
      // Ensure table and indexes
      db.run(CREATE_TABLE, (err) => {
        if (err) { console.error('Table create error:', err.message); }
      });
      for (const idx of INDEX_STMTS) {
        db.run(idx, (err) => {
          if (err && !err.message.includes('already exists')) {
            console.error('Index error:', err.message);
          }
        });
      }
    });

    // Batch processing via async-serial pattern
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

      const currentBatch = batches[batchIndex];
      batchIndex++;

      const processed = batchIndex * BATCH_SIZE;
      if (processed % 5000 < BATCH_SIZE) {
        process.stdout.write(`  Progress: ${Math.min(processed, records.length).toLocaleString()} / ${records.length.toLocaleString()} records processed...\r`);
      }

      runBatch(currentBatch, (err) => {
        if (err) {
          console.error(`Batch ${batchIndex} error:`, err.message);
        }
        setImmediate(processNextBatch);
      });
    };

    // Give the table creation a tick to complete before inserting
    setTimeout(processNextBatch, 100);
  });
}

// ─── PostgreSQL Import ────────────────────────────────────────────────────────
async function importPostgres(records) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lifeshare',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  let imported = 0;
  let skipped  = 0;

  const INSERT_SQL = `
    INSERT INTO hospital_directory (
      source_record_id, hospital_name, hospital_category, hospital_care_type,
      medical_system, address, location_desc, state, state_id, district,
      district_id, subdistrict, town, pincode, latitude, longitude,
      telephone, mobile, emergency_phone, ambulance_phone, bloodbank_phone,
      email, website, specialties, facilities, total_beds, emergency_services,
      accreditation, hospital_reg_number, established_year, number_doctors, source
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,'government_dataset'
    )
    ON CONFLICT (source_record_id) DO NOTHING
  `;

  const batches = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    batches.push(records.slice(i, i + BATCH_SIZE));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        const result = await client.query(INSERT_SQL, [
          r.source_record_id, r.hospital_name, r.hospital_category, r.hospital_care_type,
          r.medical_system, r.address, r.location_desc, r.state, r.state_id, r.district,
          r.district_id, r.subdistrict, r.town, r.pincode, r.latitude, r.longitude,
          r.telephone, r.mobile, r.emergency_phone, r.ambulance_phone, r.bloodbank_phone,
          r.email, r.website, r.specialties, r.facilities, r.total_beds, r.emergency_services,
          r.accreditation, r.hospital_reg_number, r.established_year, r.number_doctors,
        ]);
        if (result.rowCount > 0) imported++;
        else skipped++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Batch ${bi + 1} error:`, err.message);
    } finally {
      client.release();
    }

    const processed = (bi + 1) * BATCH_SIZE;
    if (processed % 5000 < BATCH_SIZE) {
      process.stdout.write(`  Progress: ${Math.min(processed, records.length).toLocaleString()} / ${records.length.toLocaleString()} records processed...\r`);
    }
  }

  await pool.end();
  return { imported, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('═'.repeat(64));
  console.log('  LIFE_SHARE — Hospital Directory Import Pipeline');
  console.log(`  Database: ${USE_SQLITE ? 'SQLite' : 'PostgreSQL'}`);
  console.log(`  CSV:      ${CSV_PATH}`);
  console.log('═'.repeat(64));

  // ── 1. Verify CSV exists ──────────────────────────────────────────────────
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`\n❌  CSV not found: ${CSV_PATH}`);
    console.error('    Place hospital_directory.csv in the data/ folder at the project root.');
    process.exit(1);
  }

  // ── 2. Read & Parse CSV ───────────────────────────────────────────────────
  console.log('\n[1/4] Reading and parsing CSV...');
  const content  = fs.readFileSync(CSV_PATH, 'utf8');
  const lines    = content.split('\n').filter(l => l.trim().length > 0);
  const headers  = parseCSVLine(lines[0]).map(h => h.trim());
  const rawTotal = lines.length - 1;

  console.log(`      Total lines (excl. header): ${rawTotal.toLocaleString()}`);
  console.log(`      Columns detected: ${headers.length}`);

  // ── 3. Clean & Transform ──────────────────────────────────────────────────
  console.log('\n[2/4] Cleaning and transforming records...');
  const validRecords = [];
  const rejectedRows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const vals = parseCSVLine(line);
    const raw  = {};
    headers.forEach((h, idx) => { raw[h] = vals[idx] !== undefined ? vals[idx].trim() : ''; });

    let record;
    try {
      record = transformRecord(raw);
    } catch (err) {
      rejectedRows.push({ lineNumber: i + 1, reason: `Transform error: ${err.message}`, raw });
      continue;
    }

    // Required field: hospital_name
    if (!record.hospital_name) {
      rejectedRows.push({ lineNumber: i + 1, reason: 'Missing hospital_name', raw });
      continue;
    }

    validRecords.push(record);
  }

  console.log(`      Valid records:    ${validRecords.length.toLocaleString()}`);
  console.log(`      Rejected records: ${rejectedRows.length}`);

  // ── 4. Import ─────────────────────────────────────────────────────────────
  console.log('\n[3/4] Importing to database (this may take 30–90 seconds)...');
  let result;
  try {
    if (USE_SQLITE) {
      result = await importSQLite(validRecords, rejectedRows);
    } else {
      result = await importPostgres(validRecords);
    }
  } catch (err) {
    console.error('\n❌  Import failed:', err.message);
    process.exit(1);
  }

  // Clear the progress line
  process.stdout.write(' '.repeat(70) + '\r');

  // ── 5. Write Log ──────────────────────────────────────────────────────────
  console.log('\n[4/4] Writing rejection log...');
  const logData = {
    importedAt:   new Date().toISOString(),
    csvPath:      CSV_PATH,
    totalCsvRows: rawTotal,
    validRecords: validRecords.length,
    imported:     result.imported,
    skipped:      result.skipped,
    rejected:     rejectedRows.length,
    rejectedRows: rejectedRows.slice(0, 200), // Cap log size
  };
  fs.writeFileSync(LOG_PATH, JSON.stringify(logData, null, 2));
  console.log(`      Log written to: ${LOG_PATH}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(64));
  console.log('  IMPORT SUMMARY');
  console.log('═'.repeat(64));
  console.log(`  CSV total rows:        ${rawTotal.toLocaleString()}`);
  console.log(`  Valid records:         ${validRecords.length.toLocaleString()}`);
  console.log(`  ✅ Newly imported:     ${result.imported.toLocaleString()}`);
  console.log(`  ⏭  Skipped (exist):   ${result.skipped.toLocaleString()}`);
  console.log(`  ❌ Rejected:           ${rejectedRows.length}`);
  console.log(`  Time elapsed:          ${elapsed}s`);
  console.log('═'.repeat(64));

  if (result.imported > 0) {
    console.log('\n✅  Import complete! Hospital directory is ready.');
  } else if (result.skipped > 0 && result.imported === 0) {
    console.log('\n✅  All records already imported. Database is up to date (idempotent).');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
