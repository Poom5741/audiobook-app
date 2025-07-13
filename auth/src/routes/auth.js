const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { 
  createLogger, 
  createAuditLogger, 
  createMetricsLogger 
} = require('../../../../shared/logger');

const { validateAdminCredentials, getAdminInfo, updateAdminPassword } = require('../utils/admin');
const { authenticateToken } = require('../middleware/auth');
const { loadSecret } = require('../../../shared/secrets-loader');
const { generateTokenPair, refreshAccessToken, revokeRefreshToken, revokeAllUserTokens } = require('../utils/jwt');

const router = express.Router();

const logger = createLogger('auth-routes');
const auditLogger = createAuditLogger('auth-routes');
const metricsLogger = createMetricsLogger('auth-routes');

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
      auditLogger.logSecurityEvent('login_failed', 'medium', {
        username,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        reason: result.error
      });
      
      return res.status(401).json({
        error: 'Authentication failed',
        message: result.error
      });
    }

    // Generate access and refresh token pair
    let tokens;
    try {
      tokens = generateTokenPair(result.user);
    } catch (error) {
      logger.error('Token generation failed:', error.message);
      return res.status(500).json({
        error: 'Authentication service misconfigured'
      });
    }

    // Set secure HTTP-only cookies for both tokens
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh' // Restrict refresh token to refresh endpoint
    });

    auditLogger.logActivity('login_success', result.user.id, {
      username,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    });

    metricsLogger.logBusinessMetric('user_login', 1, {
      userId: result.user.id,
      username
    });

    logger.info(`Successful login for user: ${username}`, {
      userId: result.user.id,
      ip: req.ip,
      requestId: req.requestId
    });

    res.json({
      message: 'Login successful',
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        lastLogin: result.user.lastLogin
      },
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType
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
 * Logout (clear cookies and revoke refresh token)
 */
router.post('/logout', authenticateToken, (req, res) => {
  // Revoke refresh token if present
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  
  // Clear both cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  
  auditLogger.logActivity('logout', req.user?.userId, {
    username: req.user?.username,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });

  logger.info(`User logged out: ${req.user?.username}`, {
    userId: req.user?.userId,
    ip: req.ip,
    requestId: req.requestId
  });

  res.json({
    message: 'Logout successful'
  });
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        message: 'Please log in again'
      });
    }
    
    // Refresh the access token
    const result = refreshAccessToken(
      refreshToken,
      req.get('User-Agent'),
      req.ip
    );
    
    // Set new access token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    res.json({
      message: 'Token refreshed successfully',
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType
    });
    
  } catch (error) {
    logger.warn('Token refresh failed:', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Clear invalid refresh token
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    
    res.status(401).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/revoke-all
 * Revoke all refresh tokens for current user
 */
router.post('/revoke-all', authenticateToken, (req, res) => {
  try {
    const revokedCount = revokeAllUserTokens(req.user.userId);
    
    logger.info(`All tokens revoked for user: ${req.user.username}`, {
      userId: req.user.userId,
      revokedCount,
      ip: req.ip
    });
    
    res.json({
      message: 'All sessions revoked successfully',
      revokedCount
    });
    
  } catch (error) {
    logger.error('Token revocation failed:', error);
    res.status(500).json({
      error: 'Failed to revoke tokens'
    });
  }
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