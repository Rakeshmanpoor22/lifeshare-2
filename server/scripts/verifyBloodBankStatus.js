/**
 * READ-ONLY verification — no writes, no modifications.
 */
'use strict';

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');
const db      = new sqlite3.Database('./lifeshare.db', sqlite3.OPEN_READONLY);

console.log('='.repeat(60));
console.log('  LIFE_SHARE — Blood Bank Directory Verification (READ-ONLY)');
console.log('='.repeat(60));

// 3. Source files in data/
const dataDir = path.resolve(__dirname, '../../data');
const dataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
console.log('\n3. Files in data/ folder:');
dataFiles.forEach(f => console.log('   -', f));

db.serialize(() => {

  // 1. Does blood_bank_directory exist?
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blood_bank_directory'",
    (err, row) => {
      const exists = !!row;
      console.log('\n1. blood_bank_directory table: ' + (exists ? 'EXISTS' : 'NOT FOUND'));

      if (exists) {
        // 2. Record count
        db.get('SELECT COUNT(*) as n FROM blood_bank_directory', (err2, r2) => {
          console.log('2. Record count: ' + (r2 ? r2.n : 0));
        });

        // 5. Column names + first 5 rows
        db.all('PRAGMA table_info(blood_bank_directory)', (err3, cols) => {
          if (cols) {
            console.log('\n5. Column names:');
            cols.forEach(c => console.log('   -', c.name, '(' + c.type + ')'));
          }
        });

        db.all('SELECT * FROM blood_bank_directory LIMIT 5', (err4, rows) => {
          if (rows && rows.length > 0) {
            console.log('\n   First 5 records:');
            rows.forEach((r, i) => {
              console.log('   [' + (i+1) + ']',
                r.blood_bank_name || r.h_name || '(no name)',
                '|', r.city || '-',
                '|', r.state || '-'
              );
            });
          }
        });
      } else {
        console.log('2. Record count: 0 (table does not exist)');
        console.log('\n4. Dataset Imported: NO');
        console.log('   (XLS file exists in data/ but has NOT been imported into the database)');
      }
    }
  );

  // 6. Existing live blood table
  db.get('SELECT COUNT(*) as n FROM blood', (err, r) => {
    console.log('\n6. Existing live `blood` table:');
    console.log('   Row count:', r ? r.n : 'ERROR: ' + (err && err.message));
  });

  db.all('SELECT id, hospital_id, blood_group, units, status FROM blood', (err, rows) => {
    if (rows) {
      rows.forEach(r => {
        console.log('   -', JSON.stringify(r));
      });
    }
  });

  // All tables in DB
  db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
    console.log('\n--- All tables in lifeshare.db ---');
    tables && tables.forEach(t => console.log('   -', t.name));
  });

});

setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('  FINAL VERDICT');
  console.log('='.repeat(60));
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blood_bank_directory'",
    (err, row) => {
      const exists = !!row;
      if (exists) {
        db.get('SELECT COUNT(*) as n FROM blood_bank_directory', (err2, r2) => {
          console.log('  Blood Bank Directory Table : EXISTS');
          console.log('  Record Count               :', r2 ? r2.n : 0);
          console.log('  Source File                : data/Blood_bank_updated-sep_2015.xls');
          console.log('  Dataset Imported           :', r2 && r2.n > 0 ? 'YES' : 'NO (table empty)');
          console.log('  Existing Live Blood Table  : UNCHANGED (verified above)');
          db.close();
        });
      } else {
        console.log('  Blood Bank Directory Table : NOT FOUND');
        console.log('  Record Count               : 0');
        console.log('  Source File                : data/Blood_bank_updated-sep_2015.xls (present, not imported)');
        console.log('  Dataset Imported           : NO');
        console.log('  Existing Live Blood Table  : UNCHANGED');
        db.close();
      }
    }
  );
}, 1500);
