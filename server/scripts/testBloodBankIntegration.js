/**
 * Full test suite for Blood Bank Directory + all existing functionality
 */
'use strict';

const http = require('http');
const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
  console.log('  LIFE_SHARE — Full Integration Test Suite');
  console.log('═'.repeat(65));

  // ── Blood Bank Directory API ──────────────────────────────────────────
  console.log('\n[BLOOD BANK DIRECTORY API]');

  const list = await get(`${BASE}/blood-banks?limit=5&page=1`);
  ok('List endpoint responds', list.status === 200, `status=${list.status}`);
  ok('Total = 2947', list.body.pagination?.total === 2947, `got ${list.body.pagination?.total}`);
  ok('Returns 5 records', list.body.data?.length === 5);
  ok('Has meta disclaimer', !!list.body.meta?.disclaimer);
  ok('Has pagination object', !!list.body.pagination);

  const search = await get(`${BASE}/blood-banks?q=civil&limit=5`);
  ok('Search by name works', search.status === 200 && search.body.pagination?.total > 0, `found ${search.body.pagination?.total}`);

  const byState = await get(`${BASE}/blood-banks?state=Maharashtra&limit=1`);
  ok('State filter works', byState.status === 200 && byState.body.pagination?.total > 0, `Maharashtra: ${byState.body.pagination?.total}`);

  const states = await get(`${BASE}/blood-banks/states`);
  ok('States endpoint', states.status === 200 && states.body.data?.length === 36, `${states.body.data?.length} states`);

  const districts = await get(`${BASE}/blood-banks/districts?state=Tamil+Nadu`);
  ok('Districts endpoint', districts.status === 200 && districts.body.data?.length > 0, `Tamil Nadu: ${districts.body.data?.length} districts`);

  const detail = await get(`${BASE}/blood-banks/1`);
  ok('Detail endpoint', detail.status === 200 && !!detail.body.data?.blood_bank_name, detail.body.data?.blood_bank_name);
  ok('Detail has source meta', detail.body.meta?.source === 'government_blood_bank_directory');
  ok('Detail has disclaimer', !!detail.body.meta?.disclaimer);

  const notFound = await get(`${BASE}/blood-banks/999999`);
  ok('404 for invalid ID', notFound.status === 404);

  const priv = await get(`${BASE}/blood-banks?category=Private&limit=1`);
  ok('Category filter works', priv.status === 200 && priv.body.pagination?.total > 0, `Private: ${priv.body.pagination?.total}`);

  // ── Existing Hospital Directory (unchanged) ───────────────────────────
  console.log('\n[HOSPITAL DIRECTORY — must be unchanged]');
  const hosp = await get(`${BASE}/hospitals?limit=1`);
  ok('Hospital directory responds', hosp.status === 200);
  ok('Hospital directory total = 30273', hosp.body.pagination?.total === 30273, `got ${hosp.body.pagination?.total}`);

  const hospStates = await get(`${BASE}/hospitals/states`);
  ok('Hospital states endpoint', hospStates.status === 200 && hospStates.body.data?.length === 36);

  // ── Authentication ────────────────────────────────────────
  console.log('\n[AUTHENTICATION]');
  const login = await post(`${BASE}/auth/login`, { email: 'yashoda@lifeshare.demo', password: 'password123' });
  ok('Login responds', login.status === 200, `status=${login.status}`);
  ok('Login returns token', !!login.body?.token);
  ok('Login returns hospital', login.body?.hospital?.name === 'Yashoda Hospital — Somajiguda', `name=${login.body?.hospital?.name}`);

  const token = login.body?.token;

  // ── Live Blood Table (must be UNCHANGED — 4 demo records) ─────────────
  console.log('\n[LIVE BLOOD TABLE — must be UNCHANGED]');
  const bloodRes = await get(`${BASE}/resources/blood`);
  ok('Blood endpoint responds', bloodRes.status === 200);
  ok('Blood has demo records intact', bloodRes.body?.length >= 2, `got ${bloodRes.body?.length}`);

  // Blood bank directory must NOT appear in live blood
  const bloodGroups = bloodRes.body?.map(b => b.blood_group) || [];
  ok('Live blood not contaminated with directory data', bloodRes.body?.length <= 10);

  // ── Organs ────────────────────────────────────────────────────────────
  console.log('\n[ORGANS — must be unchanged]');
  const organs = await get(`${BASE}/resources/organs`);
  ok('Organs endpoint responds', organs.status === 200);
  ok('Organs has demo data', (organs.body?.length || 0) > 0, `${organs.body?.length} organs`);

  // ── Equipment ─────────────────────────────────────────────────────────
  console.log('\n[EQUIPMENT — must be unchanged]');
  const equip = await get(`${BASE}/resources/equipment`);
  ok('Equipment endpoint responds', equip.status === 200);
  ok('Equipment has demo data', (equip.body?.length || 0) > 0, `${equip.body?.length} equipment`);

  // ── SQLite data integrity check ───────────────────────────────────────
  console.log('\n[DATABASE INTEGRITY]');
  const db = new sqlite3.Database(path.resolve(__dirname, '../lifeshare.db'), sqlite3.OPEN_READONLY);
  await new Promise(resolve => {
    db.serialize(() => {
      db.get('SELECT COUNT(*) as n FROM blood_bank_directory', (e, r) => {
        ok('blood_bank_directory has 2947 records', r?.n === 2947, `got ${r?.n}`);
      });
      db.get('SELECT COUNT(*) as n FROM blood', (e, r) => {
        ok('blood table has 4 records (unchanged)', r?.n === 4, `got ${r?.n}`);
      });
      db.get('SELECT COUNT(*) as n FROM hospital_directory', (e, r) => {
        ok('hospital_directory has 30273 records (unchanged)', r?.n === 30273, `got ${r?.n}`);
      });
      db.get('SELECT COUNT(*) as n FROM hospitals', (e, r) => {
        ok('hospitals (auth) table intact', r?.n >= 3, `got ${r?.n}`);
      });
      db.get("SELECT COUNT(*) as n FROM blood_bank_directory WHERE source = 'government_blood_bank_directory'", (e, r) => {
        ok('Source attribution correct', r?.n === 2947);
      });
      db.get('SELECT COUNT(*) as n FROM blood_bank_directory WHERE latitude IS NOT NULL', (e, r) => {
        ok('Coordinates parsed (898 expected)', r?.n === 898, `got ${r?.n}`);
      });
    });
    setTimeout(() => { db.close(); resolve(); }, 1000);
  });

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log('  ✅ ALL TESTS PASSED');
  else              console.log('  ❌ SOME TESTS FAILED — see above');
  console.log('═'.repeat(65));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
