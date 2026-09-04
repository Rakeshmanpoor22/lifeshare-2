require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    console.log('Adding performance indexes...');
    
    const queries = [
      'CREATE INDEX IF NOT EXISTS idx_organs_hospital_id ON organs(hospital_id);',
      'CREATE INDEX IF NOT EXISTS idx_organs_status ON organs(status);',
      'CREATE INDEX IF NOT EXISTS idx_organs_type ON organs(type);',
      
      'CREATE INDEX IF NOT EXISTS idx_equipment_hospital_id ON equipment(hospital_id);',
      'CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);',
      'CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type);',
      
      'CREATE INDEX IF NOT EXISTS idx_blood_hospital_id ON blood(hospital_id);',
      'CREATE INDEX IF NOT EXISTS idx_blood_status ON blood(status);',
      
      'CREATE INDEX IF NOT EXISTS idx_requests_hospital_id ON requests(hospital_id);',
      'CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);',
      'CREATE INDEX IF NOT EXISTS idx_requests_resource_type ON requests(resource_type);',
    ];

    for (let q of queries) {
      await db.query(q);
    }
    
    console.log('Indexes added successfully.');
  } catch(e) {
    console.error('Error adding indexes:', e);
  } finally {
    db.end();
  }
}

run();
