const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Creating tracking_sessions table for Phase 9.2...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS tracking_sessions (
        id SERIAL PRIMARY KEY,
        reference_id INTEGER NOT NULL,
        reference_type TEXT NOT NULL, -- 'organ_transfer' or 'blood_appointment'
        status TEXT NOT NULL DEFAULT 'initiated', -- 'initiated', 'in_transit', 'arrived', 'completed', 'cancelled'
        current_latitude REAL,
        current_longitude REAL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add indexes for fast lookup
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tracking_reference 
      ON tracking_sessions(reference_type, reference_id)
    `);

    console.log('tracking_sessions table created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    db.end();
  }
}

migrate();
