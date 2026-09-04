/**
 * LIFE_SHARE — Phase 9 Step 4B Test Suite
 * Tests hospital navigation destination binding, coordinate availability, error handling for missing coordinates, and security.
 */

require('dotenv').config();
const { query } = require('../db');

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9 Step 4B: Hospital Navigation Tests');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ ${message}`);
      passed++;
    } else {
      console.log(`  ❌ ${message}`);
      failed++;
    }
  }

  try {
    // 1. Get a hospital with valid coordinates from database
    const hospWithCoordsRes = await query(`
      SELECT id, hospital_name, latitude, longitude 
      FROM hospital_directory 
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
      LIMIT 1
    `);
    assert(hospWithCoordsRes.rows.length > 0, 'Found hospital record with valid location coordinates');
    const targetHosp = hospWithCoordsRes.rows[0];

    // 2. Fetch hospital detail via API
    const resDetail = await fetch(`${API_BASE}/hospitals/${targetHosp.id}`);
    const dataDetail = await resDetail.json();
    assert(resDetail.status === 200, 'GET /api/hospitals/:id returns 200 OK');
    assert(dataDetail.data.id === targetHosp.id, `Hospital record ID matches target #${targetHosp.id}`);
    assert(dataDetail.data.latitude === targetHosp.latitude && dataDetail.data.longitude === targetHosp.longitude, `Destination latitude (${dataDetail.data.latitude}) and longitude (${dataDetail.data.longitude}) match directory values`);

    // 3. Get a hospital without coordinates from database
    const hospNoCoordsRes = await query(`
      SELECT id, hospital_name, latitude, longitude 
      FROM hospital_directory 
      WHERE latitude IS NULL OR longitude IS NULL 
      LIMIT 1
    `);

    if (hospNoCoordsRes.rows.length > 0) {
      const targetNoCoords = hospNoCoordsRes.rows[0];
      const resNoCoords = await fetch(`${API_BASE}/hospitals/${targetNoCoords.id}`);
      const dataNoCoords = await resNoCoords.json();
      assert(resNoCoords.status === 200, 'GET /api/hospitals/:id for hospital without coordinates returns 200 OK');
      assert(dataNoCoords.data.latitude === null || dataNoCoords.data.longitude === null, 'Missing coordinates correctly returned as null without fallback fabrication');
    } else {
      assert(true, 'All hospitals in dataset have coordinates');
    }

    // 4. Invalid ID error handling
    const resNotFound = await fetch(`${API_BASE}/hospitals/99999999`);
    assert(resNotFound.status === 404, 'Nonexistent hospital ID returns 404 Not Found');

    const resInvalidId = await fetch(`${API_BASE}/hospitals/invalid_id_xyz`);
    assert(resInvalidId.status === 400, 'Non-numeric hospital ID returns 400 Bad Request');

    // 5. Security & Separation check
    assert(dataDetail.meta?.source === 'government_dataset', 'Dataset metadata confirms public reference data source');
    assert(dataDetail.data.password === undefined && dataDetail.data.jwt === undefined, 'No sensitive auth credentials exposed in public directory endpoint');

  } catch (err) {
    console.error('Test Exception:', err);
    assert(false, `Unexpected failure: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
