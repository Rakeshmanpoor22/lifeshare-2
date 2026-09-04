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

async function runTests() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  LIFE_SHARE — Phase 4 Equipment Integration Tests');
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
    console.log('[EQUIPMENT CATALOG]');
    const catalogRes = await get('/api/resources/equipment/catalog');
    assert(catalogRes.status === 200, 'Catalog endpoint returns 200 OK', `Catalog endpoint failed: ${catalogRes.status}`);
    assert(Array.isArray(catalogRes.body) && catalogRes.body.length >= 15, `Catalog contains ${catalogRes.body.length} items`, 'Catalog missing or too small');

    console.log('\n[EQUIPMENT FILTERING]');
    const allEqRes = await get('/api/resources/equipment');
    assert(allEqRes.status === 200, 'All equipment endpoint returns 200 OK', `Equipment endpoint failed: ${allEqRes.status}`);
    assert(Array.isArray(allEqRes.body), 'Equipment response is an array', 'Equipment response not an array');
    
    // Check existing demo data intact
    const hasVentilator = allEqRes.body.some(e => e.type === 'Ventilator');
    assert(hasVentilator, 'Existing demo equipment preserved (Ventilator found)', 'Demo equipment missing');

    const filterEqRes = await get('/api/resources/equipment?type=Ventilator');
    assert(filterEqRes.status === 200, 'Filtered equipment endpoint returns 200 OK', `Filtered endpoint failed`);
    assert(filterEqRes.body.every(e => e.type === 'Ventilator'), 'Type filter works correctly', 'Type filter returned wrong equipment');

    console.log('\n[EXISTING DATA INTEGRITY]');
    // Hospital Directory
    const hospRes = await get('/api/hospitals?limit=1');
    assert(hospRes.status === 200 && hospRes.body.data.length > 0, 'Hospital directory intact', 'Hospital directory broken');
    
    // Blood Bank Directory
    const bbRes = await get('/api/blood-banks?limit=1');
    assert(bbRes.status === 200 && bbRes.body.data.length > 0, 'Blood Bank directory intact', 'Blood Bank directory broken');

    // Organs
    const orgRes = await get('/api/resources/organs');
    assert(orgRes.status === 200, 'Organs API intact', 'Organs API broken');

    // Blood
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
