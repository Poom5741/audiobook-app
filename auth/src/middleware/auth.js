const jwt = require('jsonwebtoken');
const winston = require('winston');

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
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Authentication service misconfigured'
      });
    }

    // Try to get token from Authorization header first
    let token = null;
    const authHeader = req.headers['authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (req.cookies && req.cookies.authToken) {
      // Fallback to cookie
      token = req.cookies.authToken;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid authentication token'
      });
    }

    // Verify token
    jwt.verify(token, jwtSecret, {
      issuer: 'audiobook-auth',
      audience: 'audiobook-app'
    }, (err, decoded) => {
      if (err) {
        logger.warn('Invalid token attempt', {
          error: err.message,
          ip: req.ip
        });

        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            error: 'Token expired',
            message: 'Please log in again'
          });
        }

        if (err.name === 'JsonWebTokenError') {
          return res.status(401).json({
            error: 'Invalid token',
            message: 'Please log in again'
          });
        }

        return res.status(401).json({
          error: 'Token verification failed',
          message: 'Please log in again'
        });
      }

      // Token is valid, add user info to request
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role
      };

      next();
    });

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
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next(); // Continue without auth if not configured
    }

    let token = null;
    const authHeader = req.headers['authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    }

    if (!token) {
      return next(); // Continue without auth
    }

    jwt.verify(token, jwtSecret, {
      issuer: 'audiobook-auth',
      audience: 'audiobook-app'
    }, (err, decoded) => {
      if (!err) {
        req.user = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role
        };
      }
      next(); // Continue regardless of token validity
    });

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