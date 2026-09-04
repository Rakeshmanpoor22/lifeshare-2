const { Pool } = require('pg');
require('dotenv').config();
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verify() {
  const currentHospitalIds = [1, 2, 3, 4, 5, 17760, 13781, 13782, 13783, 11421, 9765, 9766, 9767, 3230, 3231, 3232, 3233, 12390, 12391, 12392, 12007, 6, 7, 9, 10];
  const currentHospitals = await db.query('SELECT id, hospital_name, district, town, state FROM hospital_directory WHERE id = ANY($1::int[])', [currentHospitalIds]);
  
  const hydHospitals = currentHospitals.rows.filter(h => h.district === 'Hyderabad' || h.town === 'Hyderabad');
  console.log('Current Hyderabad Hospitals:', hydHospitals.length);
  
  const newHydHosp = await db.query("SELECT id, hospital_name, district, town, state, latitude, longitude FROM hospital_directory WHERE (district ILIKE '%Hyderabad%' OR town ILIKE '%Hyderabad%') AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 10");
  console.log('Found new Hyderabad Hospitals:', JSON.stringify(newHydHosp.rows, null, 2));

  const currentBloodBankIds = [1, 1356, 841, 2035, 425, 2629, 482, 2826, 1051, 2376, 12];
  const currentBBs = await db.query('SELECT id, blood_bank_name, district, city, state FROM blood_bank_directory WHERE id = ANY($1::int[])', [currentBloodBankIds]);
  
  const hydBBs = currentBBs.rows.filter(b => b.district === 'Hyderabad' || b.city === 'Hyderabad');
  console.log('Current Hyderabad Blood Banks:', hydBBs.length);

  const newHydBB = await db.query("SELECT id, blood_bank_name, district, city, state, latitude, longitude FROM blood_bank_directory WHERE (district ILIKE '%Hyderabad%' OR city ILIKE '%Hyderabad%') AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 5");
  console.log('Found new Hyderabad Blood Banks:', JSON.stringify(newHydBB.rows, null, 2));

  db.end();
}
verify().catch(console.error);
