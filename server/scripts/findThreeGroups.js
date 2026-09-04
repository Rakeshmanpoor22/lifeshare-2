const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Searching hospital_directory for Apollo, Yashoda, Kamineni...\n');

  const sql = `
    SELECT id, hospital_name, address, town, district, state, latitude, longitude 
    FROM hospital_directory 
    WHERE (hospital_name ILIKE '%Apollo%' OR hospital_name ILIKE '%Yashoda%' OR hospital_name ILIKE '%Kamineni%')
    ORDER BY hospital_name ASC, id ASC
  `;

  const res = await pool.query(sql);
  console.log(`Total matching records found: ${res.rows.length}\n`);

  const apollo = [];
  const yashoda = [];
  const kamineni = [];

  res.rows.forEach(h => {
    const name = h.hospital_name.trim();
    const item = {
      id: h.id,
      name: name,
      address: (h.address || '').trim(),
      town: h.town,
      district: h.district,
      state: h.state,
      latitude: h.latitude,
      longitude: h.longitude,
      has_coords: h.latitude !== null && h.longitude !== null
    };

    if (name.toLowerCase().includes('apollo')) apollo.push(item);
    else if (name.toLowerCase().includes('yashoda')) yashoda.push(item);
    else if (name.toLowerCase().includes('kamineni')) kamineni.push(item);
  });

  console.log('================ APOLLO HOSPITALS ================');
  console.log(JSON.stringify(apollo.filter(x => x.has_coords && (x.state === 'Telangana' || x.state === 'Andhra Pradesh' || x.district === 'Hyderabad')), null, 2));

  console.log('\n================ YASHODA HOSPITALS ================');
  console.log(JSON.stringify(yashoda.filter(x => x.has_coords && (x.state === 'Telangana' || x.state === 'Andhra Pradesh' || x.district === 'Hyderabad')), null, 2));

  console.log('\n================ KAMINENI HOSPITALS ================');
  console.log(JSON.stringify(kamineni.filter(x => x.has_coords || (x.state === 'Telangana' || x.state === 'Andhra Pradesh' || x.district === 'Hyderabad')), null, 2));

  await pool.end();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
