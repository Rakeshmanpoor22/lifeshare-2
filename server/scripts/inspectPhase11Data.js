const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query } = require('../db');

async function inspectData() {
  console.log('===========================================================');
  console.log('  LIFE_SHARE — PHASE 11 DATA AUDIT & INSPECTION');
  console.log('===========================================================\n');

  const candidateIds = [564, 567, 568, 604, 605, 627, 628, 629, 630, 664, 665];

  const res = await query(`
    SELECT id, hospital_name, hospital_category, address, district, state, latitude, longitude
    FROM hospital_directory
    WHERE id = ANY($1::int[])
    ORDER BY hospital_name ASC, id ASC
  `, [candidateIds]);

  console.log(`Inspecting ${res.rows.length} candidate hospital_directory records:\n`);

  const coordMap = {};
  const approvedRecords = [];
  const excludedRecords = [];

  for (const row of res.rows) {
    const coordKey = (row.latitude !== null && row.longitude !== null) 
      ? `${row.latitude},${row.longitude}` 
      : 'NULL';
    
    if (coordKey !== 'NULL') {
      if (!coordMap[coordKey]) coordMap[coordKey] = [];
      coordMap[coordKey].push(row);
    }

    // Check facility type
    const isFertilityCentre = row.hospital_name.toLowerCase().includes('fertility');
    let excludeReason = null;

    if (isFertilityCentre) {
      excludeReason = 'Specialized fertility centre, not a general/multi-speciality organ transplant hospital';
    }

    if (excludeReason) {
      excludedRecords.push({ ...row, excludeReason });
    } else {
      approvedRecords.push(row);
    }
  }

  console.log('--- CANDIDATE RECORDS AUDIT ---');
  res.rows.forEach(r => {
    console.log(`[ID ${r.id}] ${r.hospital_name.trim()}`);
    console.log(`   Address: ${(r.address || '').trim()}`);
    console.log(`   Location: Lat ${r.latitude}, Lng ${r.longitude}`);
    console.log(`   Category: ${r.hospital_category || 'N/A'}`);
    console.log('');
  });

  console.log('--- COORDINATE DUPLICATION AUDIT ---');
  let duplicateCount = 0;
  for (const [coord, rows] of Object.entries(coordMap)) {
    if (rows.length > 1) {
      duplicateCount++;
      console.log(`⚠️ DUPLICATE COORDINATES FOUND at (${coord}):`);
      rows.forEach(r => console.log(`   - ID ${r.id}: ${r.hospital_name.trim()} (${r.address.trim()})`));
    }
  }
  if (duplicateCount === 0) console.log('✅ No duplicate coordinates found among candidate records.');

  console.log('\n--- FACILITY TYPE VALIDATION & EXCLUSIONS ---');
  if (excludedRecords.length > 0) {
    excludedRecords.forEach(e => {
      console.log(`❌ EXCLUDED ID ${e.id} (${e.hospital_name.trim()}): ${e.excludeReason}`);
    });
  } else {
    console.log('✅ All candidate records represent valid hospital facilities.');
  }

  console.log('\n--- APPROVED THREE-HOSPITAL CONTROLLED NETWORK CANDIDATES ---');
  approvedRecords.forEach(a => {
    console.log(`✅ ID ${a.id} | ${a.hospital_name.trim()} | Lat: ${a.latitude}, Lng: ${a.longitude}`);
  });

  console.log('\n--- INSPECTING EXISTING AUTHENTICATED HOSPITALS (hospitals table) ---');
  const authHosp = await query(`SELECT id, name, email, registration_id, address, city FROM hospitals ORDER BY id ASC`);
  console.log(`Found ${authHosp.rows.length} existing authenticated hospital accounts:`);
  authHosp.rows.forEach(h => {
    console.log(`   [ID ${h.id}] Name: "${h.name}" | Email: ${h.email} | City: ${h.city}`);
  });
}

inspectData().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
