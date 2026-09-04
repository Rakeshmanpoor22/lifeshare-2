const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkRequestsTable() {
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'requests'
    ORDER BY ordinal_position
  `);
  console.log('PostgreSQL requests table columns:');
  cols.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));

  const sample = await pool.query('SELECT * FROM requests ORDER BY id DESC LIMIT 5');
  console.log('\nSample request rows:', JSON.stringify(sample.rows, null, 2));

  await pool.end();
}

checkRequestsTable().catch(err => {
  console.error(err);
  process.exit(1);
});
