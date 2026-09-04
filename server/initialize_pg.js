const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;
const isLocalDb = (dbUrl || '').includes('localhost') || (dbUrl || '').includes('127.0.0.1');

const db = new Pool({
  connectionString: dbUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

const schema = `
CREATE TABLE IF NOT EXISTS hospitals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    registration_id TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT NOT NULL,
    contact_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    organisation_size TEXT,
    owner_name TEXT NOT NULL,
    license_number TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    hospital_directory_id INTEGER REFERENCES hospital_directory(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organs (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    blood_group TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    model TEXT,
    status TEXT DEFAULT 'available',
    condition TEXT DEFAULT 'good',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blood (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL,
    units INTEGER NOT NULL,
    status TEXT DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    target_resource_id INTEGER,
    urgency TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment_catalog (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    type TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organ_catalog (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES requests(id),
    donor_hospital_id INTEGER REFERENCES hospitals(id),
    recipient_hospital_id INTEGER REFERENCES hospitals(id),
    resource_type TEXT NOT NULL,
    resource_id INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT,
    read_status BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    hospital_id INTEGER REFERENCES hospitals(id),
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Government hospital reference dataset (static, separate from auth hospitals table)
CREATE TABLE IF NOT EXISTS hospital_directory (
    id                    SERIAL PRIMARY KEY,
    source_record_id      INTEGER  UNIQUE,
    hospital_name         TEXT     NOT NULL,
    hospital_category     TEXT,
    hospital_care_type    TEXT,
    medical_system        TEXT,
    address               TEXT,
    location_desc         TEXT,
    state                 TEXT,
    state_id              INTEGER,
    district              TEXT,
    district_id           INTEGER,
    subdistrict           TEXT,
    town                  TEXT,
    pincode               TEXT,
    latitude              REAL,
    longitude             REAL,
    telephone             TEXT,
    mobile                TEXT,
    emergency_phone       TEXT,
    ambulance_phone       TEXT,
    bloodbank_phone       TEXT,
    email                 TEXT,
    website               TEXT,
    specialties           TEXT,
    facilities            TEXT,
    total_beds            BIGINT,
    emergency_services    TEXT,
    accreditation         TEXT,
    hospital_reg_number   TEXT,
    established_year      BIGINT,
    number_doctors        BIGINT,
    source                TEXT DEFAULT 'government_dataset',
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hd_state      ON hospital_directory(state);
CREATE INDEX IF NOT EXISTS idx_hd_district   ON hospital_directory(district);
CREATE INDEX IF NOT EXISTS idx_hd_pincode    ON hospital_directory(pincode);
CREATE INDEX IF NOT EXISTS idx_hd_name       ON hospital_directory(hospital_name);
CREATE INDEX IF NOT EXISTS idx_hd_category   ON hospital_directory(hospital_category);
CREATE INDEX IF NOT EXISTS idx_hd_state_dist ON hospital_directory(state, district);

-- Government blood bank reference dataset (static, separate from live blood table)
CREATE TABLE IF NOT EXISTS blood_bank_directory (
    id                    SERIAL PRIMARY KEY,
    source_record_id      INTEGER  UNIQUE,
    blood_bank_name       TEXT     NOT NULL,
    address               TEXT,
    city                  TEXT,
    district              TEXT,
    state                 TEXT,
    pincode               TEXT,
    contact               TEXT,
    category              TEXT,
    website               TEXT,
    email                 TEXT,
    blood_component       TEXT,
    blood_groups_ref      TEXT,
    service_time          TEXT,
    latitude              REAL,
    longitude             REAL,
    hospital_directory_id INTEGER REFERENCES hospital_directory(id),
    source                TEXT DEFAULT 'government_blood_bank_directory',
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bbd_state      ON blood_bank_directory(state);
CREATE INDEX IF NOT EXISTS idx_bbd_district   ON blood_bank_directory(district);
CREATE INDEX IF NOT EXISTS idx_bbd_city       ON blood_bank_directory(city);
CREATE INDEX IF NOT EXISTS idx_bbd_pincode    ON blood_bank_directory(pincode);
CREATE INDEX IF NOT EXISTS idx_bbd_name       ON blood_bank_directory(blood_bank_name);
CREATE INDEX IF NOT EXISTS idx_bbd_state_dist ON blood_bank_directory(state, district);
`;

async function run() {
  console.log('Connecting to PostgreSQL using DATABASE_URL...');
  try {
    await db.query(schema);
    console.log('PostgreSQL Database Initialized Successfully!');
  } catch (err) {
    console.error('PostgreSQL Schema Error:', err);
  } finally {
    db.end();
  }
}

run();
