/**
 * LIFE_SHARE — Phase 9 Step 3B Test Suite
 * Tests Blood Bank appointment tracking, session authorization, destination coordinates, and IDOR protection.
 */

require('dotenv').config();
const { query } = require('../db');

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9 Step 3B: Blood Bank Navigation & Tracking Tests');
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
  let sessionToken = null;
  let trackingSessionId = null;
  let testBBId = null;

  try {
    // 1. Get a valid Blood Bank record with coordinates
    const bbRes = await query(`
      SELECT id, blood_bank_name, latitude, longitude 
      FROM blood_bank_directory 
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
      LIMIT 1
    `);
    assert(bbRes.rows.length > 0, 'Found blood bank record with destination coordinates');
    const targetBB = bbRes.rows[0];
    testBBId = targetBB.id;

    // 2. Create Appointment referencing exact blood_bank_directory_id
    const apptPayload = {
      blood_bank_directory_id: testBBId,
      patient_name: 'Patient Navigation Tester 3B',
      patient_phone: '+91 91234 56789',
      patient_blood_group: 'AB+',
      appointment_date: new Date(Date.now() + 86400000).toISOString()
    };

    const resAppt = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apptPayload)
    });
    const dataAppt = await resAppt.json();
    assert(resAppt.status === 201, 'Appointment creation returns 201 Created');
    assert(dataAppt.appointment?.id !== undefined, 'Appointment ID created');
    assert(dataAppt.appointment?.session_token !== undefined, 'Patient session token generated');

    createdApptId = dataAppt.appointment.id;
    sessionToken = dataAppt.appointment.session_token;

    // 3. Fetch single appointment detail by ID via Session Token
    const resSingleAppt = await fetch(`${API_BASE}/appointments/${createdApptId}`, {
      headers: { Authorization: `Session ${sessionToken}` }
    });
    const dataSingleAppt = await resSingleAppt.json();
    assert(resSingleAppt.status === 200, 'GET /api/appointments/:id returns 200 OK for authorized session');
    assert(dataSingleAppt.blood_bank_directory_id === testBBId, `Appointment destination references selected blood bank ID #${testBBId}`);
    assert(dataSingleAppt.latitude === targetBB.latitude && dataSingleAppt.longitude === targetBB.longitude, `Destination latitude (${dataSingleAppt.latitude}) and longitude (${dataSingleAppt.longitude}) match blood bank directory`);

    // 4. Test IDOR protection on single appointment GET
    const resUnrelAppt = await fetch(`${API_BASE}/appointments/${createdApptId}`, {
      headers: { Authorization: 'Session invalid_patient_session_999' }
    });
    assert(resUnrelAppt.status === 404 || resUnrelAppt.status === 403, 'Unrelated session token blocked from accessing appointment details');

    // 5. Start Navigation Tracking Session
    const resStartTrack = await fetch(`${API_BASE}/tracking/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Session ${sessionToken}`
      },
      body: JSON.stringify({
        reference_type: 'blood_appointment',
        reference_id: createdApptId
      })
    });
    const dataStartTrack = await resStartTrack.json();
    assert(resStartTrack.status === 201 || resStartTrack.status === 200, 'Start navigation tracking session returns 200/201');
    assert(dataStartTrack.reference_type === 'blood_appointment', 'Tracking reference_type is blood_appointment');
    assert(dataStartTrack.reference_id === createdApptId, 'Tracking reference_id matches appointment ID');
    trackingSessionId = dataStartTrack.id;

    // 6. Test IDOR on tracking session start with invalid session token
    const resBadTrackStart = await fetch(`${API_BASE}/tracking/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Session invalid_patient_session_999'
      },
      body: JSON.stringify({
        reference_type: 'blood_appointment',
        reference_id: createdApptId
      })
    });
    assert(resBadTrackStart.status === 403, 'Unrelated session token blocked from starting tracking session (403 Forbidden)');

    // 7. GET tracking session by reference ID
    const resRefTrack = await fetch(`${API_BASE}/tracking/reference/blood_appointment/${createdApptId}`, {
      headers: { Authorization: `Session ${sessionToken}` }
    });
    const dataRefTrack = await resRefTrack.json();
    assert(resRefTrack.status === 200 && dataRefTrack.id === trackingSessionId, 'GET /api/tracking/reference/blood_appointment/:id returns existing session');

    // 8. Update real location coordinates
    const resLoc = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Session ${sessionToken}`
      },
      body: JSON.stringify({
        latitude: 17.4125,
        longitude: 78.4490
      })
    });
    const dataLoc = await resLoc.json();
    assert(resLoc.status === 200, 'Posting GPS location update returns 200 OK');
    assert(dataLoc.current_latitude === 17.4125 && dataLoc.current_longitude === 78.4490, 'Tracking session location updated on server');

    // 9. Update status to arrived
    const resStatusArrived = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Session ${sessionToken}`
      },
      body: JSON.stringify({ status: 'arrived' })
    });
    const dataStatusArrived = await resStatusArrived.json();
    assert(resStatusArrived.status === 200 && dataStatusArrived.status === 'arrived', 'Status transition to "arrived" succeeded');

  } catch (err) {
    console.error('Test Exception:', err);
    assert(false, `Unexpected failure: ${err.message}`);
  } finally {
    // Cleanup test records
    if (trackingSessionId) {
      await query('DELETE FROM tracking_sessions WHERE id = $1', [trackingSessionId]);
    }
    if (createdApptId) {
      await query('DELETE FROM appointments WHERE id = $1', [createdApptId]);
    }
    console.log('\n  Cleaned up test appointment & tracking session.');
  }

  console.log('\n==================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
