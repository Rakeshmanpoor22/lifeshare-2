/**
 * Phase 1: CSV Analysis Script
 * Analyzes the hospital_directory.csv dataset and produces a data quality report
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../../data/hospital_directory.csv');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function isNullOrEmpty(val) {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toLowerCase();
  return s === '' || s === 'null' || s === 'na' || s === 'n/a' || s === 'nil' || s === '-';
}

function isValidCoord(val, min, max) {
  const n = parseFloat(val);
  return !isNaN(n) && n >= min && n <= max;
}

function isValidPincode(val) {
  return /^\d{6}$/.test(String(val).trim());
}

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim());
}

async function analyze() {
  console.log('Reading CSV...');
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const allLines = content.split('\n');
  const nonEmptyLines = allLines.filter(l => l.trim().length > 0);

  const headers = parseCSVLine(nonEmptyLines[0]);
  console.log('\n=== TOTAL COLUMNS: ' + headers.length + ' ===');
  console.log('COLUMN NAMES:');
  headers.forEach((h, i) => console.log(`  [${i}] ${h}`));

  const totalRows = nonEmptyLines.length - 1;
  console.log(`\n=== TOTAL ROWS (excluding header): ${totalRows} ===`);

  // Parse all rows
  const records = [];
  for (let i = 1; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i];
    if (!line.trim()) continue;
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    records.push(row);
  }

  // Identify key column names (case-insensitive search)
  const findCol = (keywords) => headers.find(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));

  const colName    = findCol(['hospital_name', 'Hospital_Name', 'name']);
  const colState   = findCol(['State_Name', 'state']);
  const colDist    = findCol(['District_Name', 'District', 'district']);
  const colCity    = findCol(['City', 'city', 'Block']);
  const colPin     = findCol(['Pincode', 'PIN', 'pin_code']);
  const colLat     = findCol(['Latitude', 'latitude', 'lat']);
  const colLng     = findCol(['Longitude', 'longitude', 'lng', 'long']);
  const colPhone   = findCol(['Telephone', 'telephone', 'Phone', 'phone']);
  const colMobile  = findCol(['Mobile', 'mobile']);
  const colEmerg   = findCol(['Emergency_Mobile', 'Emergency', 'emergency']);
  const colAmb     = findCol(['Ambulance', 'ambulance']);
  const colEmail   = findCol(['Email', 'email']);
  const colBeds    = findCol(['Beds', 'bed', 'Bed_Count']);
  const colCategory= findCol(['Hospital_Category', 'category', 'Type']);
  const colSystem  = findCol(['System', 'Medical_System', 'system']);

  console.log('\n=== KEY COLUMN DETECTION ===');
  console.log(`  Name:      ${colName}`);
  console.log(`  State:     ${colState}`);
  console.log(`  District:  ${colDist}`);
  console.log(`  City:      ${colCity}`);
  console.log(`  Pincode:   ${colPin}`);
  console.log(`  Latitude:  ${colLat}`);
  console.log(`  Longitude: ${colLng}`);
  console.log(`  Phone:     ${colPhone}`);
  console.log(`  Mobile:    ${colMobile}`);
  console.log(`  Emergency: ${colEmerg}`);
  console.log(`  Ambulance: ${colAmb}`);
  console.log(`  Email:     ${colEmail}`);
  console.log(`  Beds:      ${colBeds}`);
  console.log(`  Category:  ${colCategory}`);
  console.log(`  System:    ${colSystem}`);

  // --- Missing values per column ---
  console.log('\n=== MISSING VALUES PER COLUMN ===');
  headers.forEach(h => {
    const missing = records.filter(r => isNullOrEmpty(r[h])).length;
    const pct = ((missing / records.length) * 100).toFixed(1);
    if (missing > 0) {
      console.log(`  ${h}: ${missing} missing (${pct}%)`);
    }
  });

  // --- Empty hospital names ---
  const emptyNames = records.filter(r => !colName || isNullOrEmpty(r[colName]));
  console.log(`\n=== EMPTY HOSPITAL NAMES: ${emptyNames.length} ===`);

  // --- Duplicate hospital names ---
  const nameCounts = {};
  records.forEach(r => {
    const n = (colName && r[colName] ? r[colName].trim().toLowerCase() : '__EMPTY__');
    nameCounts[n] = (nameCounts[n] || 0) + 1;
  });
  const dupNames = Object.entries(nameCounts).filter(([n, c]) => c > 1 && n !== '__EMPTY__');
  console.log(`\n=== DUPLICATE HOSPITAL NAMES: ${dupNames.length} unique names appear more than once ===`);
  console.log('  Top 10 duplicates:');
  dupNames.sort((a,b) => b[1]-a[1]).slice(0,10).forEach(([n, c]) => console.log(`    "${n}" -> ${c} times`));

  // --- Invalid coordinates ---
  let invalidLat = 0, invalidLng = 0, validCoords = 0;
  records.forEach(r => {
    const lat = colLat ? r[colLat] : null;
    const lng = colLng ? r[colLng] : null;
    if (!isNullOrEmpty(lat) && !isValidCoord(lat, -90, 90)) invalidLat++;
    if (!isNullOrEmpty(lng) && !isValidCoord(lng, -180, 180)) invalidLng++;
    if (!isNullOrEmpty(lat) && !isNullOrEmpty(lng) && isValidCoord(lat, -90, 90) && isValidCoord(lng, -180, 180)) validCoords++;
  });
  console.log(`\n=== COORDINATES ===`);
  console.log(`  Records with valid lat+lng: ${validCoords}`);
  console.log(`  Invalid latitude values: ${invalidLat}`);
  console.log(`  Invalid longitude values: ${invalidLng}`);
  const missingCoords = records.filter(r => isNullOrEmpty(r[colLat]) || isNullOrEmpty(r[colLng])).length;
  console.log(`  Missing coordinates: ${missingCoords}`);

  // --- Invalid pincodes ---
  if (colPin) {
    const invalidPin = records.filter(r => !isNullOrEmpty(r[colPin]) && !isValidPincode(r[colPin])).length;
    const missingPin = records.filter(r => isNullOrEmpty(r[colPin])).length;
    console.log(`\n=== PINCODES ===`);
    console.log(`  Missing: ${missingPin}`);
    console.log(`  Invalid format (not 6-digit): ${invalidPin}`);
  }

  // --- Invalid emails ---
  if (colEmail) {
    const invalidEmail = records.filter(r => !isNullOrEmpty(r[colEmail]) && !isValidEmail(r[colEmail])).length;
    const missingEmail = records.filter(r => isNullOrEmpty(r[colEmail])).length;
    console.log(`\n=== EMAILS ===`);
    console.log(`  Missing: ${missingEmail}`);
    console.log(`  Invalid format: ${invalidEmail}`);
  }

  // --- State distribution ---
  if (colState) {
    const stateCounts = {};
    records.forEach(r => {
      const s = r[colState] ? r[colState].trim() : 'UNKNOWN';
      stateCounts[s] = (stateCounts[s] || 0) + 1;
    });
    const sortedStates = Object.entries(stateCounts).sort((a,b) => b[1]-a[1]);
    console.log(`\n=== STATE DISTRIBUTION (${sortedStates.length} states) ===`);
    sortedStates.forEach(([s, c]) => console.log(`  ${s}: ${c}`));
  }

  // --- Hospital category distribution ---
  if (colCategory) {
    const catCounts = {};
    records.forEach(r => {
      const c = r[colCategory] ? r[colCategory].trim() : 'UNKNOWN';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const sortedCats = Object.entries(catCounts).sort((a,b) => b[1]-a[1]);
    console.log(`\n=== HOSPITAL CATEGORY DISTRIBUTION ===`);
    sortedCats.forEach(([c, n]) => console.log(`  ${c}: ${n}`));
  }

  // --- Beds distribution ---
  if (colBeds) {
    const validBeds = records.filter(r => !isNullOrEmpty(r[colBeds]) && !isNaN(parseInt(r[colBeds]))).length;
    const missingBeds = records.filter(r => isNullOrEmpty(r[colBeds])).length;
    console.log(`\n=== BED COUNTS ===`);
    console.log(`  With numeric bed count: ${validBeds}`);
    console.log(`  Missing: ${missingBeds}`);
  }

  // Show first 3 rows as sample
  console.log('\n=== SAMPLE ROW (record 1) ===');
  Object.entries(records[0]).forEach(([k, v]) => {
    if (v && v.trim()) console.log(`  ${k}: ${v}`);
  });

  console.log('\n=== ANALYSIS COMPLETE ===');
}

analyze().catch(console.error);
