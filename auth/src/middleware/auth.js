const jwt = require('jsonwebtoken');
const winston = require('winston');
const { loadSecret } = require('../../../../shared/secrets-loader');
const { verifyAccessToken } = require('../utils/jwt');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

/**
 * Middleware to authenticate JWT tokens
 * Checks both Authorization header and cookies
 */
function authenticateToken(req, res, next) {
  try {
    let jwtSecret;
    try {
      jwtSecret = loadSecret('JWT_SECRET');
    } catch (error) {
      logger.error('JWT_SECRET not configured:', error.message);
      return res.status(500).json({
        error: 'Authentication service misconfigured'
      });
    }

    // Try to get token from Authorization header first
    let token = null;
    const authHeader = req.headers['authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (req.cookies && req.cookies.accessToken) {
      // Fallback to access token cookie
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid authentication token'
      });
    }

    // Verify access token using JWT utility
    const verification = verifyAccessToken(token);
    
    if (!verification.valid) {
      logger.warn('Invalid token attempt', {
        error: verification.error,
        ip: req.ip
      });

      if (verification.error.includes('expired')) {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Please refresh your token or log in again',
          code: 'TOKEN_EXPIRED'
        });
      }

      return res.status(401).json({
        error: 'Invalid token',
        message: 'Please log in again',
        code: 'TOKEN_INVALID'
      });
    }

    // Token is valid, add user info to request
    req.user = verification.user;
    next();

  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error'
    });
  }
}

/**
 * Middleware to check if user is admin
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    logger.warn(`Non-admin access attempt`, {
      userId: req.user.userId,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      path: req.path
    });

    return res.status(403).json({
      error: 'Admin access required',
      message: 'You do not have permission to access this resource'
    });
  }

  next();
}

/**
 * Optional authentication middleware
 * Adds user info if token is valid, but doesn't block if invalid
 */
function optionalAuth(req, res, next) {
  try {
    let jwtSecret;
    try {
      jwtSecret = loadSecret('JWT_SECRET');
    } catch (error) {
      return next(); // Continue without auth if not configured
    }

    let token = null;
    const authHeader = req.headers['authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(); // Continue without auth
    }

    const verification = verifyAccessToken(token);
    if (verification.valid) {
      req.user = verification.user;
    }
    next(); // Continue regardless of token validity

  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next(); // Continue on error
  }
}

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuth
};