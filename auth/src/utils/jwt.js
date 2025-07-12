const jwt = require('jsonwebtoken');
const { loadSecret } = require('../../../../shared/secrets-loader');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// In-memory refresh token store (in production, use Redis or database)
const refreshTokens = new Map();

/**
 * Generate access and refresh tokens
 */
function generateTokenPair(user) {
  try {
    const jwtSecret = loadSecret('JWT_SECRET');
    const accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
    const refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    
    // Generate access token (short-lived)
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'access'
      },
      jwtSecret,
      {
        expiresIn: accessTokenExpiry,
        issuer: 'audiobook-auth',
        audience: 'audiobook-app',
        subject: user.id
      }
    );
    
    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'refresh',
        tokenId: generateTokenId()
      },
      jwtSecret,
      {
        expiresIn: refreshTokenExpiry,
        issuer: 'audiobook-auth',
        audience: 'audiobook-app',
        subject: user.id
      }
    );
    
    // Store refresh token with metadata
    refreshTokens.set(refreshToken, {
      userId: user.id,
      username: user.username,
      issuedAt: Date.now(),
      lastUsed: Date.now(),
      userAgent: null, // Will be set when storing
      ipAddress: null  // Will be set when storing
    });
    
    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiry,
      tokenType: 'Bearer'
    };
  } catch (error) {
    logger.error('Error generating token pair:', error);
    throw new Error('Token generation failed');
  }
}

/**
 * Verify and refresh access token using refresh token
 */
function refreshAccessToken(refreshToken, userAgent = null, ipAddress = null) {
  try {
    const jwtSecret = loadSecret('JWT_SECRET');
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, jwtSecret, {
      issuer: 'audiobook-auth',
      audience: 'audiobook-app'
    });
    
    // Check if refresh token exists in store
    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData) {
      throw new Error('Refresh token not found or revoked');
    }
    
    // Verify token belongs to the same user
    if (decoded.userId !== tokenData.userId || decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }
    
    // Update last used timestamp
    tokenData.lastUsed = Date.now();
    if (userAgent) tokenData.userAgent = userAgent;
    if (ipAddress) tokenData.ipAddress = ipAddress;
    
    // Generate new access token
    const user = {
      id: decoded.userId,
      username: decoded.username,
      role: 'admin' // In production, fetch from database
    };
    
    const accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
    const newAccessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'access'
      },
      jwtSecret,
      {
        expiresIn: accessTokenExpiry,
        issuer: 'audiobook-auth',
        audience: 'audiobook-app',
        subject: user.id
      }
    );
    
    logger.info(`Access token refreshed for user: ${user.username}`, {
      userId: user.id,
      tokenId: decoded.tokenId
    });
    
    return {
      accessToken: newAccessToken,
      expiresIn: accessTokenExpiry,
      tokenType: 'Bearer'
    };
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // Remove expired refresh token
      refreshTokens.delete(refreshToken);
      throw new Error('Refresh token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    }
    logger.error('Error refreshing token:', error);
    throw error;
  }
}

/**
 * Verify access token
 */
function verifyAccessToken(accessToken) {
  try {
    const jwtSecret = loadSecret('JWT_SECRET');
    
    const decoded = jwt.verify(accessToken, jwtSecret, {
      issuer: 'audiobook-auth',
      audience: 'audiobook-app'
    });
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return {
      valid: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Revoke refresh token
 */
function revokeRefreshToken(refreshToken) {
  const tokenData = refreshTokens.get(refreshToken);
  if (tokenData) {
    refreshTokens.delete(refreshToken);
    logger.info(`Refresh token revoked for user: ${tokenData.username}`, {
      userId: tokenData.userId
    });
    return true;
  }
  return false;
}

/**
 * Revoke all refresh tokens for a user
 */
function revokeAllUserTokens(userId) {
  let revokedCount = 0;
  for (const [token, data] of refreshTokens.entries()) {
    if (data.userId === userId) {
      refreshTokens.delete(token);
      revokedCount++;
    }
  }
  
  if (revokedCount > 0) {
    logger.info(`Revoked ${revokedCount} refresh tokens for user: ${userId}`);
  }
  
  return revokedCount;
}

/**
 * Clean up expired refresh tokens
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  let cleanedCount = 0;
  
  for (const [token, data] of refreshTokens.entries()) {
    if (now - data.issuedAt > maxAge) {
      refreshTokens.delete(token);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} expired refresh tokens`);
  }
  
  return cleanedCount;
}

/**
 * Get active token statistics
 */
function getTokenStats() {
  const stats = {
    totalRefreshTokens: refreshTokens.size,
    userTokenCounts: {},
    oldestToken: null,
    newestToken: null
  };
  
  let oldest = Date.now();
  let newest = 0;
  
  for (const [token, data] of refreshTokens.entries()) {
    // Count tokens per user
    stats.userTokenCounts[data.userId] = (stats.userTokenCounts[data.userId] || 0) + 1;
    
    // Track oldest and newest
    if (data.issuedAt < oldest) {
      oldest = data.issuedAt;
      stats.oldestToken = new Date(data.issuedAt);
    }
    if (data.issuedAt > newest) {
      newest = data.issuedAt;
      stats.newestToken = new Date(data.issuedAt);
    }
  }
  
  return stats;
}

/**
 * Generate unique token ID
 */
function generateTokenId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Cleanup expired tokens every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
  generateTokenPair,
  refreshAccessToken,
  verifyAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  getTokenStats
};