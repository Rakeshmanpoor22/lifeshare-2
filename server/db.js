const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const USE_SQLITE = process.env.USE_SQLITE === 'true';
let db;

if (USE_SQLITE) {
  console.log('Using SQLite for local development...');
  db = new sqlite3.Database(process.env.SQLITE_PATH || './lifeshare.db');
} else {
  const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;
  if (dbUrl) {
    const activeVar = process.env.DATABASE_URL ? 'DATABASE_URL' : 'DB_URL';
    console.log(`[DB Config] PostgreSQL connection configured using environment variable: ${activeVar}`);
  } else {
    console.error('[DB Config Error] USE_SQLITE is false, but neither DATABASE_URL nor DB_URL is defined in environment variables!');
  }

  const isLocalDb = (dbUrl || '').includes('localhost') || (dbUrl || '').includes('127.0.0.1');
  db = new Pool({
    connectionString: dbUrl || 'postgresql://postgres:postgres@localhost:5432/lifeshare',
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

// Normalize Query Interface
const query = (text, params = []) => {
  if (USE_SQLITE) {
    // Replace $1, $2... with ? for SQLite
    const normalizedText = text.replace(/\$\d+/g, '?');
    return new Promise((resolve, reject) => {
      // Use .all for SELECT and queries with RETURNING, .run for other INSERT/UPDATE/DELETE
      let method = 'run';
      const trimmedText = normalizedText.trim().toLowerCase();
      if (trimmedText.startsWith('select') || trimmedText.includes('returning')) {
        method = 'all';
      }
      
      db[method](normalizedText, params, function(err, rows) {
        if (err) return reject(err);
        // Normalize result to match pg: { rows: [] }
        resolve({ rows: rows || [], lastID: this ? this.lastID : null, changes: this ? this.changes : null });
      });
    });
  } else {
    return db.query(text, params);
  }
};

const logAudit = async (action, hospitalId, details = {}) => {
  try {
    await query(
      'INSERT INTO audit_logs (action, hospital_id, details) VALUES ($1, $2, $3)',
      [action, hospitalId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};

module.exports = {
  query,
  pool: !USE_SQLITE ? db : null,
  logAudit,
  USE_SQLITE
};

