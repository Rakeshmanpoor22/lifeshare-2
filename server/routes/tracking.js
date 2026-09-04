const express = require('express');
const router = express.Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');

// Helper to authenticate user (either hospital via JWT or patient via Session)
// Returns { type: 'hospital', id: hospitalId } OR { type: 'patient', sessionToken: token }
async function resolveIdentity(req) {
  const authHeader = req.header('Authorization');
  if (!authHeader) return null;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'lifeshare_secret_key');
      return { type: 'hospital', id: decoded.id };
    } catch (e) {
      return null;
    }
  }

  if (authHeader.startsWith('Session ')) {
    return { type: 'patient', sessionToken: authHeader.replace('Session ', '').trim() };
  }

  return null;
}

// Helper to authorize tracking access
async function authorizeTrackingAccess(identity, reference_type, reference_id) {
  if (!identity) return false;

  if (reference_type === 'organ_transfer') {
    if (identity.type !== 'hospital') return false;
    // Check if the hospital is the donor or recipient in the transaction for this request
    const transRes = await query(
      'SELECT id FROM transactions WHERE request_id = $1 AND (donor_hospital_id = $2 OR recipient_hospital_id = $2)',
      [reference_id, identity.id]
    );
    return transRes.rows.length > 0;
  } 

  if (reference_type === 'blood_appointment') {
    if (identity.type !== 'patient') return false;
    // Check if appointment belongs to session
    const apptRes = await query(
      'SELECT id FROM appointments WHERE id = $1 AND session_token = $2',
      [reference_id, identity.sessionToken]
    );
    return apptRes.rows.length > 0;
  }

  return false;
}

