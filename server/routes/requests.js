const express = require('express');
const router = express.Router();
const { query, logAudit } = require('../db');
const auth = require('../middleware/auth');

// Create a resource request (Hospital Only)
router.post('/', auth, async (req, res) => {
  let { resource_type, target_resource_id, urgency, notes, requested_item_type, requested_blood_group, organ_type, item_type, blood_group, waitlist_item } = req.body;
  const hospitalId = req.hospital.id;

  // Validation
  const validResourceTypes = ['organ', 'blood', 'equipment'];
  if (!resource_type || !validResourceTypes.includes(resource_type.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid or missing resource type. Must be organ, blood, or equipment.' });
  }

  const validUrgencies = ['low', 'medium', 'high', 'critical'];
  if (!urgency || !validUrgencies.includes(urgency.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid urgency level. Must be low, medium, high, or critical.' });
  }

  if (notes && notes.length > 1000) {
    return res.status(400).json({ error: 'Notes length exceeds 1000 characters limit.' });
  }

  const normalizedResourceType = resource_type.toLowerCase();
  const normalizedUrgency = urgency.toLowerCase();

  // Normalize requested item type and blood group
  let finalItemType = requested_item_type || organ_type || item_type || waitlist_item || null;
  let finalBloodGroup = requested_blood_group || blood_group || null;

  try {
    if (target_resource_id) {
      let resourceTable = 'organs';
      if (normalizedResourceType === 'equipment') resourceTable = 'equipment';
      if (normalizedResourceType === 'blood') resourceTable = 'blood';

      const checkRes = await query(`SELECT * FROM ${resourceTable} WHERE id = $1`, [target_resource_id]);
      if (checkRes.rows.length === 0) {
        return res.status(404).json({ error: `Selected ${normalizedResourceType} resource not found.` });
      }

      // Populate requested item type and blood group from target resource if not explicitly passed
      const targetRes = checkRes.rows[0];
      if (normalizedResourceType === 'organ') {
        if (!finalItemType) finalItemType = targetRes.type;
        if (!finalBloodGroup) finalBloodGroup = targetRes.blood_group;
      } else if (normalizedResourceType === 'equipment') {
        if (!finalItemType) finalItemType = targetRes.type;
        if (!finalBloodGroup) finalBloodGroup = targetRes.model;
      } else if (normalizedResourceType === 'blood') {
        if (!finalItemType) finalItemType = 'Blood Unit';
        if (!finalBloodGroup) finalBloodGroup = targetRes.blood_group;
      }
    }

    const result = await query(
      `INSERT INTO requests (hospital_id, resource_type, target_resource_id, urgency, notes, requested_item_type, requested_blood_group) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [hospitalId, normalizedResourceType, target_resource_id, normalizedUrgency, notes, finalItemType, finalBloodGroup]
    );

    const requestRow = result.rows[0];
    const requestId = requestRow.id;
    await logAudit('Create Request', hospitalId, { resource_type: normalizedResourceType, target_resource_id, urgency: normalizedUrgency });

    // Matching Logic (Notification Push)
    if (target_resource_id) {
      let resourceTable = 'organs';
      if (normalizedResourceType === 'equipment') resourceTable = 'equipment';
      if (normalizedResourceType === 'blood') resourceTable = 'blood';
      
      const donorResult = await query(`SELECT hospital_id FROM ${resourceTable} WHERE id = $1`, [target_resource_id]);

      if (donorResult.rows.length > 0) {
        const donorId = donorResult.rows[0].hospital_id;
        const io = req.app.get('io');
        const connectedHospitals = req.app.get('connectedHospitals');

        const itemDesc = [finalItemType, finalBloodGroup].filter(Boolean).join(' ');
        const message = `${req.hospital.name} has requested your ${normalizedResourceType}${itemDesc ? ` (${itemDesc})` : ''} with ${normalizedUrgency} urgency.`;

        await query(
          'INSERT INTO notifications (hospital_id, message, type) VALUES ($1, $2, $3)',
          [donorId, message, 'match']
        );

        if (connectedHospitals) {
          const donorSocketId = connectedHospitals.get(donorId.toString());
          if (donorSocketId && io) {
            io.to(donorSocketId).emit('new_notification', { message, type: 'match', timestamp: new Date() });
          }
        }
      }
    }

    res.status(201).json(requestRow);
  } catch (err) {
    console.error('Request Error:', err);
    res.status(500).json({ error: 'Failed to create request.' });
  }
});

// Get hospital's requests (My Requests)
router.get('/my', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  try {
    const result = await query(`
      SELECT 
        r.*,
        COALESCE(r.requested_item_type, o.type, e.type, 'Blood Unit') as requested_item_type,
        COALESCE(r.requested_blood_group, o.blood_group, b.blood_group, e.model) as requested_blood_group,
        t.id as transaction_id,
        t.timestamp as accepted_at,
        dh.name as donor_hospital_name
      FROM requests r
      LEFT JOIN organs o ON r.resource_type = 'organ' AND r.target_resource_id = o.id
      LEFT JOIN equipment e ON r.resource_type = 'equipment' AND r.target_resource_id = e.id
      LEFT JOIN blood b ON r.resource_type = 'blood' AND r.target_resource_id = b.id
      LEFT JOIN transactions t ON t.request_id = r.id
      LEFT JOIN hospitals dh ON t.donor_hospital_id = dh.id
      WHERE r.hospital_id = $1
      ORDER BY r.created_at DESC
    `, [hospitalId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch My Requests Error:', err);
    res.status(500).json({ error: 'Failed to fetch your requests.' });
  }
});

// Get incoming requests (for a donor hospital) — ONLY active pending requests
router.get('/incoming', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  try {
    const result = await query(`
      SELECT 
        r.*,
        COALESCE(r.requested_item_type, o.type, e.type, 'Blood Unit') as requested_item_type,
        COALESCE(r.requested_blood_group, o.blood_group, b.blood_group, e.model) as requested_blood_group,
        h.name as requester_name
      FROM requests r
      JOIN hospitals h ON r.hospital_id = h.id
      LEFT JOIN organs o ON r.resource_type = 'organ' AND r.target_resource_id = o.id
      LEFT JOIN equipment e ON r.resource_type = 'equipment' AND r.target_resource_id = e.id
      LEFT JOIN blood b ON r.resource_type = 'blood' AND r.target_resource_id = b.id
      WHERE r.status = 'pending' AND (
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

    // Check IDOR: ensure donorId actually owns target resource
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

    // Log Transaction
    await query(
      `INSERT INTO transactions (request_id, donor_hospital_id, recipient_hospital_id, resource_type, resource_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, donorId, request.hospital_id, request.resource_type, request.target_resource_id]
    );

    // Mark request as matched
    await query('UPDATE requests SET status = \'matched\' WHERE id = $1', [requestId]);

    // Update resource status to reserved
    await query(`UPDATE ${resourceTable} SET status = 'reserved' WHERE id = $1`, [request.target_resource_id]);

    await query('COMMIT');

    // Real-time notification to requester/donor
    const io = req.app.get('io');
    const connectedHospitals = req.app.get('connectedHospitals');
    const itemDesc = [request.requested_item_type, request.requested_blood_group].filter(Boolean).join(' ');
    const message = `${itemDesc || request.resource_type} request accepted by ${req.hospital.name}.`;

    const notifPayload = {
      message,
      type: 'update',
      request_id: parseInt(requestId, 10),
      organ_type: request.requested_item_type || 'Organ',
      blood_group: request.requested_blood_group || '',
      accepting_hospital: req.hospital.name,
      timestamp: new Date()
    };

    await query('INSERT INTO notifications (hospital_id, message, type) VALUES ($1, $2, $3)', [request.hospital_id, message, 'update']);
    if (connectedHospitals) {
      const recipientSocketId = connectedHospitals.get(request.hospital_id.toString());
      if (recipientSocketId && io) {
        io.to(recipientSocketId).emit('new_notification', notifPayload);
      }
    }

    await logAudit('Accept Request', donorId, { requestId });
    res.json({ message: 'Request accepted successfully.' });
  } catch (err) {
    await query('ROLLBACK');
    console.error('Accept Request Error:', err);
    res.status(500).json({ error: 'Failed to accept request.' });
  }
});

// Get transaction info for a matched request
router.get('/:id/transaction', auth, async (req, res) => {
  const requestId = req.params.id;
  const hospitalId = req.hospital.id;
  try {
    const result = await query(`
      SELECT 
        t.id as transaction_id,
        t.request_id,
        t.donor_hospital_id,
        t.recipient_hospital_id,
        t.resource_type,
        t.resource_id,
        t.timestamp as accepted_at,
        COALESCE(dhd.hospital_name, dh.name) as donor_name,
        COALESCE(dhd.address, dh.address) as donor_address,
        COALESCE(dhd.town, dh.city) as donor_city,
        COALESCE(dhd.state, dh.state) as donor_state,
        dhd.latitude as donor_latitude,
        dhd.longitude as donor_longitude,
        COALESCE(rhd.hospital_name, rh.name) as recipient_name,
        COALESCE(rhd.address, rh.address) as recipient_address,
        COALESCE(rhd.town, rh.city) as recipient_city,
        COALESCE(rhd.state, rh.state) as recipient_state,
        rhd.latitude as recipient_latitude,
        rhd.longitude as recipient_longitude
      FROM transactions t
      JOIN hospitals dh ON t.donor_hospital_id = dh.id
      LEFT JOIN hospital_directory dhd ON dh.hospital_directory_id = dhd.id
      JOIN hospitals rh ON t.recipient_hospital_id = rh.id
      LEFT JOIN hospital_directory rhd ON rh.hospital_directory_id = rhd.id
      WHERE t.request_id = $1
        AND (t.donor_hospital_id = $2 OR t.recipient_hospital_id = $2)
    `, [requestId, hospitalId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or you are not authorized.' });
    }

    const tx = result.rows[0];
    const sourceHospital = {
      id: tx.donor_hospital_id,
      name: tx.donor_name,
      address: tx.donor_address,
      city: tx.donor_city,
      state: tx.donor_state,
      latitude: tx.donor_latitude,
      longitude: tx.donor_longitude
    };
    const destinationHospital = {
      id: tx.recipient_hospital_id,
      name: tx.recipient_name,
      address: tx.recipient_address,
      city: tx.recipient_city,
      state: tx.recipient_state,
      latitude: tx.recipient_latitude,
      longitude: tx.recipient_longitude
    };

    res.json({
      ...tx,
      source_hospital: sourceHospital,
      destination_hospital: destinationHospital
    });
  } catch (err) {
    console.error('Fetch Transaction Error:', err);
    res.status(500).json({ error: 'Failed to fetch transaction details.' });
  }
});

// Get specific request details with strict IDOR security
router.get('/:id', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  const requestId = req.params.id;

  if (isNaN(parseInt(requestId, 10))) {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  try {
    const result = await query(`
      SELECT r.*, 
             COALESCE(hd.hospital_name, h.name) as requester_name, 
             COALESCE(hd.address, h.address) as requester_address,
             hd.latitude as requester_latitude,
             hd.longitude as requester_longitude,
             h.email, h.contact_number, 
             COALESCE(hd.town, h.city) as city, 
             COALESCE(hd.state, h.state) as state
      FROM requests r
      JOIN hospitals h ON r.hospital_id = h.id
      LEFT JOIN hospital_directory hd ON h.hospital_directory_id = hd.id
      WHERE r.id = $1
    `, [requestId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    const request = result.rows[0];

    // Fetch target resource details & donor hospital info if target_resource_id is set
    let donorHospital = null;
    let resourceDetails = null;
    if (request.target_resource_id) {
      let resourceTable = 'organs';
      if (request.resource_type === 'equipment') resourceTable = 'equipment';
      if (request.resource_type === 'blood') resourceTable = 'blood';

      const resInfo = await query(`
        SELECT res.*, 
               COALESCE(hd.hospital_name, h.name) as hospital_name,
               COALESCE(hd.address, h.address) as hospital_address,
               hd.latitude as hospital_latitude,
               hd.longitude as hospital_longitude,
               COALESCE(hd.town, h.city) as city, 
               COALESCE(hd.state, h.state) as state
        FROM ${resourceTable} res
        JOIN hospitals h ON res.hospital_id = h.id
        LEFT JOIN hospital_directory hd ON h.hospital_directory_id = hd.id
        WHERE res.id = $1
      `, [request.target_resource_id]);

      if (resInfo.rows.length > 0) {
        resourceDetails = resInfo.rows[0];
        donorHospital = {
          id: resInfo.rows[0].hospital_id,
          name: resInfo.rows[0].hospital_name,
          address: resInfo.rows[0].hospital_address,
          city: resInfo.rows[0].city,
          state: resInfo.rows[0].state,
          latitude: resInfo.rows[0].hospital_latitude,
          longitude: resInfo.rows[0].hospital_longitude
        };
      }
    }

    const isRequester = request.hospital_id === hospitalId;
    const isDonor = donorHospital ? donorHospital.id === hospitalId : false;

    // Check transaction table for authorization
    const txCheck = await query(
      `SELECT id FROM transactions WHERE request_id = $1 AND (donor_hospital_id = $2 OR recipient_hospital_id = $2)`,
      [requestId, hospitalId]
    );
    const isTxParticipant = txCheck.rows.length > 0;

    if (!isRequester && !isDonor && !isTxParticipant) {
      return res.status(403).json({ error: 'Unauthorized access to this request.' });
    }

    // Build structured requested_resource and matched_resource
    const requestedResource = {
      type: request.resource_type,
      organ_type: request.requested_item_type || resourceDetails?.type || 'Blood Unit',
      item_type: request.requested_item_type || resourceDetails?.type || 'Blood Unit',
      blood_group: request.requested_blood_group || resourceDetails?.blood_group || resourceDetails?.model || null
    };

    let matchedResource = null;
    if (resourceDetails) {
      matchedResource = {
        type: request.resource_type,
        organ_type: resourceDetails.type,
        item_type: resourceDetails.type,
        blood_group: resourceDetails.blood_group,
        model: resourceDetails.model,
        units: resourceDetails.units,
        hospital: donorHospital
      };
    }

    const responsePayload = {
      ...request,
      requested_item_type: requestedResource.item_type,
      requested_blood_group: requestedResource.blood_group,
      requested_resource: requestedResource,
      matched_resource: matchedResource,
      is_donor: isDonor,
      is_requester: isRequester,
      donor_hospital: donorHospital,
      resource_details: resourceDetails
    };

    res.json(responsePayload);
  } catch (err) {
    console.error('Fetch Request Details Error:', err);
    res.status(500).json({ error: 'Failed to fetch request details.' });
  }
});

// Get recent activities for the logged-in hospital
router.get('/history/all', auth, async (req, res) => {
  const hospitalId = req.hospital.id;
  try {
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

    const unified = [...sentRequests.rows, ...transactions.rows]
      .sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

    res.json(unified);
  } catch (err) {
    console.error('History Fetch Error:', err);
    res.status(500).json({ error: 'Failed to fetch activity history.' });
  }
});

module.exports = router;
