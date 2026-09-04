const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const requestRoutes = require('./routes/requests');
const notificationRoutes = require('./routes/notifications');
const hospitalRoutes = require('./routes/hospitals');
const bloodBankRoutes = require('./routes/bloodBanks');
const appointmentRoutes = require('./routes/appointments');
const trackingRoutes = require('./routes/tracking');
const { authLimiter, publicDirectoryLimiter, generalApiLimiter } = require('./middleware/rateLimiter');
const { pool, USE_SQLITE } = require('./db');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // For demo purpose, adjust for production
    methods: ['GET', 'POST'],
  },
});

// Trust the single Nginx reverse proxy defined in docker-compose.yml 
// to ensure rate-limiting uses the correct client IP.
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/resources', generalApiLimiter, resourceRoutes);
app.use('/api/requests', generalApiLimiter, requestRoutes);
app.use('/api/notifications', generalApiLimiter, notificationRoutes);
app.use('/api/hospitals', publicDirectoryLimiter, hospitalRoutes);  // Public hospital directory (government reference data)
app.use('/api/blood-banks', publicDirectoryLimiter, bloodBankRoutes);  // Public blood bank directory (government reference data)
app.use('/api/appointments', generalApiLimiter, appointmentRoutes);
app.use('/api/tracking', generalApiLimiter, trackingRoutes); // Phase 9.2

// Socket.io Real-time Setup
const connectedHospitals = new Map(); // Store hospitalId -> socketId

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (hospitalId) => {
    connectedHospitals.set(hospitalId.toString(), socket.id);
    console.log(`Hospital ${hospitalId} joined notification channel`);
  });

  // Phase 9.2: Secure Tracking Rooms
  socket.on('join_tracking', async (data) => {
    try {
      const { tracking_session_id, token, type } = data; // type: 'hospital' or 'patient'
      if (!tracking_session_id || !token || !type) return;

      const jwtObj = require('jsonwebtoken');
      let identity = null;

      if (type === 'hospital') {
        const decoded = jwtObj.verify(token, process.env.JWT_SECRET || 'lifeshare_secret_key');
        identity = { type: 'hospital', id: decoded.id };
      } else if (type === 'patient') {
        identity = { type: 'patient', sessionToken: token };
      }

      if (!identity) return;

      // Validate session exists
      const sessionRes = await pool.query('SELECT reference_type, reference_id FROM tracking_sessions WHERE id = $1', [tracking_session_id]);
      if (sessionRes.rows.length === 0) return;
      
      const { reference_type, reference_id } = sessionRes.rows[0];
      let isAuth = false;

      if (reference_type === 'organ_transfer' && identity.type === 'hospital') {
        const transRes = await pool.query(
          'SELECT id FROM transactions WHERE request_id = $1 AND (donor_hospital_id = $2 OR recipient_hospital_id = $2)',
          [reference_id, identity.id]
        );
        isAuth = transRes.rows.length > 0;
      } else if (reference_type === 'blood_appointment' && identity.type === 'patient') {
        const apptRes = await pool.query(
          'SELECT id FROM appointments WHERE id = $1 AND session_token = $2',
          [reference_id, identity.sessionToken]
        );
        isAuth = apptRes.rows.length > 0;
      }

      if (isAuth) {
        socket.join(`tracking:${tracking_session_id}`);
        console.log(`Socket ${socket.id} securely joined tracking room: tracking:${tracking_session_id}`);
      }
    } catch (e) {
      console.error('Socket join_tracking error:', e.message);
    }
  });

  socket.on('disconnect', () => {
    for (let [id, sId] of connectedHospitals.entries()) {
      if (sId === socket.id) {
        connectedHospitals.delete(id);
        break;
      }
    }
    console.log('User disconnected');
  });
});

// Global Io Object for routes to use
app.set('io', io);
app.set('connectedHospitals', connectedHospitals);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`LifeShare Server running on port ${PORT}`);
  if (!USE_SQLITE) {
    try {
      // Basic connectivity check for PostgreSQL
      await pool.query('SELECT NOW()');
      console.log('PostgreSQL connected successfully.');
    } catch (err) {
      console.error('Failed to connect to PostgreSQL:', err.message);
      console.warn('NOTE: Ensure PostgreSQL is running and DB_URL is correct in .env');
    }
  } else {
    console.log('SQLite is active. Database file: ./lifeshare.db');
  }
});

module.exports = server;
