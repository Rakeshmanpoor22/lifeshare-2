const express = require('express');
const router = express.Router();
const { query } = require('../db');
const crypto = require('crypto');

// POST /api/appointments
router.post('/', async (req, res) => {
  const { blood_bank_directory_id, patient_name, patient_phone, patient_blood_group, appointment_date } = req.body;

  if (!blood_bank_directory_id || !patient_name || !patient_phone || !appointment_date) {
    return res.status(400).json({ error: 'Missing required appointment fields.' });
  }

  try {
    // 1. Validate Blood Bank Exists (IDOR / Foreign Key check essentially, but good to give clean error)
    const bbCheck = await query('SELECT id FROM blood_bank_directory WHERE id = $1', [blood_bank_directory_id]);
    if (bbCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Selected Blood Bank not found in directory.' });
    }

    // 2. Validate Date
    const apptDate = new Date(appointment_date);
    if (isNaN(apptDate.getTime()) || apptDate < new Date()) {
      return res.status(400).json({ error: 'Invalid or past appointment date.' });
    }

    // 3. Generate secure session token (since we don't have patient auth)
    const sessionToken = crypto.randomUUID();

    // 4. Insert Appointment
    const result = await query(
      `INSERT INTO appointments (
        blood_bank_directory_id, patient_name, patient_phone, patient_blood_group, appointment_date, session_token
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, session_token`,
      [blood_bank_directory_id, patient_name, patient_phone, patient_blood_group, apptDate, sessionToken]
    );

    res.status(201).json({
      message: 'Booking request confirmed.',
      appointment: result.rows[0],
      disclaimer: 'This is a LIFE_SHARE operational booking request. Slot availability is not guaranteed in real-time by the static directory.'
    });

  } catch (err) {
    console.error('Appointment Creation Error:', err);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// GET /api/appointments/my
router.get('/my', async (req, res) => {
  // Use authorization header for session token since patients don't have JWTs
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Session ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid session token.' });
  }

  const sessionToken = authHeader.replace('Session ', '').trim();

  try {
    const result = await query(`
      SELECT a.*, b.blood_bank_name, b.address, b.city, b.district, b.state, b.pincode, b.contact, b.latitude, b.longitude 
      FROM appointments a
      JOIN blood_bank_directory b ON a.blood_bank_directory_id = b.id
      WHERE a.session_token = $1
      ORDER BY a.appointment_date DESC
    `, [sessionToken]);

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Appointments Error:', err);
    res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Session ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid session token.' });
  }

  const sessionToken = authHeader.replace('Session ', '').trim();
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid appointment ID.' });
  }

  try {
    const result = await query(`
      SELECT a.*, b.blood_bank_name, b.address, b.city, b.district, b.state, b.pincode, b.contact, b.latitude, b.longitude 
      FROM appointments a
      JOIN blood_bank_directory b ON a.blood_bank_directory_id = b.id
      WHERE a.id = $1 AND a.session_token = $2
    `, [id, sessionToken]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found or unauthorized.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch Single Appointment Error:', err);
    res.status(500).json({ error: 'Failed to fetch appointment details.' });
  }
});

module.exports = router;
