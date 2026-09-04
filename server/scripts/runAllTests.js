const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const testFiles = fs.readdirSync(scriptsDir).filter(f => f.startsWith('test') && f.endsWith('.js'));

console.log('Running test suites:', testFiles.length, 'files\n');
let passed = 0, failed = 0;

for (const file of testFiles) {
  const filePath = path.join(scriptsDir, file);
  try {
    process.stdout.write(`Running ${file}... `);
    const out = execSync(`node "${filePath}"`, { encoding: 'utf8', env: process.env });
    console.log('✅ PASSED');
    passed++;
  } catch (err) {
    console.log('❌ FAILED');
    console.error(err.stdout || err.message);
    failed++;
  }
}

console.log(`\n========================================`);
console.log(`Test Suites Total: ${testFiles.length} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) process.exit(1);
