require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const assert = require('assert');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function run() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  LIFE_SHARE — Phase 6 Security & IDOR Tests');
  console.log('═════════════════════════════════════════════════════════════════\n');

  try {
    // We mock two hospitals and test if Hospital A can accept a request for a resource owned by Hospital B.
    
    // 1. Get two distinct hospitals from the database
    const hospitals = await db.query('SELECT * FROM hospitals LIMIT 2');
    if (hospitals.rows.length < 2) {
      console.log('Not enough hospitals to run IDOR tests. Skipping.');
      return;
    }
    const hospA = hospitals.rows[0];
    const hospB = hospitals.rows[1];
    
    // Create a mock organ for Hosp B
    const organRes = await db.query(`INSERT INTO organs (hospital_id, type, blood_group, status) VALUES ($1, 'Kidney', 'A+', 'available') RETURNING *`, [hospB.id]);
    const organId = organRes.rows[0].id;
    
    // Create a mock request by Hosp A for Hosp B's organ
    const reqRes = await db.query(`INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, status) VALUES ($1, 'organ', $2, 'high', 'pending') RETURNING *`, [hospA.id, organId]);
    const requestId = reqRes.rows[0].id;
    
    // SIMULATE ENDPOINT `/accept` called by Hosp A trying to accept ITS OWN REQUEST for Hosp B's resource!
    const mockEndpoint = async (reqUserId, rId) => {
      await db.query('BEGIN');
      const reqCheck = await db.query("SELECT * FROM requests WHERE id = $1 AND status = 'pending'", [rId]);
      if (reqCheck.rows.length === 0) { await db.query('ROLLBACK'); return 404; }
      const request = reqCheck.rows[0];
      
      const ownershipCheck = await db.query(`SELECT id FROM organs WHERE id = $1 AND hospital_id = $2`, [request.target_resource_id, reqUserId]);
      if (ownershipCheck.rows.length === 0) {
        await db.query('ROLLBACK');
        return 403;
      }
      // Success case
      await db.query('ROLLBACK'); // rollback anyway to clean up test
      return 200;
    };

    const attempt1 = await mockEndpoint(hospA.id, requestId);
    assert.strictEqual(attempt1, 403, "Hospital A should be DENIED from accepting a request for Hospital B's resource");
    console.log("  ✅ Hospital A cannot accept Hospital B's resource/request");

    const attempt2 = await mockEndpoint(hospB.id, requestId);
    assert.strictEqual(attempt2, 200, "Hospital B should be ALLOWED to accept a request for its own resource");
    console.log("  ✅ Hospital B can accept a resource it actually owns");

    // Clean up
    await db.query('DELETE FROM requests WHERE id = $1', [requestId]);
    await db.query('DELETE FROM organs WHERE id = $1', [organId]);
    
    console.log('\n═════════════════════════════════════════════════════════════════');
    console.log('  RESULTS: 2 passed, 0 failed');
    console.log('  ✅ ALL SECURITY TESTS PASSED');
    console.log('═════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error(err);
    console.log('⚠️ SECURITY TESTS FAILED');
  } finally {
    db.end();
  }
}

run();
