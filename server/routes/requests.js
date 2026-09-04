const express = require('express');
const router = express.Router();
const { query, logAudit } = require('../db');
const auth = require('../middleware/auth');

// Create a resource request (Hospital Only)
router.post('/', auth, async (req, res) => {
  const { resource_type, target_resource_id, urgency, notes } = req.body;
  const hospitalId = req.hospital.id;

  try {
    const result = await query(
      'INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [hospitalId, resource_type, target_resource_id, urgency, notes]
    );

    const requestId = result.rows[0].id;
    await logAudit('Create Request', hospitalId, { resource_type, target_resource_id, urgency });

    // Matching Logic (Simple Demo Match)
    if (target_resource_id) {
      let resourceTable = 'organs';
      if (resource_type === 'equipment') resourceTable = 'equipment';
      if (resource_type === 'blood') resourceTable = 'blood';
      
      const donorResult = await query(`SELECT hospital_id FROM ${resourceTable} WHERE id = $1`, [target_resource_id]);

      if (donorResult.rows.length > 0) {
        const donorId = donorResult.rows[0].hospital_id;
        const io = req.app.get('io');
        const connectedHospitals = req.app.get('connectedHospitals');

        // Notification Message
        const message = `${req.hospital.name} has requested your ${resource_type} (ID: ${target_resource_id}) with ${urgency} urgency.`;

        // Store Notification in DB
        await query(
          'INSERT INTO notifications (hospital_id, message, type) VALUES ($1, $2, $3)',
          [donorId, message, 'match']
        );

        // Real-time Push
        const donorSocketId = connectedHospitals.get(donorId.toString());
        if (donorSocketId) {
          io.to(donorSocketId).emit('new_notification', { message, type: 'match', timestamp: new Date() });
        }
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Request Error:', err);
    res.status(500).json({ error: 'Failed to create request.' });
  }
});

// Get hospital's requests
router.get('/my', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  try {
    const result = await query(
      'SELECT r.* FROM requests r WHERE r.hospital_id = $1 ORDER BY r.created_at DESC',
      [hospitalId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch My Requests Error:', err);
    res.status(500).json({ error: 'Failed to fetch your requests.' });
  }
});

// Get incoming requests (for a donor hospital)
router.get('/incoming', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  try {
    // This is a bit more complex as we need to find requests where THE DONOR is the target hospital
    // For simplicity in this demo, we'll check requests that target one of our resources.
    const result = await query(`
      SELECT r.*, h.name as requester_name
      FROM requests r
      JOIN hospitals h ON r.hospital_id = h.id
      WHERE (
        (r.resource_type = 'organ' AND r.target_resource_id IN (SELECT id FROM organs WHERE hospital_id = $1))
        OR
        (r.resource_type = 'equipment' AND r.target_resource_id IN (SELECT id FROM equipment WHERE hospital_id = $1))
        OR
        (r.resource_type = 'blood' AND r.target_resource_id IN (SELECT id FROM blood WHERE hospital_id = $1))
      )
      ORDER BY r.created_at DESC
    `, [hospitalId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Incoming Requests Error:', err);
    res.status(500).json({ error: 'Failed to fetch incoming requests.' });
  }
});

// Accept a request
router.post('/:id/accept', auth, async (req, res) => {
  const requestId = req.params.id;
  const donorId = req.hospital.id;

  try {
    // 1. Transaction Start
    await query('BEGIN');

    const requestResult = await query(
      'SELECT * FROM requests WHERE id = $1 AND status = \'pending\'',
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found or already processed.' });
    }

    const request = requestResult.rows[0];

    // Check IDOR: ensure the donorId actually owns the requested resource
    let resourceTable = 'organs';
    if (request.resource_type === 'equipment') resourceTable = 'equipment';
    if (request.resource_type === 'blood') resourceTable = 'blood';

    const ownershipCheck = await query(
      `SELECT id FROM ${resourceTable} WHERE id = $1 AND hospital_id = $2`,
      [request.target_resource_id, donorId]
    );

    if (ownershipCheck.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized: You do not own the requested resource.' });
    }

    // 2. Log Transaction
    await query(
      `INSERT INTO transactions (request_id, donor_hospital_id, recipient_hospital_id, resource_type, resource_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, donorId, request.hospital_id, request.resource_type, request.target_resource_id]
    );

    // 3. Mark request as matched
    await query('UPDATE requests SET status = \'matched\' WHERE id = $1', [requestId]);

    // 4. Update resource status
    await query(`UPDATE ${resourceTable} SET status = 'reserved' WHERE id = $1`, [request.target_resource_id]);

    await query('COMMIT');

    // Notify Recipient
    const io = req.app.get('io');
    const connectedHospitals = req.app.get('connectedHospitals');
    const message = `Your request for ${request.resource_type} has been ACCEPTED by ${req.hospital.name}. Transaction logged.`;

    await query('INSERT INTO notifications (hospital_id, message, type) VALUES ($1, $2, $3)', [request.hospital_id, message, 'update']);
    const recipientSocketId = connectedHospitals.get(request.hospital_id.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('new_notification', { message, type: 'update', timestamp: new Date() });
    }

    await logAudit('Accept Request', donorId, { requestId });
    res.json({ message: 'Request accepted successfully.' });
  } catch (err) {
    await query('ROLLBACK');
    console.error('Accept Request Error:', err);
    res.status(500).json({ error: 'Failed to accept request.' });
  }
});

// Get specific request details (with hospital info)
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*, h.name as requester_name, h.email, h.contact_number, h.city, h.state
      FROM requests r
      JOIN hospitals h ON r.hospital_id = h.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch request details.' });
  }
});

// Get recent activities for the logged-in hospital
router.get('/history/all', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  try {
    // 1. Get all sent requests
    const sentRequests = await query(`
      SELECT 'request_sent' as activity_type, r.*, 
             COALESCE(o.type, e.type, b.blood_group) as resource_name
      FROM requests r
      LEFT JOIN organs o ON r.resource_type = 'organ' AND r.target_resource_id = o.id
      LEFT JOIN equipment e ON r.resource_type = 'equipment' AND r.target_resource_id = e.id
      LEFT JOIN blood b ON r.resource_type = 'blood' AND r.target_resource_id = b.id
      WHERE r.hospital_id = $1
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [hospitalId]);

    // 2. Get all transactions (as donor or recipient)
    const transactions = await query(`
      SELECT 'match_finalized' as activity_type, t.*, 
             dh.name as donor_name, rh.name as recipient_name
      FROM transactions t
      JOIN hospitals dh ON t.donor_hospital_id = dh.id
      JOIN hospitals rh ON t.recipient_hospital_id = rh.id
      WHERE t.donor_hospital_id = $1 OR t.recipient_hospital_id = $1
      ORDER BY t.timestamp DESC
      LIMIT 20
    `, [hospitalId]);

    // Combine and sort
    const unified = [...sentRequests.rows, ...transactions.rows]
      .sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

    res.json(unified);
  } catch (err) {
    console.error('History Fetch Error:', err);
    res.status(500).json({ error: 'Failed to fetch activity history.' });
  }
});

module.exports = router;
