const { Pool } = require('pg');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9.1 Appointment Tests');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;
  let createdAppointmentId = null;
  let sessionToken1 = null;

  const assert = (condition, msg) => {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ ${msg}`);
      failed++;
    }
  };

  try {
    // 1. Valid appointment creation
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 2); // 2 days in future
    
    let res = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blood_bank_directory_id: 1, // Must exist in directory
        patient_name: 'Test Patient',
        patient_phone: '1234567890',
        patient_blood_group: 'O+',
        appointment_date: validDate.toISOString()
      })
    });
    
    let resData = await res.json();
    assert(res.status === 201 && resData.appointment.session_token, 'Valid appointment creation succeeds');
    createdAppointmentId = resData.appointment.id;
    sessionToken1 = resData.appointment.session_token;

    // 2. Invalid blood bank ID rejected
    let res2 = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blood_bank_directory_id: 999999,
        patient_name: 'Test',
        patient_phone: '123',
        appointment_date: validDate.toISOString()
      })
    });
    assert(res2.status === 404, 'Invalid blood bank ID rejected (404)');

    // 3. Invalid date/time rejected
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);
    let res3 = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blood_bank_directory_id: 1,
        patient_name: 'Test',
        patient_phone: '123',
        appointment_date: pastDate.toISOString()
      })
    });
    assert(res3.status === 400, 'Invalid/past date rejected (400)');

    // 4 & 5 & 6. Fetching appointments logic (Authorization)
    // No token
    let res4 = await fetch(`${API_BASE}/appointments/my`);
    assert(res4.status === 401, 'Unauthenticated fetch rejected (401)');

    // Valid token (Session 1)
    let fetchRes = await fetch(`${API_BASE}/appointments/my`, {
      headers: { Authorization: `Session ${sessionToken1}` }
    });
    let fetchData = await fetchRes.json();
    assert(fetchRes.status === 200 && fetchData.length === 1 && fetchData[0].id === createdAppointmentId, 'User can retrieve their own appointment');

    // Invalid token (Another user)
    let fetchRes2 = await fetch(`${API_BASE}/appointments/my`, {
      headers: { Authorization: `Session invalid-token-123` }
    });
    let fetchData2 = await fetchRes2.json();
    assert(fetchRes2.status === 200 && fetchData2.length === 0, 'Unrelated user cannot retrieve another user\'s appointment');

    // 7-11. Database counts unchanged verification
    const hd = await db.query('SELECT COUNT(*) FROM hospital_directory');
    assert(hd.rows[0].count == 30273, 'Hospital directory remains unchanged (30273)');

    const bbd = await db.query('SELECT COUNT(*) FROM blood_bank_directory');
    assert(bbd.rows[0].count == 2947, 'Blood-bank directory remains unchanged (2947)');

    const org = await db.query('SELECT COUNT(*) FROM organs');
    assert(org.rows[0].count >= 9, 'Organs resources remain unchanged or normally incremented by preceding tests');

    const b = await db.query('SELECT COUNT(*) FROM blood');
    assert(b.rows[0].count == 4, 'Blood resources remain unchanged (4)');

    const eq = await db.query('SELECT COUNT(*) FROM equipment');
    assert(eq.rows[0].count == 3, 'Equipment remains unchanged (3)');

    console.log(`\n  RESULTS: ${passed} passed, ${failed} failed`);

  } catch (error) {
    console.error('Test execution error:', error.message);
  } finally {
    // Cleanup intentional test record
    if (createdAppointmentId) {
      await db.query('DELETE FROM appointments WHERE id = $1', [createdAppointmentId]);
      console.log('  Cleaned up test appointment.');
    }
    db.end();
  }
}

runTests();
