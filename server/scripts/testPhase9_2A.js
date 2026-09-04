const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function makeToken(hospitalId) {
  return jwt.sign({ id: hospitalId, type: 'hospital' }, process.env.JWT_SECRET || 'lifeshare_secret_key');
}

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9.2A: New Tracking Endpoints');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;
  let trackingSessionId = null;

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
    // -- Setup: find a transaction --
    let transRes = await db.query(`
      SELECT t.id, t.request_id, t.donor_hospital_id, t.recipient_hospital_id
      FROM transactions t
      LIMIT 1
    `);

    let transaction;
    let testRequestId = null;
    let cleanupRequestId = null;

    if (transRes.rows.length === 0) {
      console.log('  No transactions found. Creating minimal test data...');

      // Get two hospitals
      const hRes = await db.query('SELECT id FROM hospitals ORDER BY id LIMIT 2');
      if (hRes.rows.length < 2) throw new Error('Need at least 2 hospitals');
      const h1 = hRes.rows[0].id;
      const h2 = hRes.rows[1].id;

      // Get any organ to reference
      let organRes = await db.query('SELECT id FROM organs LIMIT 1');
      let organId = organRes.rows.length > 0 ? organRes.rows[0].id : null;
      if (!organId) {
        const oInsert = await db.query(`INSERT INTO organs (hospital_id, type, blood_group, status) VALUES ($1, 'Kidney', 'O+', 'available') RETURNING id`, [h1]);
        organId = oInsert.rows[0].id;
      }

      const reqInsert = await db.query(
        `INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, status) VALUES ($1, 'organ', $2, 'high', 'matched') RETURNING id`,
        [h1, organId]
      );
      testRequestId = reqInsert.rows[0].id;
      cleanupRequestId = testRequestId;

      const txInsert = await db.query(
        `INSERT INTO transactions (request_id, donor_hospital_id, recipient_hospital_id, resource_type, resource_id) VALUES ($1, $2, $1, 'organ', $3) RETURNING *`,
        [testRequestId, h2, organId]
      );
      transaction = txInsert.rows[0];
    } else {
      transaction = transRes.rows[0];
    }

    const donorId    = transaction.donor_hospital_id;
    const recipientId = transaction.recipient_hospital_id;
    testRequestId   = transaction.request_id;

    // Find unrelated hospital
    const unrelRes = await db.query(
      'SELECT id FROM hospitals WHERE id != $1 AND id != $2 LIMIT 1',
      [donorId, recipientId]
    );
    if (unrelRes.rows.length === 0) throw new Error('No unrelated hospital found');
    const unrelatedId = unrelRes.rows[0].id;

    const authToken      = await makeToken(donorId);
    const unrelatedToken = await makeToken(unrelatedId);

    const authHdr  = { Authorization: `Bearer ${authToken}`,     'Content-Type': 'application/json' };
    const unrelHdr = { Authorization: `Bearer ${unrelatedToken}`, 'Content-Type': 'application/json' };

    console.log(`  Using request_id=${testRequestId}, donor=${donorId}, recipient=${recipientId}, unrelated=${unrelatedId}\n`);

    // Start/resume tracking session (idempotent)
    const startRes = await fetch(`${API_BASE}/tracking/start`, {
      method: 'POST', headers: authHdr,
      body: JSON.stringify({ reference_type: 'organ_transfer', reference_id: testRequestId })
    });
    const startData = await startRes.json();
    if (!startData.id) {
      console.error('  Setup failed - could not start tracking session:', JSON.stringify(startData));
      throw new Error('Failed to create tracking session');
    }
    trackingSessionId = startData.id;
    console.log(`  Tracking session: ${trackingSessionId}\n`);

    // Reset to initiated for clean tests
    await db.query(`UPDATE tracking_sessions SET status = 'initiated', current_latitude = NULL, current_longitude = NULL WHERE id = $1`, [trackingSessionId]);

    // ── GET /reference Tests ────────────────────────────────────────────────
    console.log('--- GET /reference tests ---');

    // Test 1: Authorized GET reference
    const t1 = await fetch(`${API_BASE}/tracking/reference/organ_transfer/${testRequestId}`, { headers: authHdr });
    const t1data = await t1.json();
    assert(t1.status === 200 && t1data.id === trackingSessionId, 'Test 1: Authorized GET reference → 200 + correct session');

    // Test 2: Nonexistent reference
    const t2 = await fetch(`${API_BASE}/tracking/reference/organ_transfer/9999999`, { headers: authHdr });
    assert(t2.status === 404, 'Test 2: Nonexistent reference → 404');

    // Test 3: Unrelated hospital IDOR
    const t3 = await fetch(`${API_BASE}/tracking/reference/organ_transfer/${testRequestId}`, { headers: unrelHdr });
    assert(t3.status === 403, 'Test 3: Unrelated hospital → 403 IDOR blocked');

    // Test 4: No auth token
    const t4 = await fetch(`${API_BASE}/tracking/reference/organ_transfer/${testRequestId}`);
    assert(t4.status === 403, 'Test 4: No auth → 403');

    // Test 5: Invalid reference ID string
    const t5 = await fetch(`${API_BASE}/tracking/reference/organ_transfer/not-a-number`, { headers: authHdr });
    assert(t5.status === 404 || t5.status === 400, 'Test 5: Invalid reference ID → 4xx');

    // ── POST /status Tests ──────────────────────────────────────────────────
    console.log('\n--- POST /status tests ---');

    // Test 6: initiated → in_transit
    const t6 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ status: 'in_transit' })
    });
    const t6data = await t6.json();
    assert(t6.status === 200 && t6data.status === 'in_transit', 'Test 6: initiated → in_transit');

    // Test 7: in_transit → arrived
    const t7 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ status: 'arrived' })
    });
    const t7data = await t7.json();
    assert(t7.status === 200 && t7data.status === 'arrived', 'Test 7: in_transit → arrived');

    // Test 9: Invalid status string
    const t9 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ status: 'flying' })
    });
    assert(t9.status === 400, 'Test 9: Invalid status string → 400');

    // Test 10: Invalid transition (arrived → initiated)
    const t10 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ status: 'initiated' })
    });
    assert(t10.status === 400, 'Test 10: Invalid transition arrived→initiated → 400');

    // Test 11: IDOR - unrelated hospital blocked
    const t11 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: unrelHdr, body: JSON.stringify({ status: 'completed' })
    });
    assert(t11.status === 403, 'Test 11: Unrelated hospital → 403 IDOR blocked');

    // Test 8: arrived → completed
    const t8 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ status: 'completed' })
    });
    const t8data = await t8.json();
    assert(t8.status === 200 && t8data.status === 'completed', 'Test 8: arrived → completed');

    // Test Extra: Cannot update after completed
    const tExtra = await fetch(`${API_BASE}/tracking/${trackingSessionId}/status`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ status: 'arrived' })
    });
    assert(tExtra.status === 400, 'Test Extra: Updating completed session → 400');

    // Test 12: Existing location endpoint still works
    await db.query(`UPDATE tracking_sessions SET status = 'in_transit' WHERE id = $1`, [trackingSessionId]);
    const t12 = await fetch(`${API_BASE}/tracking/${trackingSessionId}/location`, {
      method: 'POST', headers: authHdr, body: JSON.stringify({ latitude: 17.385, longitude: 78.486 })
    });
    const t12data = await t12.json();
    assert(t12.status === 200 && parseFloat(t12data.current_latitude) === 17.385, 'Test 12: Existing location endpoint works');

    console.log(`\n  RESULTS: ${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;

  } catch (err) {
    console.error('\nFatal test error:', err.message, err.stack);
    process.exitCode = 1;
  } finally {
    if (trackingSessionId) {
      await db.query('DELETE FROM tracking_sessions WHERE id = $1', [trackingSessionId]);
      console.log('  Cleaned up tracking session.');
    }
    await db.end();
  }
}

runTests();
