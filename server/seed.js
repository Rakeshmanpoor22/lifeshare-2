const { query, USE_SQLITE } = require('./db');
const bcrypt = require('bcryptjs');

const seed = async () => {
  try {
    if (!USE_SQLITE && process.env.ALLOW_PG_SEED !== 'true') {
      console.error('❌ SEED ABORTED: Running seed on PostgreSQL will wipe live data. To force, set ALLOW_PG_SEED=true.');
      process.exit(1);
    }
    console.log('Seeding LifeShare Demo Data...');

    // Clear Tables (SQLite doesn't support TRUNCATE CASCADE)
    // NOTE: hospital_directory and blood_bank_directory are intentionally EXCLUDED —
    // they hold static government reference datasets and must NOT be wiped by seed.
    if (USE_SQLITE) {
      // First, clear all tables except hospital_directory, blood_bank_directory, equipment_catalog, organ_catalog (static reference data)
      const tables = ['transactions', 'requests', 'blood', 'equipment', 'organs', 'audit_logs', 'notifications', 'hospitals'];
      for (const t of tables) await query(`DELETE FROM ${t}`);
      await query(`DELETE FROM sqlite_sequence WHERE name IN (${tables.map(t => `'${t}'`).join(',')})`).catch(() => {});
    } else {
      await query('TRUNCATE hospitals, organs, equipment, blood, requests, notifications, transactions, audit_logs CASCADE');
    }

    // 2. Hash Password
    const passwordHash = await bcrypt.hash('password123', 10);

    // 3. Create Hospitals
    const hospitals = [
      { name: 'Yashoda Hospital — Somajiguda', regId: 'REG001', city: 'Hyderabad', contact: '040-23456789', email: 'yashoda@lifeshare.demo', dirId: 568 },
      { name: 'Apollo Hospitals — Jubilee Hills', regId: 'REG002', city: 'Hyderabad', contact: '040-12345678', email: 'apollo@lifeshare.demo', dirId: 564 },
      { name: 'Kamineni Hospital — L.B. Nagar', regId: 'REG003', city: 'Hyderabad', contact: '040-99998888', email: 'kamineni@lifeshare.demo', dirId: 567 }
    ];

    const hospitalIds = [];
    for (const h of hospitals) {
      const res = await query(
        `INSERT INTO hospitals (name, registration_id, address, city, state, country, contact_number, email, organisation_size, owner_name, password_hash, hospital_directory_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [h.name, h.regId, 'Hospital Avenue', h.city, 'Telangana', 'India', h.contact, h.email, 'Large', 'Dr. Smith', passwordHash, h.dirId]
      );
      hospitalIds.push(res.rows[0].id);
    }

    // 4. Seed Organs
    const organs = [
      { hId: hospitalIds[0], type: 'Heart', bg: 'A+' },
      { hId: hospitalIds[0], type: 'Kidney', bg: 'O-' },
      { hId: hospitalIds[1], type: 'Liver', bg: 'AB+' },
      { hId: hospitalIds[2], type: 'Kidney', bg: 'B+' },
      { hId: hospitalIds[1], type: 'Lungs', bg: 'A-' },
      { hId: hospitalIds[2], type: 'Pancreas', bg: 'O+' },
      { hId: hospitalIds[0], type: 'Cornea', bg: 'Any' },
      { hId: hospitalIds[1], type: 'Heart', bg: 'B-' },
      { hId: hospitalIds[2], type: 'Liver', bg: 'A+' }
    ];

    for (const o of organs) {
      await query('INSERT INTO organs (hospital_id, type, blood_group) VALUES ($1, $2, $3)', [o.hId, o.type, o.bg]);
    }

    // 5. Seed Equipment
    const equipment = [
      { hId: hospitalIds[0], type: 'Ventilator', model: 'V-2000' },
      { hId: hospitalIds[1], type: 'ECMO Machine', model: 'EC-Mod' },
      { hId: hospitalIds[2], type: 'Centrifuge', model: 'Lab-C' }
    ];

    for (const e of equipment) {
      await query('INSERT INTO equipment (hospital_id, type, model) VALUES ($1, $2, $3)', [e.hId, e.type, e.model]);
    }

    // Seed Blood Units
    const bloodUnits = [
        { hId: hospitalIds[0], bg: 'A+', units: 10 },
        { hId: hospitalIds[1], bg: 'O+', units: 5 },
        { hId: hospitalIds[2], bg: 'B-', units: 15 },
        { hId: hospitalIds[2], bg: 'AB-', units: 2 }
    ];

    for (const b of bloodUnits) {
        await query('INSERT INTO blood (hospital_id, blood_group, units) VALUES ($1, $2, $3)', [b.hId, b.bg, b.units]);
    }

    // 6. Seed Requests (Requesting Hospital 1's resources)
    const organResult = await query('SELECT id FROM organs WHERE hospital_id = $1 LIMIT 1', [hospitalIds[0]]);
    const equipResult = await query('SELECT id FROM equipment WHERE hospital_id = $1 LIMIT 1', [hospitalIds[0]]);

    if (organResult.rows.length > 0) {
      await query(
        'INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, notes) VALUES ($1, $2, $3, $4, $5)',
        [hospitalIds[1], 'organ', organResult.rows[0].id, 'critical', 'Urgent heart transplant needed for patient']
      );
    }

    if (equipResult.rows.length > 0) {
      await query(
        'INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, notes) VALUES ($1, $2, $3, $4, $5)',
        [hospitalIds[2], 'equipment', equipResult.rows[0].id, 'medium', 'Need ventilator support']
      );
    }

    console.log('Seeding Completed Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding Failed:', err);
    process.exit(1);
  }
};

seed();
