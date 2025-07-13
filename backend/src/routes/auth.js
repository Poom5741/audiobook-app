const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../services/database');
const { logger } = require('../utils/logger');
const { validateRequest, validateLogin, validateRegister } = require('../middleware/validation');
const { body } = require('express-validator');

// POST /api/auth/register - Register new user
router.post('/register',
  validateRegister,
  async (req, res) => {
    try {
      const { name: username, email, password } = req.body;
      
      // Check if user already exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ 
          error: 'User already exists',
          message: 'Username or email already taken'
        });
      }
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash) 
         VALUES ($1, $2, $3) 
         RETURNING id, username, email, created_at`,
        [username, email, passwordHash]
      );
      
      const user = result.rows[0];
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      logger.info(`User registered: ${username}`);
      
      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          createdAt: user.created_at
        },
        token
      });
      
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// POST /api/auth/login - Login user
router.post('/login',
  validateLogin,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Find user
      const result = await pool.query(
        'SELECT id, username, email, password_hash FROM users WHERE username = $1 OR email = $1',
        [email]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          message: 'Username or password incorrect'
        });
      }
      
      const user = result.rows[0];
      
      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isValid) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          message: 'Username or password incorrect'
        });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      logger.info(`User logged in: ${user.username}`);
      
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        token
      });
      
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// POST /api/auth/verify - Verify JWT token
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get current user data
    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({
      valid: true,
      user: result.rows[0]
    });
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    logger.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
});

module.exports = router;