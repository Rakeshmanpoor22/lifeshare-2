const { Pool } = require('pg');
const { io } = require('socket.io-client');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9.2 Tracking Tests');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;
  let createdAppointmentId = null;
  let trackingSessionId = null;
  let sessionToken = null;

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
    // 1. Setup Phase 9.1 Test Appointment for Phase 9.2 context
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 2);
    
    let apptRes = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blood_bank_directory_id: 1,
        patient_name: 'Tracking Test Patient',
        patient_phone: '123',
        patient_blood_group: 'A+',
        appointment_date: validDate.toISOString()
      })
    });
    let apptData = await apptRes.json();
    createdAppointmentId = apptData.appointment.id;
    sessionToken = apptData.appointment.session_token;

    // 2. Unauthorized tracking start rejected
    let tStartUnauth = await fetch(`${API_BASE}/tracking/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_type: 'blood_appointment', reference_id: createdAppointmentId })
    });
    assert(tStartUnauth.status === 401, 'Unauthorized tracking start rejected');

    // 3. Authorized tracking start succeeds
    let tStartAuth = await fetch(`${API_BASE}/tracking/start`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Session ${sessionToken}` 
      },
      body: JSON.stringify({ reference_type: 'blood_appointment', reference_id: createdAppointmentId })
    });
    let trackingData = await tStartAuth.json();
    assert(tStartAuth.status === 201 && trackingData.id, 'Authorized tracking start succeeds');
    trackingSessionId = trackingData.id;

    // 4. Invalid latitude rejected
    let locInvalidLat = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Session ${sessionToken}` },
      body: JSON.stringify({ latitude: 95, longitude: 0 })
    });
    assert(locInvalidLat.status === 400, 'Invalid latitude rejected');

    // 5. Invalid longitude rejected
    let locInvalidLng = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Session ${sessionToken}` },
      body: JSON.stringify({ latitude: 0, longitude: 200 })
    });
    assert(locInvalidLng.status === 400, 'Invalid longitude rejected');

    // 6. Unauthorized location update rejected
    let locUnauth = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 10, longitude: 10 })
    });
    assert(locUnauth.status === 401 || locUnauth.status === 403, 'Unauthorized location update rejected');

    // 7. Test Socket.io Tracking Room authorization and event reception
    const socket = io(SOCKET_URL);
    let socketEventReceived = false;
    let completedEventReceived = false;
    
    await new Promise((resolve) => {
      socket.on('connect', () => {
        // Authenticate correctly
        socket.emit('join_tracking', { tracking_session_id: trackingSessionId, token: sessionToken, type: 'patient' });
        resolve();
      });
    });

    socket.on('tracking:location', (data) => {
      if (data.latitude === 12.34 && data.longitude === 56.78) {
        socketEventReceived = true;
      }
    });

    socket.on('tracking:completed', (data) => {
      completedEventReceived = true;
    });

    // Wait a brief moment for socket to join room
    await new Promise(r => setTimeout(r, 500));

    // 8. Authorized location update succeeds
    let locAuth = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Session ${sessionToken}` },
      body: JSON.stringify({ latitude: 12.34, longitude: 56.78 })
    });
    assert(locAuth.status === 200, 'Authorized location update succeeds');

    // Wait to receive socket event
    await new Promise(r => setTimeout(r, 500));
    assert(socketEventReceived, 'tracking:location emitted and received in authorized room');

    // 9. Latest location returned to authorized participant
    let getTrack = await fetch(`${API_BASE}/tracking/${trackingSessionId}`, {
      headers: { 'Authorization': `Session ${sessionToken}` }
    });
    let getTrackData = await getTrack.json();
    assert(getTrackData.current_latitude === 12.34 && getTrackData.status === 'in_transit', 'Latest location and status returned to authorized participant');

    // 10. Unauthorized tracking GET returns 403 (or 401)
    let getTrackUnauth = await fetch(`${API_BASE}/tracking/${trackingSessionId}`, {
      headers: { 'Authorization': `Session invalid-token` }
    });
    assert(getTrackUnauth.status === 403 || getTrackUnauth.status === 401, 'Unauthorized tracking GET returns 403');

    // 11. Complete tracking (Location update rejected for inactive session check)
    await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Session ${sessionToken}` },
      body: JSON.stringify({ latitude: 12.34, longitude: 56.78, status: 'completed' })
    });
    
    await new Promise(r => setTimeout(r, 500));
    assert(completedEventReceived, 'tracking:completed event emitted correctly');

    let updateCompleted = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Session ${sessionToken}` },
      body: JSON.stringify({ latitude: 13, longitude: 57 })
    });
    assert(updateCompleted.status === 400, 'Location update rejected for inactive/completed session');

    socket.disconnect();

    console.log(`\n  RESULTS: ${passed} passed, ${failed} failed`);

  } catch (error) {
    console.error('Test execution error:', error.message);
  } finally {
    if (trackingSessionId) {
      await db.query('DELETE FROM tracking_sessions WHERE id = $1', [trackingSessionId]);
    }
    if (createdAppointmentId) {
      await db.query('DELETE FROM appointments WHERE id = $1', [createdAppointmentId]);
      console.log('  Cleaned up test records.');
    }
    db.end();
  }
}

runTests();
