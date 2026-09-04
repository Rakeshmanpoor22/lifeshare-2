const fs = require('fs');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lifeshare.db', sqlite3.OPEN_READONLY);

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, tables) => {
    if(err) return console.log(err);
    console.log('\n--- SCHEMAS & COUNTS ---');
    tables.forEach(t => {
      db.all(`PRAGMA table_info('${t.name}')`, (err, cols) => {
        db.get(`SELECT COUNT(*) as c FROM '${t.name}'`, (err, count) => {
          console.log(`\nTable: ${t.name} (Rows: ${count.c})`);
          cols.forEach(c => console.log(`  - ${c.name} [${c.type}] PK:${c.pk} DFLT:${c.dflt_value}`));
        });
      });
    });
  });
});
setTimeout(() => db.close(), 1000);
