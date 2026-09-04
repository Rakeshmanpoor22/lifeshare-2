const { Pool } = require('pg');
require('dotenv').config();
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function getDemoIds() {
  const states = ['Maharashtra', 'Karnataka', 'Tamil Nadu', 'Delhi', 'Uttar Pradesh', 'Gujarat', 'West Bengal', 'Kerala', 'Telangana', 'Andhra Pradesh'];
  const hospitalIds = [];
  const bloodBankIds = [];
  
  for (const s of states) {
    const hQuery = await db.query("SELECT id FROM hospital_directory WHERE state = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 4", [s]);
    hospitalIds.push(...hQuery.rows.map(r => r.id));
    
    const bQuery = await db.query("SELECT id FROM blood_bank_directory WHERE state = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1", [s]);
    bloodBankIds.push(...bQuery.rows.map(r => r.id));
  }
  
  console.log('Hospital IDs:', hospitalIds.join(', '));
  console.log('Blood Bank IDs:', bloodBankIds.join(', '));
  db.end();
}
getDemoIds().catch(console.error);
