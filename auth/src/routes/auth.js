const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const winston = require('winston');

const { validateAdminCredentials, getAdminInfo, updateAdminPassword } = require('../utils/admin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// Validation schemas
const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
});

/**
 * POST /api/auth/login
 * Admin login
 */
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.details.map(d => d.message)
      });
    }

    const { username, password } = value;

    // Validate credentials
    const result = await validateAdminCredentials(username, password);
    
    if (!result.success) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: result.error
      });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Authentication service misconfigured'
      });
    }

    const token = jwt.sign(
      { 
        userId: result.user.id,
        username: result.user.username,
        role: result.user.role
      },
      jwtSecret,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        issuer: 'audiobook-auth',
        audience: 'audiobook-app'
      }
    );

    // Set secure HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info(`Successful login for user: ${username}`, {
      userId: result.user.id,
      ip: req.ip
    });

    res.json({
      message: 'Login successful',
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        lastLogin: result.user.lastLogin
      },
      token // Also return token for API usage
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (clear cookie)
 */
router.post('/logout', authenticateToken, (req, res) => {
  res.clearCookie('authToken');
  
  logger.info(`User logged out: ${req.user?.username}`, {
    userId: req.user?.userId,
    ip: req.ip
  });

  res.json({
    message: 'Logout successful'
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, (req, res) => {
  try {
    const adminInfo = getAdminInfo();
    
    if (!adminInfo) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user: {
        id: adminInfo.id,
        username: adminInfo.username,
        role: adminInfo.role,
        lastLogin: adminInfo.lastLogin,
        createdAt: adminInfo.createdAt
      }
    });
  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({
      error: 'Failed to get user info'
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify token validity
 */
router.post('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.userId,
      username: req.user.username,
      role: req.user.role
    }
  });
});

/**
 * POST /api/auth/change-password
 * Change admin password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    // Validate input
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.details.map(d => d.message)
      });
    }

    const { currentPassword, newPassword } = value;

    // Verify current password
    const verification = await validateAdminCredentials(req.user.username, currentPassword);
    if (!verification.success) {
      return res.status(401).json({
        error: 'Current password is incorrect'
      });
    }

    // Update password
    const result = await updateAdminPassword(newPassword);
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to update password',
        message: result.error
      });
    }

    logger.info(`Password changed for user: ${req.user.username}`, {
      userId: req.user.userId,
      ip: req.ip
    });

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password'
    });
  }
});

/**
 * GET /api/auth/status
 * Get authentication service status
 */
router.get('/status', (req, res) => {
  const adminInfo = getAdminInfo();
  
  res.json({
    serviceStatus: 'active',
    adminConfigured: !!adminInfo,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;