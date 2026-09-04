const express = require('express');
const router = express.Router();
const { query, logAudit } = require('../db');
const auth = require('../middleware/auth');

// Get all available organs
router.get('/organs', async (req, res) => {
  try {
    console.log('Fetching all available organs...');
    const result = await query(`
      SELECT o.*, h.name as hospital_name, h.city, h.state
      FROM organs o
      JOIN hospitals h ON o.hospital_id = h.id
      WHERE o.status = 'available'
      ORDER BY o.created_at DESC
    `);
    console.log(`Successfully fetched ${result.rows.length} organs.`);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Organs Error:', err);
    res.status(500).json({ error: 'Failed to fetch organs.' });
  }
});

// Get organ catalog (Reference Data)
router.get('/organs/catalog', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM organ_catalog 
      ORDER BY category ASC, type ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Organ Catalog Error:', err);
    res.status(500).json({ error: 'Failed to fetch organ catalog.' });
  }
});

// Get equipment catalog (Reference Data)
router.get('/equipment/catalog', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM equipment_catalog 
      ORDER BY category ASC, type ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Equipment Catalog Error:', err);
    res.status(500).json({ error: 'Failed to fetch equipment catalog.' });
  }
});

// Get all equipment (with optional filters)
router.get('/equipment', async (req, res) => {
  try {
    const { type, status } = req.query;
    let sql = `
      SELECT e.*, h.name as hospital_name, h.city, h.state
      FROM equipment e
      JOIN hospitals h ON e.hospital_id = h.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND e.status = $${paramIndex++}`;
      params.push(status);
    } else if (status !== 'all') {
      // Default behavior preserves existing dashboard logic
      sql += ` AND e.status = 'available'`;
    }

    if (type) {
      sql += ` AND e.type = $${paramIndex++}`;
      params.push(type);
    }

    sql += ` ORDER BY e.created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Equipment Error:', err);
    res.status(500).json({ error: 'Failed to fetch equipment.' });
  }
});

// Add an organ (Hospital Only)
router.post('/organs', auth, async (req, res) => {
  const { type, blood_group } = req.body;
  const hospitalId = req.hospital.id;

  try {
    // 1. Validate against organ_catalog
    const catalogCheck = await query('SELECT id FROM organ_catalog WHERE type = $1', [type]);
    if (catalogCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid organ type. Must be a standardized catalog value.' });
    }

    const result = await query(
      'INSERT INTO organs (hospital_id, type, blood_group) VALUES ($1, $2, $3) RETURNING *',
      [hospitalId, type, blood_group]
    );

    // Waitlist matching logic: Check for pending requests with no target resource
    try {
      const waitlistReqs = await query(`
        SELECT * FROM requests 
        WHERE target_resource_id IS NULL 
        AND status = 'pending' 
        AND resource_type = 'organ'
      `);

      const io = req.app.get('io');
      const connectedHospitals = req.app.get('connectedHospitals');

      for (const wlReq of waitlistReqs.rows) {
        // Improved waitlist matching: Exact match against standardized type (or substring in notes for legacy compat)
        const typeMatch = type.toLowerCase();
        const requestNotes = (wlReq.notes || '').toLowerCase();
        
        if (requestNotes.includes(typeMatch)) {
          const message = `WAITLIST ALERT: A new ${type} (${blood_group}) has been added to the network!`;
          
          await query('INSERT INTO notifications (hospital_id, message, type) VALUES ($1, $2, $3)', [wlReq.hospital_id, message, 'alert']);
          
          const socketId = connectedHospitals && connectedHospitals.get(wlReq.hospital_id.toString());
          if (socketId && io) {
            io.to(socketId).emit('new_notification', { message, type: 'alert', timestamp: new Date() });
          }
        }
      }
    } catch (wlErr) {
      console.error('Waitlist check error:', wlErr);
    }

    await logAudit('Add Organ', hospitalId, { type, blood_group });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add organ.' });
  }
});

// Add equipment (Hospital Only)
router.post('/equipment', auth, async (req, res) => {
  const { type, model, condition = 'good' } = req.body;
  const hospitalId = req.hospital.id;

  try {
    const result = await query(
      'INSERT INTO equipment (hospital_id, type, model, condition) VALUES ($1, $2, $3, $4) RETURNING *',
      [hospitalId, type, model, condition]
    );

    await logAudit('Add Equipment', hospitalId, { type, model, condition });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add Equipment Error:', err);
    res.status(500).json({ error: 'Failed to add equipment.' });
  }
});

// Get specific equipment details
router.get('/equipment/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT e.*, h.name as hospital_name, h.email, h.contact_number, h.city, h.state
      FROM equipment e
      JOIN hospitals h ON e.hospital_id = h.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch equipment details.' });
  }
});

// Get all available blood units
router.get('/blood', async (req, res) => {
  try {
    const result = await query(`
      SELECT b.*, h.name as hospital_name, h.city, h.state
      FROM blood b
      JOIN hospitals h ON b.hospital_id = h.id
      WHERE b.status = 'available'
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Blood Error:', err);
    res.status(500).json({ error: 'Failed to fetch blood inventory.' });
  }
});

// Add blood units (Hospital Only)
router.post('/blood', auth, async (req, res) => {
  const { blood_group, units } = req.body;
  const hospitalId = req.hospital.id;
  
  if (!Number.isInteger(Number(units)) || Number(units) <= 0) {
    return res.status(400).json({ error: 'Units must be a positive integer.' });
  }

  try {
    const result = await query(
      'INSERT INTO blood (hospital_id, blood_group, units) VALUES ($1, $2, $3) RETURNING *',
      [hospitalId, blood_group, units]
    );

    await logAudit('Add Blood Units', hospitalId, { blood_group, units });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add blood units.' });
  }
});

module.exports = router;
