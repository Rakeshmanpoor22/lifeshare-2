const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lifeshare.db', sqlite3.OPEN_READONLY);
db.all("SELECT * FROM hospital_directory WHERE source_record_id > 2147483647 OR state_id > 2147483647 OR district_id > 2147483647 OR total_beds > 2147483647 OR established_year > 2147483647 OR number_doctors > 2147483647 LIMIT 1", (err, rows) => {
  if (err) console.error(err);
  console.log(rows);
  db.close();
});
