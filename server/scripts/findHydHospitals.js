const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const tables = ['hospitals', 'hospital_directory', 'organs', 'requests', 'transactions', 'tracking_sessions'];
  for (const t of tables) {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `, [t]);
    console.log(`=== TABLE: ${t} ===`);
    console.log(cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
  }
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

run().catch(err => {
  console.error(err);
  process.exit(1);
});
