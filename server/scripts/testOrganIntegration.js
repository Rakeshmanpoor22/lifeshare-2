const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lifeshare.db', sqlite3.OPEN_READONLY);

const get = (path) => new Promise((resolve, reject) => {
  http.get(`http://localhost:5000${path}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      } catch (e) {
        resolve({ status: res.statusCode, body: data });
      }
    });
  }).on('error', reject);
});

const post = (path, data, token) => new Promise((resolve, reject) => {
  const req = http.request(`http://localhost:5000${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  }, (res) => {
    let resData = '';
    res.on('data', chunk => resData += chunk);
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(resData) });
      } catch (e) {
        resolve({ status: res.statusCode, body: resData });
      }
    });
  });
  req.on('error', reject);
  req.write(JSON.stringify(data));
  req.end();
});

async function runTests() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  LIFE_SHARE — Phase 5 Organ Integration Tests');
  console.log('═════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, successMsg, failMsg) => {
    if (condition) {
      console.log(`  ✅ ${successMsg}`);
      passed++;
    } else {
      console.log(`  ❌ ${failMsg}`);
      failed++;
    }
  };

  try {
    console.log('[ORGAN CATALOG]');
    const catalogRes = await get('/api/resources/organs/catalog');
    assert(catalogRes.status === 200, 'Organ catalog endpoint returns 200 OK', `Catalog endpoint failed: ${catalogRes.status}`);
    assert(Array.isArray(catalogRes.body) && catalogRes.body.length === 9, `Catalog contains ${catalogRes.body.length} items (expected 9)`, 'Catalog missing or wrong size');
    const hasKidney = catalogRes.body.some(c => c.type === 'Kidney');
    assert(hasKidney, 'Catalog contains standard types (e.g. Kidney)', 'Catalog missing standard types');

    console.log('\n[EXISTING ORGANS]');
    const allOrgansRes = await get('/api/resources/organs');
    assert(allOrgansRes.status === 200, 'All organs endpoint returns 200 OK', `Organs endpoint failed: ${allOrgansRes.status}`);
    assert(allOrgansRes.body.length >= 9, 'Existing 9 demo organs remain intact', `Found only ${allOrgansRes.body.length} organs`);

    console.log('\n[ORGAN VALIDATION & AUTH]');
    // Login to get token
    const loginRes = await post('/api/auth/login', { email: 'yashoda@lifeshare.demo', password: 'password123' });
    assert(loginRes.status === 200 && loginRes.body.token, 'Test auth login successful', 'Login failed');
    const token = loginRes.body.token;

    // Test invalid organ type
    const badPost = await post('/api/resources/organs', { type: 'InvalidTypoKidney', blood_group: 'O+' }, token);
    assert(badPost.status === 400, 'Invalid organ type correctly rejected (400 Bad Request)', `Failed to reject invalid organ type: status ${badPost.status}`);

    // Test valid organ type
    const goodPost = await post('/api/resources/organs', { type: 'Heart', blood_group: 'AB+' }, token);
    assert(goodPost.status === 201, 'Valid organ type accepted from catalog (201 Created)', `Failed to accept valid organ type: status ${goodPost.status}`);

    console.log('\n[SYSTEM COMPATIBILITY]');
    const bbRes = await get('/api/blood-banks?limit=1');
    assert(bbRes.status === 200, 'Blood Bank directory intact', 'Blood Bank directory broken');
    const equipRes = await get('/api/resources/equipment');
    assert(equipRes.status === 200, 'Equipment API intact', 'Equipment API broken');
    const bloodRes = await get('/api/resources/blood');
    assert(bloodRes.status === 200, 'Blood API intact', 'Blood API broken');

  } catch (error) {
    console.log(`\n  ❌ TEST SUITE FAILED TO RUN: ${error.message}`);
    failed++;
  } finally {
    db.close();
  }

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('  ❌ SOME TESTS FAILED');
  } else {
    console.log('  ✅ ALL TESTS PASSED');
  }
  console.log('═════════════════════════════════════════════════════════════════\n');
}

runTests();
