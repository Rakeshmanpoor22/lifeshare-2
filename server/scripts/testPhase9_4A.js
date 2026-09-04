/**
 * LIFE_SHARE — Phase 9 Step 4A Test Suite
 * Tests full Hospital Directory search (~30,273 records), filters, pagination, single detail view, security, and separation.
 */

require('dotenv').config();
const { query } = require('../db');

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('==================================================');
  console.log('  LIFE_SHARE — Phase 9 Step 4A: Hospital Directory Tests');
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

  try {
    // 1. Total records check from database vs API
    const dbCountRes = await query('SELECT COUNT(*) as total FROM hospital_directory');
    const dbTotal = parseInt(dbCountRes.rows[0].total, 10);
    assert(dbTotal >= 30000, `Database contains ${dbTotal.toLocaleString()} records (expected ~30,273)`);

    const resList = await fetch(`${API_BASE}/hospitals?limit=1`);
    const dataList = await resList.json();
    assert(resList.status === 200, 'GET /api/hospitals returns 200 OK');
    assert(dataList.pagination && dataList.pagination.total === dbTotal, `API pagination total (${dataList.pagination?.total}) matches database total`);

    // 2. Search query test
    const resSearch = await fetch(`${API_BASE}/hospitals?q=Apollo`);
    const dataSearch = await resSearch.json();
    assert(resSearch.status === 200 && dataSearch.data.length > 0, `Search query for "Apollo" returns matching records (${dataSearch.pagination.total} found)`);

    // 3. State filter test
    const resState = await fetch(`${API_BASE}/hospitals?state=Telangana`);
    const dataState = await resState.json();
    assert(resState.status === 200 && dataState.data.length > 0, `State filter for "Telangana" returns records (${dataState.pagination.total} found)`);
    assert(dataState.data.every(h => h.state.toLowerCase().includes('telangana')), 'All returned records belong to Telangana');

    // 4. District filter test
    const resDistrict = await fetch(`${API_BASE}/hospitals?district=Hyderabad`);
    const dataDistrict = await resDistrict.json();
    assert(resDistrict.status === 200 && dataDistrict.data.length > 0, `District filter for "Hyderabad" returns records (${dataDistrict.pagination.total} found)`);

    // 5. Category filter test
    const resCat = await fetch(`${API_BASE}/hospitals?category=Private`);
    const dataCat = await resCat.json();
    assert(resCat.status === 200 && dataCat.data.length > 0, `Category filter for "Private" returns records (${dataCat.pagination.total} found)`);

    // 6. Care Type filter test
    const resCare = await fetch(`${API_BASE}/hospitals?care_type=Tertiary`);
    const dataCare = await resCare.json();
    assert(resCare.status === 200, `Care Type filter returns 200 OK (${dataCare.pagination?.total || 0} found)`);

    // 7. Combined filter test (State + Search)
    const resComb = await fetch(`${API_BASE}/hospitals?state=Telangana&q=Hyderabad`);
    const dataComb = await resComb.json();
    assert(resComb.status === 200 && dataComb.data.length > 0, `Combined State + Search query returns records (${dataComb.pagination.total} found)`);

    // 8. Pagination & Limit enforcement test
    const resPage2 = await fetch(`${API_BASE}/hospitals?page=2&limit=10`);
    const dataPage2 = await resPage2.json();
    assert(resPage2.status === 200 && dataPage2.pagination.page === 2 && dataPage2.data.length === 10, 'Pagination page=2&limit=10 works');

    const resOverLimit = await fetch(`${API_BASE}/hospitals?limit=500`);
    const dataOverLimit = await resOverLimit.json();
    assert(dataOverLimit.pagination.limit <= 100, `Max limit enforced: requested 500, capped to ${dataOverLimit.pagination.limit} (max 100)`);

    // 9. Input Sanitization / SQL Injection safety test
    const resSqlInj = await fetch(`${API_BASE}/hospitals?q=' OR 1=1 --`);
    const dataSqlInj = await resSqlInj.json();
    assert(resSqlInj.status === 200, 'SQL injection string in search handled safely without syntax error');

    // 10. Single Hospital Detail view
    const targetId = dataList.data[0].id;
    const resDetail = await fetch(`${API_BASE}/hospitals/${targetId}`);
    const dataDetail = await resDetail.json();
    assert(resDetail.status === 200 && dataDetail.data.id === targetId, `Single detail view returns exact hospital ID #${targetId}`);
    assert(dataDetail.data.hospital_name !== undefined, `Hospital name present: "${dataDetail.data.hospital_name}"`);

    // 11. Invalid ID handling
    const resNotFound = await fetch(`${API_BASE}/hospitals/9999999`);
    assert(resNotFound.status === 404, 'Nonexistent hospital ID returns 404 Not Found');

    const resInvalidId = await fetch(`${API_BASE}/hospitals/abc`);
    assert(resInvalidId.status === 400, 'Non-numeric hospital ID returns 400 Bad Request');

    // 12. Separation Verification: ensure source is hospital_directory
    assert(dataDetail.meta?.source === 'government_dataset', 'Source metadata confirms government reference dataset');

  } catch (err) {
    console.error('Test Exception:', err);
    assert(false, `Unexpected failure: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
