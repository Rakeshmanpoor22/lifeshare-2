/**
 * Blood Bank Directory — XLS Analysis Script
 * Reads the .xls file and produces a complete data-quality report.
 */

'use strict';

const XLSX = require('xlsx');
const path = require('path');

const XLS_PATH = path.resolve(__dirname, '../../data/Blood_bank_updated-sep_2015.xls');

console.log('Reading:', XLS_PATH);
const workbook = XLSX.readFile(XLS_PATH);

console.log('\nSheet names:', workbook.SheetNames);

// Use first sheet
const sheetName = workbook.SheetNames[0];
const sheet     = workbook.Sheets[sheetName];

// Convert to JSON array of objects
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
const total = rows.length;

console.log('\nTotal data rows:', total);

if (total === 0) {
  console.log('No data found!');
  process.exit(1);
}

// Get all column names from first row
const headers = Object.keys(rows[0]);
console.log('\nTotal columns:', headers.length);
console.log('\nColumn names:');
headers.forEach((h, i) => console.log(`  [${String(i).padStart(2)}] "${h}"`));

// ── Sample rows ───────────────────────────────────────────────────────────────
console.log('\n\n--- Sample Row 1 ---');
const r1 = rows[0];
Object.entries(r1).forEach(([k, v]) => {
  if (v !== '' && v !== null && v !== undefined) {
    console.log(`  "${k}": "${String(v).substring(0, 100)}"`);
  }
});

console.log('\n--- Sample Row 2 ---');
const r2 = rows[1];
Object.entries(r2).forEach(([k, v]) => {
  if (v !== '' && v !== null && v !== undefined) {
    console.log(`  "${k}": "${String(v).substring(0, 100)}"`);
  }
});

console.log('\n--- Sample Row 3 ---');
const r3 = rows[2];
Object.entries(r3).forEach(([k, v]) => {
  if (v !== '' && v !== null && v !== undefined) {
    console.log(`  "${k}": "${String(v).substring(0, 100)}"`);
  }
});

// ── Missing Value Analysis ────────────────────────────────────────────────────
const NULL_PLACEHOLDERS = new Set([
  '', '0', 'null', 'NULL', 'nil', 'NIL', 'na', 'NA', 'n/a', 'N/A',
  'none', 'NONE', '-', '--', 'not available', 'Not Available',
]);

const isNull = v => {
  if (v === null || v === undefined) return true;
  return NULL_PLACEHOLDERS.has(String(v).trim());
};

console.log('\n\n=== MISSING VALUE ANALYSIS ===');
const missingCounts = {};
headers.forEach(h => { missingCounts[h] = 0; });
rows.forEach(r => {
  headers.forEach(h => { if (isNull(r[h])) missingCounts[h]++; });
});
headers.forEach(h => {
  const missing = missingCounts[h];
  const pct = ((missing / total) * 100).toFixed(1);
  console.log(`  ${h.padEnd(45)} missing: ${String(missing).padStart(6)} (${pct}%)`);
});

// ── State Distribution ────────────────────────────────────────────────────────
const stateCol = headers.find(h =>
  h.toLowerCase().includes('state')
);
if (stateCol) {
  console.log(`\n\n=== STATE DISTRIBUTION (column: "${stateCol}") ===`);
  const stateCounts = {};
  rows.forEach(r => {
    const s = isNull(r[stateCol]) ? '(missing)' : String(r[stateCol]).trim();
    stateCounts[s] = (stateCounts[s] || 0) + 1;
  });
  Object.entries(stateCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log(`  ${s.padEnd(45)} ${n}`));
}

// ── City Distribution (top 20) ────────────────────────────────────────────────
const cityCol = headers.find(h =>
  h.toLowerCase().includes('city') || h.toLowerCase().includes('town')
);
if (cityCol) {
  console.log(`\n\n=== TOP 20 CITIES (column: "${cityCol}") ===`);
  const cityCounts = {};
  rows.forEach(r => {
    const c = isNull(r[cityCol]) ? '(missing)' : String(r[cityCol]).trim();
    cityCounts[c] = (cityCounts[c] || 0) + 1;
  });
  Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([c, n]) => console.log(`  ${c.padEnd(45)} ${n}`));
}

// ── Duplicate Analysis ────────────────────────────────────────────────────────
const nameCol = headers.find(h =>
  h.toLowerCase().includes('name') && h.toLowerCase().includes('blood')
) || headers.find(h => h.toLowerCase().includes('name'));

const distCol = headers.find(h =>
  h.toLowerCase().includes('district')
);
const pincodeCol = headers.find(h =>
  h.toLowerCase().includes('pin')
);

console.log('\n\n=== DUPLICATE ANALYSIS ===');
const seenKeys = new Set();
let duplicates = 0;
rows.forEach(r => {
  const key = [
    nameCol    ? String(r[nameCol] || '') : '',
    distCol    ? String(r[distCol] || '') : '',
    stateCol   ? String(r[stateCol] || '') : '',
    pincodeCol ? String(r[pincodeCol] || '') : '',
  ].join('|').toLowerCase().trim();
  if (seenKeys.has(key)) duplicates++;
  else seenKeys.add(key);
});
console.log('  Potential duplicates (name+district+state+pincode):', duplicates);

