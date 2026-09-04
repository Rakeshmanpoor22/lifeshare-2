const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'lifeshare_secret_key';
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9 Step 5A Tests');
  console.log('  Resource Request + Matching UX');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, msg) => {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ ${msg}`);
      failed++;
    }
  };

  // Track IDs for cleanup
  const cleanupOrganIds = [];
  const cleanupRequestIds = [];
  const cleanupTransactionIds = [];
  const cleanupTrackingIds = [];
  const cleanupHospitalIds = [];

  try {
    // ── SETUP: Create test hospitals directly in DB + mint JWTs ─────────────
    // This bypasses the auth rate limiter (10 req/15min) which is exhausted
    // by repeated test runs. Matches testSecurityIdor.js pattern.
    console.log('[SETUP] Creating test hospitals directly in DB...\n');

    const ts = Date.now();
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // Hospital A (Requester)
    const hospARes = await db.query(
      `INSERT INTO hospitals (name, registration_id, address, city, state, country, contact_number, email, organisation_size, owner_name, license_number, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, name`,
      [`TestHospA_${ts}`, `REGA${ts}`, '123 Test St', 'Delhi', 'Delhi', 'India',
       `A${ts}`, `hosp_a_${ts}@test.com`, '100', 'Dr. A', `LICA${ts}`, passwordHash]
    );
    const hospA = hospARes.rows[0];
    cleanupHospitalIds.push(hospA.id);

    // Hospital B (Donor)
    const hospBRes = await db.query(
      `INSERT INTO hospitals (name, registration_id, address, city, state, country, contact_number, email, organisation_size, owner_name, license_number, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, name`,
      [`TestHospB_${ts}`, `REGB${ts}`, '456 Test St', 'Delhi', 'Delhi', 'India',
       `B${ts}`, `hosp_b_${ts}@test.com`, '200', 'Dr. B', `LICB${ts}`, passwordHash]
    );
    const hospB = hospBRes.rows[0];
    cleanupHospitalIds.push(hospB.id);

    // Hospital C (Unrelated — for IDOR)
    const hospCRes = await db.query(
      `INSERT INTO hospitals (name, registration_id, address, city, state, country, contact_number, email, organisation_size, owner_name, license_number, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, name`,
      [`TestHospC_${ts}`, `REGC${ts}`, '789 Test St', 'Delhi', 'Delhi', 'India',
       `C${ts}`, `hosp_c_${ts}@test.com`, '50', 'Dr. C', `LICC${ts}`, passwordHash]
    );
    const hospC = hospCRes.rows[0];
    cleanupHospitalIds.push(hospC.id);

    // Mint JWT tokens directly (same payload as auth.js login route)
    const tokenA = jwt.sign({ id: hospA.id, name: hospA.name, role: 'hospital' }, JWT_SECRET, { expiresIn: '1d' });
    const tokenB = jwt.sign({ id: hospB.id, name: hospB.name, role: 'hospital' }, JWT_SECRET, { expiresIn: '1d' });
    const tokenC = jwt.sign({ id: hospC.id, name: hospC.name, role: 'hospital' }, JWT_SECRET, { expiresIn: '1d' });

    console.log(`  Hospital A: ID=${hospA.id}, Name=${hospA.name}`);
    console.log(`  Hospital B: ID=${hospB.id}, Name=${hospB.name}`);
    console.log(`  Hospital C: ID=${hospC.id}, Name=${hospC.name}`);
    assert(tokenA && tokenB && tokenC, 'All three test hospitals created with JWT tokens');

    // ── Create a live organ owned by Hospital B ────────────────────────────
    console.log('\n[RESOURCES] Hospital B posting available organ...');
    const organRes = await db.query(
      `INSERT INTO organs (hospital_id, type, blood_group, status) VALUES ($1, 'Kidney', 'O+', 'available') RETURNING *`,
      [hospB.id]
    );
    const organId = organRes.rows[0].id;
    cleanupOrganIds.push(organId);
    assert(organId > 0, `Live organ created (ID: ${organId}) by Hospital B`);

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 1: REQUEST CREATION VALIDATION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 1: Request Creation Validation ---');

    // 1a. Invalid resource type → 400
    let res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ resource_type: 'invalid_type', target_resource_id: organId, urgency: 'high' })
    });
    assert(res.status === 400, 'Invalid resource_type rejected (400)');

    // 1b. Invalid urgency → 400
    res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ resource_type: 'organ', target_resource_id: organId, urgency: 'super_ultra_urgent' })
    });
    assert(res.status === 400, 'Invalid urgency rejected (400)');

    // 1c. Unauthenticated request → 401
    res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: 'organ', target_resource_id: organId, urgency: 'high' })
    });
    assert(res.status === 401, 'Unauthenticated request creation rejected (401)');

    // 1d. Non-existent resource ID → 404
    res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ resource_type: 'organ', target_resource_id: 99999999, urgency: 'high' })
    });
    assert(res.status === 404, 'Non-existent resource ID rejected (404)');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 2: VALID REQUEST CREATION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 2: Valid Request Creation ---');

    res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        resource_type: 'organ',
        target_resource_id: organId,
        urgency: 'critical',
        notes: 'Patient requires emergency kidney transplant.'
      })
    });
    const reqData = await res.json();
    assert(res.status === 201 && reqData.id, `Request created (ID: ${reqData.id})`);
    assert(reqData.status === 'pending', 'Initial status is pending');
    assert(reqData.resource_type === 'organ', 'Resource type stored as organ');
    assert(reqData.urgency === 'critical', 'Urgency stored as critical');
    const requestId = reqData.id;
    cleanupRequestIds.push(requestId);

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 3: REQUEST VISIBILITY / IDOR
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 3: Request Visibility / IDOR ---');

    // 3a. Hospital A (requester) can view
    res = await fetch(`${API_BASE}/requests/${requestId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const viewAData = await res.json();
    assert(res.status === 200, 'Hospital A (Requester) can view own request (200)');
    assert(viewAData.is_donor === false, 'Hospital A correctly identified as NOT donor');
    assert(viewAData.donor_hospital !== null, 'Donor hospital info included in response');

    // 3b. Hospital B (donor owns organ) can view
    res = await fetch(`${API_BASE}/requests/${requestId}`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    const viewBData = await res.json();
    assert(res.status === 200, 'Hospital B (Donor) can view request for its resource (200)');
    assert(viewBData.is_donor === true, 'Hospital B correctly identified as donor');

    // 3c. Hospital C (unrelated) MUST be denied
    res = await fetch(`${API_BASE}/requests/${requestId}`, {
      headers: { 'Authorization': `Bearer ${tokenC}` }
    });
    assert(res.status === 403, 'Hospital C (Unrelated) correctly forbidden (403)');

    // 3d. Invalid request ID
    res = await fetch(`${API_BASE}/requests/not-a-number`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(res.status === 400, 'Non-numeric request ID rejected (400)');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 4: MY REQUESTS LIST
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 4: My Requests List ---');

    res = await fetch(`${API_BASE}/requests/my`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const myReqsData = await res.json();
    assert(res.status === 200, 'GET /requests/my succeeds for Hospital A');
    const myReqFound = myReqsData.find(r => r.id === requestId);
    assert(myReqFound !== undefined, `Request ${requestId} appears in Hospital A /requests/my`);
    assert(myReqFound && myReqFound.status === 'pending', 'Request shows pending status');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 5: INCOMING REQUESTS (DONOR SIDE)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 5: Incoming Requests (Donor) ---');

    res = await fetch(`${API_BASE}/requests/incoming`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    const incomingData = await res.json();
    assert(res.status === 200, 'GET /requests/incoming succeeds for Hospital B');
    if (Array.isArray(incomingData)) {
      const incomingFound = incomingData.find(r => r.id === requestId);
      assert(incomingFound !== undefined, `Request ${requestId} appears in Hospital B incoming requests`);
    } else {
      console.log('  ⚠️ /requests/incoming did not return array, got:', typeof incomingData);
      assert(false, 'Incoming requests returns an array');
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 6: UNAUTHORIZED ACCEPTANCE
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 6: Unauthorized Acceptance ---');

    // Hospital C cannot accept (doesn't own the organ)
    res = await fetch(`${API_BASE}/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenC}` }
    });
    assert(res.status === 403, 'Hospital C (Unrelated) cannot accept request (403)');

    // Hospital A cannot accept its own request (it's the requester, not donor)
    res = await fetch(`${API_BASE}/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` }
    });
    assert(res.status === 403, 'Hospital A (Requester) cannot accept own request (403)');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 7: AUTHORIZED ACCEPTANCE
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 7: Authorized Acceptance ---');

    res = await fetch(`${API_BASE}/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` }
    });
    const acceptData = await res.json();
    assert(res.status === 200, 'Hospital B acceptance succeeds (200)');
    assert(acceptData.message && acceptData.message.includes('accepted'), 'Acceptance message returned');

    // Verify request status became 'matched'
    res = await fetch(`${API_BASE}/requests/${requestId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const afterAcceptData = await res.json();
    assert(afterAcceptData.status === 'matched', "Request status updated to 'matched'");

    // Verify organ resource is now 'reserved'
    const reservedCheck = await db.query('SELECT status FROM organs WHERE id = $1', [organId]);
    assert(reservedCheck.rows[0].status === 'reserved', "Organ status updated to 'reserved'");

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 8: TRANSACTION VERIFICATION
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 8: Transaction Verification ---');

    res = await fetch(`${API_BASE}/requests/${requestId}/transaction`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const txData = await res.json();
    assert(res.status === 200, 'Transaction accessible to recipient hospital (200)');
    assert(txData.donor_hospital_id === hospB.id, `Donor is Hospital B (ID: ${hospB.id})`);
    assert(txData.recipient_hospital_id === hospA.id, `Recipient is Hospital A (ID: ${hospA.id})`);
    assert(txData.accepted_at !== null, 'Acceptance timestamp recorded');
    assert(txData.donor_name && txData.donor_name.length > 0, 'Donor hospital name present');
    assert(txData.recipient_name && txData.recipient_name.length > 0, 'Recipient hospital name present');
    if (txData.transaction_id) cleanupTransactionIds.push(txData.transaction_id);

    // Transaction inaccessible to Hospital C
    res = await fetch(`${API_BASE}/requests/${requestId}/transaction`, {
      headers: { 'Authorization': `Bearer ${tokenC}` }
    });
    assert(res.status === 404, 'Transaction inaccessible to unrelated Hospital C (404)');

    // Notification was generated for recipient
    const notifCheck = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE hospital_id = $1`,
      [hospA.id]
    );
    assert(parseInt(notifCheck.rows[0].count) > 0, 'Acceptance notification generated for recipient');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 9: CRITICAL — ACCEPTANCE ≠ TRANSFER START
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 9: CRITICAL — Acceptance ≠ Transfer Start ---');

    res = await fetch(`${API_BASE}/tracking/reference/organ_transfer/${requestId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(
      res.status === 404,
      'CONFIRMED: Acceptance did NOT auto-start tracking (404 — no session exists)'
    );

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 10: EXPLICIT TRANSFER START
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 10: Explicit Transfer Start ---');

    res = await fetch(`${API_BASE}/tracking/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ reference_type: 'organ_transfer', reference_id: requestId })
    });
    const startData = await res.json();
    assert(res.status === 201, 'Tracking session created via explicit start (201)');
    assert(startData.id > 0, `Tracking session ID: ${startData.id}`);
    assert(startData.status === 'initiated', "Transfer status is 'initiated' (not auto in_transit)");
    if (startData.id) cleanupTrackingIds.push(startData.id);

    // Now tracking session exists
    res = await fetch(`${API_BASE}/tracking/reference/organ_transfer/${requestId}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(res.status === 200, 'Tracking session accessible after explicit start (200)');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 11: MY REQUESTS AFTER MATCH
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 11: My Requests After Match ---');

    res = await fetch(`${API_BASE}/requests/my`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const myReqsAfter = await res.json();
    const matchedReq = myReqsAfter.find(r => r.id === requestId);
    assert(matchedReq !== undefined, 'Matched request appears in my requests list');
    assert(matchedReq && matchedReq.status === 'matched', 'Status shows as matched');
    assert(matchedReq && matchedReq.donor_hospital_name, 'Donor hospital name present in listing');

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 12: RESOURCE SEPARATION (LIVE vs DIRECTORY)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 12: Resource Separation ---');

    const liveBlood = await db.query('SELECT COUNT(*) FROM blood');
    const dirBlood = await db.query('SELECT COUNT(*) FROM blood_bank_directory');
    assert(
      parseInt(liveBlood.rows[0].count) < parseInt(dirBlood.rows[0].count),
      `Live blood (${liveBlood.rows[0].count}) separate from blood_bank_directory (${dirBlood.rows[0].count})`
    );

    const liveEquip = await db.query('SELECT COUNT(*) FROM equipment');
    const catEquip = await db.query('SELECT COUNT(*) FROM equipment_catalog');
    assert(
      parseInt(liveEquip.rows[0].count) < parseInt(catEquip.rows[0].count),
      `Live equipment (${liveEquip.rows[0].count}) separate from equipment_catalog (${catEquip.rows[0].count})`
    );

    // ════════════════════════════════════════════════════════════════════════
    // TEST GROUP 13: DATABASE INTEGRITY
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- TEST GROUP 13: Database Integrity ---');

    const hdCount = await db.query('SELECT COUNT(*) FROM hospital_directory');
    assert(parseInt(hdCount.rows[0].count) >= 30273, `Hospital directory intact (${hdCount.rows[0].count})`);

    const bbdCount = await db.query('SELECT COUNT(*) FROM blood_bank_directory');
    assert(parseInt(bbdCount.rows[0].count) >= 2947, `Blood bank directory intact (${bbdCount.rows[0].count})`);

  } catch (err) {
    console.error('\n❌ Unexpected test error:', err.message || err);
    failed++;
  } finally {
    // ── CLEANUP ─────────────────────────────────────────────────────────────
    console.log('\n[CLEANUP] Removing test data...');
    try {
      for (const id of cleanupTrackingIds) {
        await db.query('DELETE FROM tracking_sessions WHERE id = $1', [id]);
      }
      for (const id of cleanupTransactionIds) {
        await db.query('DELETE FROM transactions WHERE id = $1', [id]);
      }
      for (const id of cleanupRequestIds) {
        await db.query('DELETE FROM requests WHERE id = $1', [id]);
      }
      for (const id of cleanupOrganIds) {
        await db.query('DELETE FROM organs WHERE id = $1', [id]);
      }
      for (const id of cleanupHospitalIds) {
        await db.query('DELETE FROM notifications WHERE hospital_id = $1', [id]);
        await db.query('DELETE FROM audit_logs WHERE hospital_id = $1', [id]).catch(() => {});
        await db.query('DELETE FROM hospitals WHERE id = $1', [id]);
      }
      console.log('  ✅ Test data cleaned up.');
    } catch (cleanupErr) {
      console.error('  ⚠️ Cleanup error:', cleanupErr.message);
    }

    console.log('\n==================================================');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('  ✅ ALL PHASE 9 STEP 5A TESTS PASSED');
    } else {
      console.log('  ❌ SOME TESTS FAILED');
    }
    console.log('==================================================\n');

    db.end();
    if (failed > 0) process.exit(1);
  }
}

runTests();
