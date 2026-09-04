/**
 * LIFE_SHARE — Phase 9 Step 3A Test Suite
 * Tests Blood Bank directory search, appointment creation, destination data payload, and separation.
 */

require('dotenv').config();
const { query } = require('../db');

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9 Step 3A: Blood Bank & Destination Tests');
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

  let createdApptId = null;
  let testSessionToken = null;
  let testBBId = null;

  try {
    // Test 1: Full Blood Bank Directory count & search
    const resList = await fetch(`${API_BASE}/blood-banks?limit=1`);
    const dataList = await resList.json();
    assert(resList.status === 200, 'GET /api/blood-banks returns 200 OK');
    assert(dataList.pagination && dataList.pagination.total >= 2900, `Full directory available: ${dataList.pagination?.total} records (expected ~2947)`);

    // Test 2: Search filtering works across full dataset
    const resSearch = await fetch(`${API_BASE}/blood-banks?q=Hyderabad`);
    const dataSearch = await resSearch.json();
    assert(resSearch.status === 200 && dataSearch.data.length > 0, `Search full directory returns matching records (${dataSearch.data.length} found for "Hyderabad")`);

    // Test 3: Get single Blood Bank detail by ID
    testBBId = dataSearch.data[0].id;
    const resDetail = await fetch(`${API_BASE}/blood-banks/${testBBId}`);
    const dataDetail = await resDetail.json();
    assert(resDetail.status === 200 && dataDetail.data.id === testBBId, `Single Blood Bank detail returns exact selected record ID #${testBBId}`);
    assert(dataDetail.data.blood_bank_name !== undefined, `Blood bank name preserved: "${dataDetail.data.blood_bank_name}"`);
    assert(dataDetail.data.latitude !== undefined && dataDetail.data.longitude !== undefined, `Destination coordinates available: lat=${dataDetail.data.latitude}, lng=${dataDetail.data.longitude}`);

    // Test 4: Appointment creation referencing blood_bank_directory_id
    const apptPayload = {
      blood_bank_directory_id: testBBId,
      patient_name: 'Test Patient Step 3A',
      patient_phone: '+91 98765 43210',
      patient_blood_group: 'O+',
      appointment_date: new Date(Date.now() + 86400000).toISOString()
    };
    const resAppt = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apptPayload)
    });
    const dataAppt = await resAppt.json();
    assert(resAppt.status === 201, 'Appointment creation returns 201 Created');
    assert(dataAppt.appointment?.id !== undefined, 'Appointment ID generated');
    assert(dataAppt.appointment?.session_token !== undefined, 'Secure session token returned');

    createdApptId = dataAppt.appointment.id;
    testSessionToken = dataAppt.appointment.session_token;

    // Test 5: Verify stored foreign key points to blood_bank_directory_id
    const dbCheck = await query('SELECT blood_bank_directory_id FROM appointments WHERE id = $1', [createdApptId]);
    assert(dbCheck.rows[0].blood_bank_directory_id === testBBId, `appointments.blood_bank_directory_id stores exact selected ID (${testBBId})`);

    // Test 6: Fetch appointment details via Session token & verify destination data
    const resMy = await fetch(`${API_BASE}/appointments/my`, {
      headers: { Authorization: `Session ${testSessionToken}` }
    });
    const dataMy = await resMy.json();
    assert(resMy.status === 200 && dataMy.length > 0, 'GET /api/appointments/my returns 200 with appointment data');
    const myAppt = dataMy[0];
    assert(myAppt.blood_bank_name === dataDetail.data.blood_bank_name, `Appointment confirmation joins exact Blood Bank name: "${myAppt.blood_bank_name}"`);
    assert(myAppt.latitude !== undefined && myAppt.longitude !== undefined, `Appointment response provides destination latitude (${myAppt.latitude}) and longitude (${myAppt.longitude}) for Phase 9 Step 3B`);
    assert(myAppt.address !== undefined && myAppt.city !== undefined, `Appointment response includes full address ("${myAppt.address}", ${myAppt.city})`);

    // Test 7: Unauthorized appointment retrieval rejected
    const resBadAuth = await fetch(`${API_BASE}/appointments/my`, {
      headers: { Authorization: 'Session invalid_token_xyz' }
    });
    const dataBadAuth = await resBadAuth.json();
    assert(resBadAuth.status === 200 && dataBadAuth.length === 0, 'Invalid session token returns empty list (no data leak)');

    const resNoAuth = await fetch(`${API_BASE}/appointments/my`);
    assert(resNoAuth.status === 401, 'Missing session token header rejected with 401 Unauthorized');

  } catch (err) {
    console.error('Test Exception:', err);
    assert(false, `Unexpected failure: ${err.message}`);
  } finally {
    // Cleanup test appointment
    if (createdApptId) {
      await query('DELETE FROM appointments WHERE id = $1', [createdApptId]);
      console.log('\n  Cleaned up test appointment.');
    }
  }

  console.log('\n==================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
