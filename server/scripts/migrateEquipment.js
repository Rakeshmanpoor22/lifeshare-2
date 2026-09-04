/**
 * LIFE_SHARE — Phase 4 Medical Equipment Migration & Seeding
 *
 * 1. Creates `equipment_catalog` table.
 * 2. Adds `condition` column to `equipment` table (if not exists).
 * 3. Seeds the `equipment_catalog` idempotently.
 */
'use strict';

const { query } = require('../db');

const catalogData = [
  { category: 'Critical Care', type: 'Ventilator', description: 'Provides mechanical ventilation.' },
  { category: 'Critical Care', type: 'ECMO Machine', description: 'Extracorporeal membrane oxygenation.' },
  { category: 'Critical Care', type: 'ICU Monitor', description: 'Continuous patient monitoring system.' },
  { category: 'Respiratory', type: 'Oxygen Concentrator', description: 'Extracts oxygen from ambient air.' },
  { category: 'Respiratory', type: 'CPAP/BiPAP Machine', description: 'Continuous positive airway pressure therapy.' },
  { category: 'Renal', type: 'Dialysis Machine', description: 'Filters patient blood to remove excess water and waste.' },
  { category: 'Emergency', type: 'Infusion Pump', description: 'Infuses fluids, medication or nutrients.' },
  { category: 'Emergency', type: 'Syringe Pump', description: 'Delivers precise amounts of fluid.' },
  { category: 'Emergency', type: 'Defibrillator', description: 'Applies electrical therapy to the heart.' },
  { category: 'Diagnostic', type: 'ECG Machine', description: 'Records electrical activity of the heart.' },
  { category: 'Diagnostic', type: 'Ultrasound Machine', description: 'Uses high-frequency sound waves for imaging.' },
  { category: 'Diagnostic', type: 'Portable X-Ray', description: 'Mobile X-ray machine.' },
  { category: 'Diagnostic', type: 'Patient Monitor', description: 'Measures patient vital signs.' },
  { category: 'Surgical', type: 'Anesthesia Machine', description: 'Provides medical gases and anesthetic agents.' },
  { category: 'Surgical', type: 'Operating Table', description: 'Table on which patient lies during a surgical operation.' }
];

async function migrate() {
  console.log('--- Starting Medical Equipment Migration ---');
  const { USE_SQLITE } = require('../db');

  try {
    // 1. Create equipment_catalog table
    if (USE_SQLITE) {
      await query(`
        CREATE TABLE IF NOT EXISTS equipment_catalog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          type TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await query(`
        CREATE TABLE IF NOT EXISTS equipment_catalog (
          id SERIAL PRIMARY KEY,
          category TEXT NOT NULL,
          type TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    console.log('✅ equipment_catalog table ready.');

    // 2. Add condition to equipment table
    try {
      if (USE_SQLITE) {
        // SQLite doesn't easily support IF NOT EXISTS for columns, catch error if exists
        await query(`ALTER TABLE equipment ADD COLUMN condition TEXT DEFAULT 'good'`);
      } else {
        await query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'good'`);
      }
      console.log('✅ Added condition column to equipment.');
    } catch (err) {
      if (err.message.includes('duplicate column name') || err.message.includes('already exists')) {
        console.log('✅ condition column already exists.');
      } else {
        throw err;
      }
    }

    // 3. Seed Catalog
    let inserted = 0;
    for (const item of catalogData) {
      const q = USE_SQLITE
        ? `INSERT OR IGNORE INTO equipment_catalog (category, type, description) VALUES (?, ?, ?)`
        : `INSERT INTO equipment_catalog (category, type, description) VALUES ($1, $2, $3) ON CONFLICT (type) DO NOTHING`;
      
      const res = await query(q, [item.category, item.type, item.description]);
      
      if (USE_SQLITE) {
        if (res.lastID && res.changes > 0) inserted++;
      } else {
        if (res.rowCount > 0) inserted++;
      }
    }
    console.log(`✅ Seeded equipment_catalog. Inserted ${inserted} new records (Total catalog size: ${catalogData.length}).`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate().then(() => {
  console.log('--- Medical Equipment Migration Complete ---');
  process.exit(0);
});