// POST /api/tracking/start
router.post('/start', async (req, res) => {
  const { reference_type, reference_id } = req.body;
  if (!reference_type || !reference_id) {
    return res.status(400).json({ error: 'Missing reference_type or reference_id.' });
  }

  const identity = await resolveIdentity(req);
  if (!identity) return res.status(401).json({ error: 'Unauthorized.' });

  const isAuth = await authorizeTrackingAccess(identity, reference_type, reference_id);
  if (!isAuth) return res.status(403).json({ error: 'Forbidden: You do not have access to this transfer/appointment.' });

  try {
    // Check if one already exists and is active
    const existing = await query(
      `SELECT * FROM tracking_sessions WHERE reference_type = $1 AND reference_id = $2 AND status IN ('initiated', 'in_transit')`,
      [reference_type, reference_id]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    const result = await query(
      `INSERT INTO tracking_sessions (reference_type, reference_id, status) VALUES ($1, $2, 'initiated') RETURNING *`,
      [reference_type, reference_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Tracking Start Error:', err);
    res.status(500).json({ error: 'Failed to start tracking.' });
  }
});

// GET /api/tracking/reference/:reference_type/:reference_id
// IMPORTANT: must be declared BEFORE GET /:id to prevent 'reference' being caught by wildcard
router.get('/reference/:reference_type/:reference_id', async (req, res) => {
  const { reference_type } = req.params;
  const reference_id = parseInt(req.params.reference_id, 10);

  if (!reference_type) {
    return res.status(400).json({ error: 'Missing reference_type.' });
  }
  if (isNaN(reference_id) || reference_id <= 0) {
    return res.status(400).json({ error: 'Invalid reference_id: must be a positive integer.' });
  }

  try {
    const sessionRes = await query(
      `SELECT * FROM tracking_sessions WHERE reference_type = $1 AND reference_id = $2 ORDER BY started_at DESC LIMIT 1`,
      [reference_type, reference_id]
    );

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tracking session not found for this reference.' });
    }
    
    const session = sessionRes.rows[0];

    const identity = await resolveIdentity(req);
    const isAuth = await authorizeTrackingAccess(identity, session.reference_type, session.reference_id);
    if (!isAuth) return res.status(403).json({ error: 'Forbidden.' });

    res.json(session);
  } catch (err) {
    console.error('Tracking Reference GET Error:', err);
    res.status(500).json({ error: 'Failed to fetch tracking session.' });
  }
});

// GET /api/tracking/:id
router.get('/:id', async (req, res) => {
  try {
    const sessionRes = await query('SELECT * FROM tracking_sessions WHERE id = $1', [req.params.id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Tracking session not found.' });
    
    const session = sessionRes.rows[0];

    const identity = await resolveIdentity(req);
    const isAuth = await authorizeTrackingAccess(identity, session.reference_type, session.reference_id);
    if (!isAuth) return res.status(403).json({ error: 'Forbidden.' });

    res.json(session);
  } catch (err) {
    console.error('Tracking GET Error:', err);
    res.status(500).json({ error: 'Failed to fetch tracking session.' });
  }
});

// POST /api/tracking/:id/location
router.post('/:id/location', async (req, res) => {
  const { latitude, longitude, status } = req.body;

  // Validate coordinates
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid latitude or longitude.' });
  }

  try {
    const sessionRes = await query('SELECT * FROM tracking_sessions WHERE id = $1', [req.params.id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Tracking session not found.' });
    
    const session = sessionRes.rows[0];

    // Reject updates to completed/cancelled sessions
    if (session.status === 'completed' || session.status === 'cancelled') {
      return res.status(400).json({ error: 'Tracking session is no longer active.' });
    }

    const identity = await resolveIdentity(req);
    const isAuth = await authorizeTrackingAccess(identity, session.reference_type, session.reference_id);
    if (!isAuth) return res.status(403).json({ error: 'Forbidden.' });

    let newStatus = session.status;
    // We only allow specific status transitions here (e.g. initiating movement, or completing)
    if (status && ['in_transit', 'arrived', 'completed', 'cancelled'].includes(status)) {
      newStatus = status;
    } else if (session.status === 'initiated') {
      newStatus = 'in_transit';
    }

    const result = await query(
      `UPDATE tracking_sessions 
       SET current_latitude = $1, current_longitude = $2, status = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4 RETURNING *`,
      [lat, lng, newStatus, session.id]
    );

    // Broadcast over Socket.io
    const io = req.app.get('io');
    if (io) {
      const payload = {
        trackingSessionId: session.id,
        latitude: lat,
        longitude: lng,
        status: newStatus,
        timestamp: result.rows[0].updated_at
      };
      io.to(`tracking:${session.id}`).emit('tracking:location', payload);
      if (newStatus === 'completed' || newStatus === 'cancelled') {
         io.to(`tracking:${session.id}`).emit('tracking:completed', payload);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Tracking Location Error:', err);
    res.status(500).json({ error: 'Failed to update location.' });
  }
});

// POST /api/tracking/:id/status
router.post('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status.' });
  }
  
  const validStatuses = ['initiated', 'in_transit', 'arrived', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const sessionRes = await query('SELECT * FROM tracking_sessions WHERE id = $1', [req.params.id]);
    if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Tracking session not found.' });
    
    const session = sessionRes.rows[0];

    // Reject updates to already completed/cancelled sessions if not same status
    if ((session.status === 'completed' || session.status === 'cancelled') && session.status !== status) {
      return res.status(400).json({ error: 'Tracking session is no longer active.' });
    }
    
    // Status transition validation logic
    const transitionMap = {
      'initiated': ['in_transit', 'cancelled'],
      'in_transit': ['arrived', 'cancelled', 'completed'],
      'arrived': ['completed', 'cancelled'],
      'completed': [],
      'cancelled': []
    };
    
    // allow same status (idempotent), otherwise check map
    if (session.status !== status && !transitionMap[session.status].includes(status)) {
       return res.status(400).json({ error: 'Invalid status transition.' });
    }

    const identity = await resolveIdentity(req);
    const isAuth = await authorizeTrackingAccess(identity, session.reference_type, session.reference_id);
    if (!isAuth) return res.status(403).json({ error: 'Forbidden.' });

    const result = await query(
      `UPDATE tracking_sessions 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [status, session.id]
    );

    // Broadcast over Socket.io
    const io = req.app.get('io');
    if (io) {
      const payload = {
        trackingSessionId: session.id,
        status: status,
        timestamp: result.rows[0].updated_at
      };
      io.to(`tracking:${session.id}`).emit('tracking:status', payload);
      
      if (status === 'completed' || status === 'cancelled') {
         io.to(`tracking:${session.id}`).emit('tracking:completed', payload);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Tracking Status Error:', err);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

module.exports = router;
