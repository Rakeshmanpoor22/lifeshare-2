require('dotenv').config();
const { query, pool } = require('../db');

async function inspectHospitals() {
  try {
    const res = await query('SELECT id, name, email, city, state, hospital_directory_id FROM hospitals ORDER BY id ASC');
    console.log('CURRENT HOSPITALS IN DB:');
    console.log(JSON.stringify(res.rows, null, 2));

    const linkedRes = await query(`
      SELECT h.id, h.name as account_name, h.email, h.hospital_directory_id,
             hd.hospital_name as directory_name, hd.address, hd.town, hd.latitude, hd.longitude
      FROM hospitals h
      LEFT JOIN hospital_directory hd ON h.hospital_directory_id = hd.id
      ORDER BY h.id ASC
    `);
    console.log('\nLINKED DIRECTORY IDENTITIES:');
    console.log(JSON.stringify(linkedRes.rows, null, 2));

    if (pool && pool.end) await pool.end();
  } catch (err) {
    console.error(err);
    if (pool && pool.end) await pool.end();
  }
}

inspectHospitals();
