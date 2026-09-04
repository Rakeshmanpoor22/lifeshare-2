/**
 * LIFE_SHARE — Map Integration Test Suite
 *
 * Verifies BBox filtering, boundary limits, empty results,
 * and confirms that existing functionality remains completely intact.
 */
'use strict';

const http = require('http');

const BASE = 'http://localhost:5000/api';
let passed = 0, failed = 0;

const get = (url) => new Promise((resolve, reject) => {
  http.get(url, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
      catch(e) { resolve({ status: res.statusCode, body: data }); }
    });
  }).on('error', reject);
});

const post = (url, payload) => new Promise((resolve, reject) => {
  const data = JSON.stringify(payload);
  const opts  = new URL(url);
  const req   = http.request({
    hostname: opts.hostname, port: opts.port, path: opts.pathname,
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch { resolve({ status: res.statusCode, body }); } });
  });
  req.on('error', reject);
  req.write(data); req.end();
});

const ok = (label, pass, detail = '') => {
  if (pass) { console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); passed++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
};

async function main() {
  console.log('═'.repeat(65));
  console.log('  LIFE_SHARE — Phase 3 Map Integration Tests');
  console.log('═'.repeat(65));

  // 1. Map API Bounding Box Logic
  console.log('\n[MAP BOUNDING BOX API]');
  
  // Missing parameters
  const err1 = await get(`${BASE}/hospitals/nearby`);
  ok('Requires BBox parameters', err1.status === 400);

  // Large bounding box protection
  const err2 = await get(`${BASE}/hospitals/nearby?minLat=0&maxLat=90&minLng=0&maxLng=180`);
  ok('Protects against oversized bounding boxes', err2.status === 400, err2.body.error);

  // Valid small bounding box (Andaman islands)
  const andamanBox = `minLat=11.6&maxLat=12.0&minLng=92.5&maxLng=93.0`;
  const hospNearby = await get(`${BASE}/hospitals/nearby?${andamanBox}`);
  ok('Valid Hospital BBox query succeeds', hospNearby.status === 200, `Found ${hospNearby.body.data?.length} hospitals`);
  
  const bbNearby = await get(`${BASE}/blood-banks/nearby?${andamanBox}`);
  ok('Valid Blood Bank BBox query succeeds', bbNearby.status === 200, `Found ${bbNearby.body.data?.length} blood banks`);

  // Verify coordinates in result
  if (hospNearby.body.data?.length > 0) {
    const first = hospNearby.body.data[0];
    ok('Results contain valid coordinates', first.latitude >= 11.6 && first.latitude <= 12.0 && first.longitude >= 92.5 && first.longitude <= 93.0);
    ok('Metadata marks source as map_markers', hospNearby.body.meta?.type === 'map_markers');
  }

  // 2. Existing functionality
  console.log('\n[EXISTING FUNCTIONALITY PRESERVATION]');
  
  const hospList = await get(`${BASE}/hospitals?limit=1`);
  ok('Hospital Directory list intact', hospList.status === 200 && hospList.body.pagination?.total === 30273);

  const bbList = await get(`${BASE}/blood-banks?limit=1`);
  ok('Blood Bank Directory list intact', bbList.status === 200 && bbList.body.pagination?.total === 2947);

  // Live Blood check
  const login = await post(`${BASE}/auth/login`, { email: 'yashoda@lifeshare.demo', password: 'password123' });
  ok('Authentication intact', login.status === 200);

  const bloodRes = await get(`${BASE}/resources/blood`);
  ok('Live Blood table untouched', bloodRes.status === 200 && bloodRes.body?.length >= 2);

  console.log('\n' + '═'.repeat(65));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log('  ✅ ALL TESTS PASSED');
  else              console.log('  ❌ SOME TESTS FAILED — see above');
  console.log('═'.repeat(65));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
