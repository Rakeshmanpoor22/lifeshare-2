const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { query, pool } = require('../db');

async function migrate() {
  console.log('===================================================');
  console.log('  LIFE_SHARE — Migration Phase 11.1');
  console.log('  Update Demo Accounts with Clear Demo Emails');
  console.log('===================================================\n');

  try {
    // Update existing demo hospital accounts to clear demo emails while preserving IDs, passwords, & directory links
    await query(`UPDATE hospitals SET name = 'Yashoda Hospital — Somajiguda', email = 'yashoda@lifeshare.demo', hospital_directory_id = 568, city = 'Hyderabad' WHERE id = 1`);
    await query(`UPDATE hospitals SET name = 'Apollo Hospitals — Jubilee Hills', email = 'apollo@lifeshare.demo', hospital_directory_id = 564, city = 'Hyderabad' WHERE id = 2`);
    await query(`UPDATE hospitals SET name = 'Kamineni Hospital — L.B. Nagar', email = 'kamineni@lifeshare.demo', hospital_directory_id = 567, city = 'Hyderabad' WHERE id = 3`);

    console.log('✅ Updated authenticated demo hospital accounts:');
    console.log('   - Hospital ID 1 -> yashoda@lifeshare.demo (Yashoda Somajiguda, Dir ID 568)');
    console.log('   - Hospital ID 2 -> apollo@lifeshare.demo (Apollo Jubilee Hills, Dir ID 564)');
    console.log('   - Hospital ID 3 -> kamineni@lifeshare.demo (Kamineni L.B. Nagar, Dir ID 567)');

    if (pool && pool.end) await pool.end();
    console.log('\n✅ Phase 11.1 Demo Identity Migration Complete.\n');
  } catch (err) {
    console.error('❌ Migration Error:', err);
    if (pool && pool.end) await pool.end();
    process.exit(1);
  }
}

migrate();
