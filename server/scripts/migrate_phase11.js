const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query } = require('../db');

async function migrate() {
  console.log('===================================================');
  console.log('  LIFE_SHARE — Migration Phase 11');
  console.log('  Add hospital_directory_id to hospitals table');
  console.log('===================================================\n');

  try {
    // 1. Add hospital_directory_id column to hospitals table (idempotent)
    await query(`
      ALTER TABLE hospitals
      ADD COLUMN IF NOT EXISTS hospital_directory_id INTEGER REFERENCES hospital_directory(id);
    `);
    console.log('✅ Added hospital_directory_id column to hospitals table.');

    // 2. Link existing authenticated demo accounts to exact Three Controlled Hospitals
    // ID 1 (City Central) -> 568 (Yashoda Hospital Somajiguda)
    // ID 2 (Grace Memorial) -> 564 (Apollo Hospitals Jubilee Hills)
    // ID 3 (Lifeline Wellness) -> 567 (Kamineni Hospital L.B. Nagar)
    
    await query(`UPDATE hospitals SET hospital_directory_id = 568, name = 'Yashoda Hospital — Somajiguda', email = 'yashoda@lifeshare.demo', city = 'Hyderabad' WHERE id = 1`);
    await query(`UPDATE hospitals SET hospital_directory_id = 564, name = 'Apollo Hospitals — Jubilee Hills', email = 'apollo@lifeshare.demo', city = 'Hyderabad' WHERE id = 2`);
    await query(`UPDATE hospitals SET hospital_directory_id = 567, name = 'Kamineni Hospital — L.B. Nagar', email = 'kamineni@lifeshare.demo', city = 'Hyderabad' WHERE id = 3`);

    console.log('✅ Linked authenticated demo hospital accounts:');
    console.log('   - Hospital ID 1 -> hospital_directory_id 568 (Yashoda Somajiguda)');
    console.log('   - Hospital ID 2 -> hospital_directory_id 564 (Apollo Jubilee Hills)');
    console.log('   - Hospital ID 3 -> hospital_directory_id 567 (Kamineni L.B. Nagar)');

    console.log('\n✅ Phase 11 Schema Migration Complete.\n');
  } catch (err) {
    console.error('❌ Migration Error:', err);
    process.exit(1);
  }
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
