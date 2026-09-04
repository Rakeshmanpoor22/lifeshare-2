/**
 * LIFE_SHARE — Phase 5 Organ Integration Migration & Seeding
 *
 * 1. Creates `organ_catalog` table.
 * 2. Seeds the `organ_catalog` idempotently.
 */
'use strict';

const { query } = require('../db');

const catalogData = [
  { type: 'Kidney', category: 'Solid Organ' },
  { type: 'Liver', category: 'Solid Organ' },
  { type: 'Heart', category: 'Solid Organ' },
  { type: 'Lungs', category: 'Solid Organ' },
  { type: 'Pancreas', category: 'Solid Organ' },
  { type: 'Intestine', category: 'Solid Organ' },
  { type: 'Cornea', category: 'Tissue' },
  { type: 'Bone Marrow', category: 'Tissue' },
  { type: 'Skin', category: 'Tissue' }
];

async function migrate() {
  console.log('--- Starting Organ Integration Migration ---');
  const { USE_SQLITE } = require('../db');

  try {
    // 1. Create organ_catalog table
    if (USE_SQLITE) {
      await query(`
        CREATE TABLE IF NOT EXISTS organ_catalog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await query(`
        CREATE TABLE IF NOT EXISTS organ_catalog (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    console.log('✅ organ_catalog table ready.');

    // 2. Seed Catalog
    let inserted = 0;
    for (const item of catalogData) {
      const q = USE_SQLITE
        ? `INSERT OR IGNORE INTO organ_catalog (type, category) VALUES (?, ?)`
        : `INSERT INTO organ_catalog (type, category) VALUES ($1, $2) ON CONFLICT (type) DO NOTHING`;
      
      const res = await query(q, [item.type, item.category]);
      
      if (USE_SQLITE) {
        if (res.lastID && res.changes > 0) inserted++;
      } else {
        if (res.rowCount > 0) inserted++;
      }
    }
    console.log(`✅ Seeded organ_catalog. Inserted ${inserted} new records (Total catalog size: ${catalogData.length}).`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate().then(() => {
  console.log('--- Organ Integration Migration Complete ---');
  process.exit(0);
});
