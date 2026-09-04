const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Creating appointments table for Phase 9.1...');
    
    // Using a session_token (UUID) to secure patient access without full user accounts
    await db.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        blood_bank_directory_id INTEGER NOT NULL REFERENCES blood_bank_directory(id),
        patient_name TEXT NOT NULL,
        patient_phone TEXT NOT NULL,
        patient_blood_group TEXT,
        appointment_date TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'scheduled',
        session_token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add index for fast lookup by session_token
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_session 
      ON appointments(session_token)
    `);

    console.log('Appointments table created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    db.end();
  }
}

migrate();