// ── Coordinate Analysis ───────────────────────────────────────────────────────
const latCol = headers.find(h => /^lat/i.test(h));
const lngCol = headers.find(h => /^lon|^lng/i.test(h));
const coordCol = headers.find(h =>
  h.toLowerCase().includes('coord') || h.toLowerCase().includes('location')
);

let hasCoords = 0, invalidCoords = 0;
if (latCol && lngCol) {
  rows.forEach(r => {
    const lat = parseFloat(String(r[latCol]).trim());
    const lng = parseFloat(String(r[lngCol]).trim());
    if (!isNaN(lat) && !isNaN(lng)) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) hasCoords++;
      else invalidCoords++;
    }
  });
  console.log(`\n\n=== COORDINATE ANALYSIS (lat="${latCol}", lng="${lngCol}") ===`);
  console.log('  Valid coordinates:  ', hasCoords, '(' + ((hasCoords/total)*100).toFixed(1) + '%)');
  console.log('  Invalid coordinates:', invalidCoords);
  console.log('  No coordinates:     ', total - hasCoords - invalidCoords);
}

// ── Email Validation ──────────────────────────────────────────────────────────
const emailCol = headers.find(h => h.toLowerCase().includes('email'));
if (emailCol) {
  let validEmail = 0, invalidEmail = 0, missingEmail = 0;
  rows.forEach(r => {
    const v = String(r[emailCol] || '').trim();
    if (isNull(v)) missingEmail++;
    else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) validEmail++;
    else invalidEmail++;
  });
  console.log(`\n=== EMAIL ANALYSIS (column: "${emailCol}") ===`);
  console.log('  Valid emails:  ', validEmail);
  console.log('  Invalid emails:', invalidEmail);
  console.log('  Missing emails:', missingEmail);
}

// ── Pincode Validation ────────────────────────────────────────────────────────
if (pincodeCol) {
  let validPin = 0, invalidPin = 0, missingPin = 0;
  rows.forEach(r => {
    const v = String(r[pincodeCol] || '').trim();
    if (isNull(v)) missingPin++;
    else if (/^\d{6}$/.test(v)) validPin++;
    else invalidPin++;
  });
  console.log(`\n=== PINCODE ANALYSIS (column: "${pincodeCol}") ===`);
  console.log('  Valid 6-digit pincodes:', validPin);
  console.log('  Invalid pincodes:      ', invalidPin);
  console.log('  Missing pincodes:      ', missingPin);
}

// ── Source record ID ──────────────────────────────────────────────────────────
const srNoCol = headers.find(h => /sr.*no|serial|^sno$|^s\.no|^id$/i.test(h));
console.log('\n\n=== SOURCE RECORD ID ===');
console.log('  Source ID column:', srNoCol ? `"${srNoCol}"` : 'NOT FOUND — will use row index');

// ── Blood bank type ───────────────────────────────────────────────────────────
const typeCol = headers.find(h =>
  h.toLowerCase().includes('type') || h.toLowerCase().includes('category')
);
if (typeCol) {
  console.log(`\n\n=== BLOOD BANK TYPE DISTRIBUTION (column: "${typeCol}") ===`);
  const typeCounts = {};
  rows.forEach(r => {
    const t = isNull(r[typeCol]) ? '(missing)' : String(r[typeCol]).trim();
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${t.padEnd(45)} ${n}`));
}

// ── FINAL SUMMARY ──────────────────────────────────────────────────────────────
console.log('\n\n' + '='.repeat(65));
console.log('COMPLETE SUMMARY');
console.log('='.repeat(65));
console.log('  File:           ', XLS_PATH);
console.log('  Sheet:          ', sheetName);
console.log('  Total rows:     ', total);
console.log('  Total columns:  ', headers.length);
console.log('  Duplicates:     ', duplicates);
console.log('  Valid coords:   ', hasCoords);
console.log('\n  MAPPED COLUMNS:');
console.log('    Name:       ', nameCol    ? `"${nameCol}"`    : 'NOT FOUND');
console.log('    State:      ', stateCol   ? `"${stateCol}"`   : 'NOT FOUND');
console.log('    District:   ', distCol    ? `"${distCol}"`    : 'NOT FOUND');
console.log('    City:       ', cityCol    ? `"${cityCol}"`    : 'NOT FOUND');
console.log('    Pincode:    ', pincodeCol ? `"${pincodeCol}"` : 'NOT FOUND');
console.log('    Lat:        ', latCol     ? `"${latCol}"`     : 'NOT FOUND');
console.log('    Lng:        ', lngCol     ? `"${lngCol}"`     : 'NOT FOUND');
console.log('    Email:      ', emailCol   ? `"${emailCol}"`   : 'NOT FOUND');
console.log('    Type:       ', typeCol    ? `"${typeCol}"`    : 'NOT FOUND');
console.log('    SrNo:       ', srNoCol    ? `"${srNoCol}"`    : 'NOT FOUND');
