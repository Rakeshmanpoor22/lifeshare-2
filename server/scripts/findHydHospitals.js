const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Connecting to PostgreSQL...');
  
  // The original 25 curated hospital IDs
  const original25Ids = [1, 2, 3, 4, 5, 17760, 13781, 13782, 13783, 11421, 9765, 9766, 9767, 3230, 3231, 3232, 3233, 12390, 12391, 12392, 12007, 6, 7, 9, 10];
  console.log('Original 25 curated hospital count:', original25Ids.length);

  const resOriginal = await pool.query(`SELECT id, hospital_name, district, state, latitude, longitude FROM hospital_directory WHERE id = ANY($1::int[])`, [original25Ids]);
  console.log('Found original hospitals in DB:', resOriginal.rows.length);

  // Search for hospitals strictly in Hyderabad with realistic Hyderabad / Telangana coordinates (Lat 16.8 - 17.8, Lng 78.0 - 78.8)
  const hydSql = `
    SELECT id, hospital_name, district, town, state, pincode, latitude, longitude 
    FROM hospital_directory 
    WHERE (district ILIKE '%hyderabad%' OR town ILIKE '%hyderabad%' OR address ILIKE '%hyderabad%')
      AND latitude BETWEEN 16.8 AND 17.8
      AND longitude BETWEEN 78.0 AND 78.8
      AND id NOT IN (${original25Ids.join(',')})
    ORDER BY id ASC
  `;

  const hydRes = await pool.query(hydSql);
  console.log('Found real Hyderabad hospitals with valid Hyderabad coordinates:', hydRes.rows.length);
  
  const selected25 = hydRes.rows.slice(0, 25);
  console.log('\n--- Selected 25 Hyderabad Hospitals ---');
  selected25.forEach((h, i) => {
    console.log(`${i+1}. ID: ${h.id} | Name: ${h.hospital_name.replace(/\n/g, ' ')} | Dist: ${h.district} | State: ${h.state} | Lat: ${h.latitude} | Lng: ${h.longitude}`);
  });

  const selected25Ids = selected25.map(h => h.id);
  console.log('\nSelected 25 IDs array:', JSON.stringify(selected25Ids));

  const total50Ids = [...original25Ids, ...selected25Ids];
  console.log('\nTotal 50 IDs array:', JSON.stringify(total50Ids));
  console.log('Total 50 count:', total50Ids.length);
  
  // Verify no duplicates
  const uniqueCount = new Set(total50Ids).size;
  console.log('Unique ID count:', uniqueCount);

  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
