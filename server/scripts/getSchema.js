const { Pool } = require('pg');
require('dotenv').config();
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function getSchema() {
  const tables = ['requests', 'transactions', 'notifications', 'hospitals', 'hospital_directory', 'blood_bank_directory', 'organs', 'blood', 'equipment', 'appointments', 'tracking_sessions'];
  for (const t of tables) {
    const res = await db.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', [t]);
    console.log(`\nTable: ${t}`);
    if (res.rows.length === 0) console.log('  (Table does not exist)');
    else res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  }
  db.end();
}
getSchema().catch(console.error);
