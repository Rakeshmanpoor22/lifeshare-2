const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const API_BASE = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'lifeshare_secret_key';

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9 Step 5B Tests');
  console.log('  Resource Request Details, Organ Type, Blood Group & Stale Toasts');
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

  const cleanupHospitalIds = [];
  const cleanupOrganIds = [];
  const cleanupRequestIds = [];

  try {
    // ── 1. SETUP TEST HOSPITALS ───────────────────────────────────────────
    console.log('[SETUP] Creating test hospitals & resources directly in DB...');
    const passHash = await bcrypt.hash('password123', 10);
    
    // Hospital A (Requester)
    const hA = await query(
      `INSERT INTO hospitals (name, registration_id, address, city, state, country, contact_number, email, owner_name, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, name, email`,
      ['Test Hospital A 5B', 'REG_5B_A_' + Date.now(), 'Addr A', 'City A', 'State A', 'India', '022-' + Date.now(), 'hospA_5b_' + Date.now() + '@test.com', 'Dr A', passHash]
    );
    const hospA = hA.rows[0];
    cleanupHospitalIds.push(hospA.id);

    // Hospital B (Donor)
    const hB = await query(
      `INSERT INTO hospitals (name, registration_id, address, city, state, country, contact_number, email, owner_name, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, name, email`,
      ['Test Hospital B 5B', 'REG_5B_B_' + Date.now(), 'Addr B', 'City B', 'State B', 'India', '023-' + Date.now(), 'hospB_5b_' + Date.now() + '@test.com', 'Dr B', passHash]
    );
    const hospB = hB.rows[0];
    cleanupHospitalIds.push(hospB.id);

    // Create Donor Resources owned by Hospital B
    // Resource 1: Heart AB+
    const oHeart = await query(
      `INSERT INTO organs (hospital_id, type, blood_group, status) VALUES ($1, $2, $3, 'available') RETURNING id`,
      [hospB.id, 'Heart', 'AB+']
    );
    cleanupOrganIds.push(oHeart.rows[0].id);

    // Resource 2: Kidney O-
    const oKidney = await query(
      `INSERT INTO organs (hospital_id, type, blood_group, status) VALUES ($1, $2, $3, 'available') RETURNING id`,
      [hospB.id, 'Kidney', 'O-']
    );
    cleanupOrganIds.push(oKidney.rows[0].id);

    // Tokens
    const tokenA = jwt.sign({ id: hospA.id, email: hospA.email, name: hospA.name }, JWT_SECRET);
    const tokenB = jwt.sign({ id: hospB.id, email: hospB.email, name: hospB.name }, JWT_SECRET);

    // ── 2. TEST 1: CREATE REQUEST (Heart, AB+, High) ──────────────────────
    console.log('\n[TEST 1] Creating Organ Request (Heart, AB+, High)...');
    const req1Res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        resource_type: 'organ',
        target_resource_id: oHeart.rows[0].id,
        urgency: 'high',
        notes: 'Urgent Heart Transplant needed'
      })
    });
    assert(req1Res.status === 201, 'POST /api/requests returns 201 Created');
    const req1Data = await req1Res.json();
    cleanupRequestIds.push(req1Data.id);

    assert(req1Data.requested_item_type === 'Heart', 'requested_item_type preserved as "Heart"');
    assert(req1Data.requested_blood_group === 'AB+', 'requested_blood_group preserved as "AB+"');

    // ── 3. TEST 2: VERIFY BEFORE ACCEPTANCE (INCOMING & DETAILS) ───────────
    console.log('\n[TEST 2] Verifying Incoming Request (Hospital B) BEFORE Acceptance...');
    const incoming1Res = await fetch(`${API_BASE}/requests/incoming`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(incoming1Res.status === 200, 'GET /api/requests/incoming returns 200 OK');
    const incoming1 = await incoming1Res.json();
    const foundInc1 = incoming1.find(r => r.id === req1Data.id);
    assert(foundInc1 !== undefined, 'Request found in Hospital B incoming list');
    assert(foundInc1?.requested_item_type === 'Heart', 'Incoming request displays requested_item_type: "Heart"');
    assert(foundInc1?.requested_blood_group === 'AB+', 'Incoming request displays requested_blood_group: "AB+"');
    assert(foundInc1?.urgency === 'high', 'Incoming request displays urgency: "high"');

    // Get Request Details
    const detail1Res = await fetch(`${API_BASE}/requests/${req1Data.id}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(detail1Res.status === 200, 'GET /api/requests/:id returns 200 OK');
    const detail1 = await detail1Res.json();
    assert(detail1.requested_resource?.organ_type === 'Heart', 'requested_resource.organ_type is "Heart"');
    assert(detail1.requested_resource?.blood_group === 'AB+', 'requested_resource.blood_group is "AB+"');

    // ── 4. TEST 3: ACCEPTANCE & AFTER ACCEPTANCE VERIFICATION ─────────────
    console.log('\n[TEST 3] Accepting Request & Verifying Details AFTER Acceptance...');
    const accept1Res = await fetch(`${API_BASE}/requests/${req1Data.id}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(accept1Res.status === 200, 'POST /api/requests/:id/accept returns 200 OK');

    // Verify AFTER acceptance
    const detail1AfterRes = await fetch(`${API_BASE}/requests/${req1Data.id}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const detail1After = await detail1AfterRes.json();
    assert(detail1After.status === 'matched', 'Request status is "matched"');
    assert(detail1After.requested_resource?.organ_type === 'Heart', 'AFTER acceptance: Requested Organ is still "Heart"');
    assert(detail1After.requested_resource?.blood_group === 'AB+', 'AFTER acceptance: Requested Blood Group is still "AB+"');
    assert(detail1After.matched_resource?.organ_type === 'Heart', 'Matched Resource Organ is "Heart"');
    assert(detail1After.matched_resource?.blood_group === 'AB+', 'Matched Resource Blood Group is "AB+"');

    // Check transaction info
    const tx1Res = await fetch(`${API_BASE}/requests/${req1Data.id}/transaction`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(tx1Res.status === 200, 'GET /api/requests/:id/transaction returns 200 OK');
    const tx1 = await tx1Res.json();
    assert(tx1.donor_name === hospB.name, `Accepted By actual donor: "${hospB.name}"`);
    assert(tx1.recipient_name === hospA.name, `Destination recipient: "${hospA.name}"`);
    assert(tx1.accepted_at !== undefined, 'Acceptance timestamp recorded');

    // Verify Transfer status is NOT STARTED
    const trackCheckRes = await fetch(`${API_BASE}/tracking/reference/organ_transfer/${req1Data.id}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(trackCheckRes.status === 404, 'Acceptance ≠ Transfer Start: Tracking session does NOT exist yet (404)');

    // ── 5. TEST 4: DYNAMIC SECOND REQUEST (Kidney, O-) ─────────────────────
    console.log('\n[TEST 4] Dynamic Verification with Second Request (Kidney, O-)...');
    const req2Res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        resource_type: 'organ',
        target_resource_id: oKidney.rows[0].id,
        urgency: 'critical',
        notes: 'Critical Kidney Transplant'
      })
    });
    const req2Data = await req2Res.json();
    cleanupRequestIds.push(req2Data.id);

    assert(req2Data.requested_item_type === 'Kidney', 'Dynamic Request 2 item type is "Kidney" (Not hardcoded)');
    assert(req2Data.requested_blood_group === 'O-', 'Dynamic Request 2 blood group is "O-" (Not hardcoded)');

    // ── 6. TEST 5: STALE REQUEST & DUPLICATE ACCEPTANCE HANDLING ──────────
    console.log('\n[TEST 5] Verifying Stale Request Filtering & Re-acceptance Error...');
    // Incoming requests for Hospital B should NO LONGER show Request 1 (which was accepted/matched)
    const incoming2Res = await fetch(`${API_BASE}/requests/incoming`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    const incoming2 = await incoming2Res.json();
    const staleInList = incoming2.find(r => r.id === req1Data.id);
    assert(staleInList === undefined, 'Already-matched Request 1 is filtered OUT of incoming pending requests');

    // Re-accepting Request 1 must fail cleanly with 404
    const reAcceptRes = await fetch(`${API_BASE}/requests/${req1Data.id}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(reAcceptRes.status === 404, 'Re-accepting already-processed request returns 404');
    const reAcceptErr = await reAcceptRes.json();
    assert(reAcceptErr.error.includes('already processed') || reAcceptErr.error.includes('not found'), 'Error message states request not found or already processed');

  } catch (err) {
    console.error('Test execution exception:', err);
    failed++;
  } finally {
    // ── CLEANUP ───────────────────────────────────────────────────────────
    console.log('\n[CLEANUP] Removing test records...');
    for (const reqId of cleanupRequestIds) {
      await query('DELETE FROM transactions WHERE request_id = $1', [reqId]);
      await query('DELETE FROM requests WHERE id = $1', [reqId]);
    }
    for (const organId of cleanupOrganIds) {
      await query('DELETE FROM organs WHERE id = $1', [organId]);
    }
    for (const hospId of cleanupHospitalIds) {
      await query('DELETE FROM audit_logs WHERE hospital_id = $1', [hospId]);
      await query('DELETE FROM notifications WHERE hospital_id = $1', [hospId]);
      await query('DELETE FROM hospitals WHERE id = $1', [hospId]);
    }
    console.log('✅ Cleanup complete.');
  }

  console.log('\n==================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
