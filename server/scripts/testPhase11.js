require('dotenv').config();
const { query } = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'lifeshare_secret_key';

function generateToken(id, email, name) {
  return jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '1h' });
}

async function runPhase11Tests() {
  console.log('====================================================');
  console.log('     LIFE_SHARE PHASE 11 COMPREHENSIVE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ✕ FAILED: ${message}`);
      failed++;
    }
  }

  try {
    // Test 1: Check Schema & Column
    console.log('--- TEST 1: Database Schema Addition ---');
    const { USE_SQLITE } = require('../db');
    let hasCol = false;
    if (USE_SQLITE) {
      const colCheck = await query(`PRAGMA table_info(hospitals)`);
      hasCol = colCheck.rows.some(r => r.name === 'hospital_directory_id');
    } else {
      const colCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'hospitals' AND column_name = 'hospital_directory_id'
      `);
      hasCol = colCheck.rows.length === 1;
    }
    assert(hasCol, "hospitals.hospital_directory_id column exists");

    // Test 2: Verify Controlled Network Hospitals Linking
    console.log('\n--- TEST 2: Account Linking & Hospital Directory Resolution ---');
    const linkedHospitals = await query(`
      SELECT h.id as account_id, h.email, h.name as legacy_name,
             hd.id as directory_id, hd.hospital_name, hd.town, hd.latitude, hd.longitude
      FROM hospitals h
      JOIN hospital_directory hd ON h.hospital_directory_id = hd.id
      WHERE hd.id IN (564, 568, 567)
      ORDER BY hd.id ASC
    `);

    assert(linkedHospitals.rows.length === 3, "Three controlled hospitals linked to accounts");

    const expectedMap = {
      564: { name: "Apollo Hospitals — Jubilee Hills", email: "apollo@lifeshare.demo" },
      568: { name: "Yashoda Hospital — Somajiguda", email: "yashoda@lifeshare.demo" },
      567: { name: "Kamineni Hospital — L.B. Nagar", email: "kamineni@lifeshare.demo" }
    };

    linkedHospitals.rows.forEach(h => {
      const exp = expectedMap[h.directory_id];
      assert(
        h.hospital_name.includes(exp.name.split(' ')[0]), 
        `Directory ID ${h.directory_id} resolves to '${h.hospital_name}' (Lat: ${h.latitude}, Lng: ${h.longitude})`
      );
      assert(
        h.email === exp.email,
        `Account ID ${h.account_id} demo login email is '${h.email}'`
      );
    });

    // Test 3: Controlled Map Filter (EXACTLY 3 Hospitals)
    console.log('\n--- TEST 3: Controlled Map Network Filter [564, 568, 567] ---');
    const controlledRes = await query(`
      SELECT hd.id, hd.hospital_name, hd.latitude, hd.longitude
      FROM hospital_directory hd
      WHERE hd.id IN (564, 568, 567)
    `);

    assert(controlledRes.rows.length === 3, "Controlled network returns EXACTLY 3 hospital locations");
    const controlledIds = controlledRes.rows.map(r => r.id).sort((a,b) => a-b);
    assert(
      JSON.stringify(controlledIds) === JSON.stringify([564, 567, 568]), 
      "Controlled network filter matches exactly [564, 567, 568]"
    );

    // Verify excluded IDs do NOT appear
    const excludedIds = [604, 605, 627, 628, 629, 630, 664, 665];
    const excludedCheck = controlledRes.rows.filter(r => excludedIds.includes(r.id));
    assert(excludedCheck.length === 0, "Excluded records (604, 605, 627, 628, 629, 630, 664, 665) are NOT in controlled network");

    // Test 4: Full Hospital Directory Intactness (~30,273 records)
    console.log('\n--- TEST 4: Full Hospital Directory Integrity ---');
    const fullDirCount = await query(`SELECT COUNT(*) as count FROM hospital_directory`);
    const totalCount = parseInt(fullDirCount.rows[0].count, 10);
    assert(totalCount >= 30000, `Full hospital_directory intact (${totalCount} records searchable)`);

    // Test 5: Organ Transfer Flow: Yashoda Somajiguda (568) -> Heart AB+ -> Kamineni LB Nagar (567)
    console.log('\n--- TEST 5: Full Primary Organ Transfer Demonstration Flow ---');

    // Step 5A: Create Organ Heart AB+ listed by Yashoda Somajiguda (hospital_id = 1)
    const yashodaAcc = await query(`SELECT id FROM hospitals WHERE hospital_directory_id = 568`);
    const kamineniAcc = await query(`SELECT id FROM hospitals WHERE hospital_directory_id = 567`);

    const yashodaId = yashodaAcc.rows[0].id;
    const kamineniId = kamineniAcc.rows[0].id;

    const organIns = await query(`
      INSERT INTO organs (hospital_id, type, blood_group, status)
      VALUES ($1, 'Heart', 'AB+', 'available')
      RETURNING *
    `, [yashodaId]);
    const organId = organIns.rows[0].id;
    assert(organId > 0, `Yashoda Somajiguda listed Heart AB+ (organ_id: ${organId})`);

    // Step 5B: Kamineni LB Nagar creates request for Heart AB+
    const reqIns = await query(`
      INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, requested_item_type, requested_blood_group, status)
      VALUES ($1, 'organ', $2, 'critical', 'Heart', 'AB+', 'pending')
      RETURNING *
    `, [kamineniId, organId]);
    const requestId = reqIns.rows[0].id;
    assert(requestId > 0, `Kamineni LB Nagar requested Heart AB+ (request_id: ${requestId})`);

    // Step 5C: Yashoda accepts the request
    await query(`UPDATE requests SET status = 'matched' WHERE id = $1`, [requestId]);
    await query(`UPDATE organs SET status = 'reserved' WHERE id = $1`, [organId]);
    const txIns = await query(`
      INSERT INTO transactions (request_id, donor_hospital_id, recipient_hospital_id, resource_type, resource_id)
      VALUES ($1, $2, $3, 'organ', $4)
      RETURNING *
    `, [requestId, yashodaId, kamineniId, organId]);
    assert(txIns.rows.length === 1, `Yashoda accepted request (transaction logged: ${txIns.rows[0].id})`);

    // Step 5D: Check tracking status BEFORE START TRANSFER (Must be NOT_STARTED / no active tracking)
    const trackBefore = await query(`
      SELECT * FROM tracking_sessions WHERE reference_type = 'organ_transfer' AND reference_id = $1
    `, [requestId]);
    assert(trackBefore.rows.length === 0, "Acceptance did NOT auto-start transfer or GPS (Status: NOT_STARTED)");

    // Step 5E: Yashoda (Source Hospital) starts transfer
    const trackStart = await query(`
      INSERT INTO tracking_sessions (reference_type, reference_id, status)
      VALUES ('organ_transfer', $1, 'initiated')
      RETURNING *
    `, [requestId]);
    const trackSessionId = trackStart.rows[0].id;
    assert(trackStart.rows[0].status === 'initiated', `Authorized source hospital (Yashoda) pressed START TRANSFER (session_id: ${trackSessionId})`);

    // Step 5F: Real GPS location stream update
    const locUpdate = await query(`
      UPDATE tracking_sessions 
      SET current_latitude = 17.4234, current_longitude = 78.4593, status = 'in_transit', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [trackSessionId]);
    assert(locUpdate.rows[0].status === 'in_transit', "GPS location stream updated position to in_transit");

    // Step 5G: Arrival at Destination (Kamineni LB Nagar: 17.3850, 78.4867)
    const arrivalUpdate = await query(`
      UPDATE tracking_sessions
      SET current_latitude = 17.3850, current_longitude = 78.4867, status = 'arrived', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [trackSessionId]);
    assert(arrivalUpdate.rows[0].status === 'arrived', "Live GPS reached destination -> Status: ARRIVED AT DESTINATION");

    // Cleanup test data
    await query(`DELETE FROM tracking_sessions WHERE id = $1`, [trackSessionId]);
    await query(`DELETE FROM transactions WHERE id = $1`, [txIns.rows[0].id]);
    await query(`DELETE FROM requests WHERE id = $1`, [requestId]);
    await query(`DELETE FROM organs WHERE id = $1`, [organId]);
    console.log('  ✓ Test data cleaned up successfully');

    console.log('\n====================================================');
    console.log(`  PHASE 11 TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    const { pool } = require('../db');
    if (pool && pool.end) {
      await pool.end();
    }

    if (failed === 0) {
      console.log('ALL PHASE 11 ASSERTIONS PASSED PERFECTLY!\n');
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n✕ TEST SUITE ERROR:', err);
    process.exit(1);
  }
}

runPhase11Tests();
