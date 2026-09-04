const rateLimit = require('express-rate-limit');

// Clean JSON response for all limiters
const limitResponse = {
  error: 'Too many requests. Please try again later.'
};

// 1. Authentication Limiter (Strict)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: limitResponse,
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Public Directory & Map Limiter (Moderate)
const publicDirectoryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: limitResponse,
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. General Authenticated API Limiter (Standard)
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  message: limitResponse,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  publicDirectoryLimiter,
  generalApiLimiter
};
