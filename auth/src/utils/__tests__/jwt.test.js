// Tests for JWT utility functions

const jwt = require('jsonwebtoken');
const { 
  generateTokenPair, 
  refreshAccessToken, 
  verifyAccessToken, 
  revokeRefreshToken,
  revokeAllUserTokens,
  getTokenStats
} = require('../jwt');

describe('JWT Utilities', () => {
  beforeEach(() => {
    // Clear any existing tokens
    jest.clearAllMocks();
  });

  describe('generateTokenPair', () => {
    const mockUser = {
      id: 'test-user-id',
      username: 'testuser',
      role: 'admin'
    };

    it('should generate access and refresh tokens', () => {
      const tokens = generateTokenPair(mockUser);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(tokens).toHaveProperty('tokenType');
      expect(tokens.tokenType).toBe('Bearer');
    });

    it('should generate valid JWT tokens', () => {
      const tokens = generateTokenPair(mockUser);
      
      // Verify access token
      const accessDecoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET);
      expect(accessDecoded.userId).toBe(mockUser.id);
      expect(accessDecoded.username).toBe(mockUser.username);
      expect(accessDecoded.role).toBe(mockUser.role);
      expect(accessDecoded.type).toBe('access');
      
      // Verify refresh token
      const refreshDecoded = jwt.verify(tokens.refreshToken, process.env.JWT_SECRET);
      expect(refreshDecoded.userId).toBe(mockUser.id);
      expect(refreshDecoded.username).toBe(mockUser.username);
      expect(refreshDecoded.type).toBe('refresh');
      expect(refreshDecoded.tokenId).toBeDefined();
    });

    it('should throw error when secrets are not available', () => {
      // Mock loadSecret to throw error
      const { loadSecret } = require('../../../../shared/secrets-loader');
      loadSecret.mockImplementationOnce(() => {
        throw new Error('Secret not found');
      });

      expect(() => generateTokenPair(mockUser)).toThrow('Token generation failed');
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const token = global.authTestUtils.createTestToken();
      const result = verifyAccessToken(token);
      
      expect(result.valid).toBe(true);
      expect(result.user).toHaveProperty('userId');
      expect(result.user).toHaveProperty('username');
      expect(result.user).toHaveProperty('role');
    });

    it('should reject invalid token', () => {
      const result = verifyAccessToken('invalid.token');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject expired token', () => {
      const expiredToken = global.authTestUtils.createExpiredToken();
      const result = verifyAccessToken(expiredToken);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject refresh token when expecting access token', () => {
      const refreshToken = global.authTestUtils.createTestRefreshToken();
      const result = verifyAccessToken(refreshToken);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token type');
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new access token from valid refresh token', () => {
      // First generate a token pair
      const mockUser = { id: 'test-user', username: 'testuser', role: 'admin' };
      const tokens = generateTokenPair(mockUser);
      
      // Then refresh using the refresh token
      const result = refreshAccessToken(tokens.refreshToken, 'test-agent', '127.0.0.1');
      
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result).toHaveProperty('tokenType');
      expect(result.tokenType).toBe('Bearer');
      
      // Verify the new access token is valid
      const verification = verifyAccessToken(result.accessToken);
      expect(verification.valid).toBe(true);
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => {
        refreshAccessToken('invalid.token');
      }).toThrow('Invalid refresh token');
    });

    it('should throw error for expired refresh token', () => {
      const expiredRefreshToken = jwt.sign(
        { userId: 'test', username: 'test', type: 'refresh', tokenId: 'test' },
        process.env.JWT_SECRET,
        { expiresIn: '0s', issuer: 'audiobook-auth', audience: 'audiobook-app' }
      );
      
      expect(() => {
        refreshAccessToken(expiredRefreshToken);
      }).toThrow('Refresh token expired');
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke existing refresh token', () => {
      const mockUser = { id: 'test-user', username: 'testuser', role: 'admin' };
      const tokens = generateTokenPair(mockUser);
      
      const result = revokeRefreshToken(tokens.refreshToken);
      expect(result).toBe(true);
      
      // Token should no longer be valid for refresh
      expect(() => {
        refreshAccessToken(tokens.refreshToken);
      }).toThrow('Refresh token not found or revoked');
    });

    it('should return false for non-existent token', () => {
      const result = revokeRefreshToken('non.existent.token');
      expect(result).toBe(false);
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', () => {
      const mockUser = { id: 'test-user', username: 'testuser', role: 'admin' };
      
      // Generate multiple tokens for the same user
      const tokens1 = generateTokenPair(mockUser);
      const tokens2 = generateTokenPair(mockUser);
      
      const revokedCount = revokeAllUserTokens('test-user');
      expect(revokedCount).toBe(2);
      
      // All tokens should be revoked
      expect(() => refreshAccessToken(tokens1.refreshToken)).toThrow();
      expect(() => refreshAccessToken(tokens2.refreshToken)).toThrow();
    });

    it('should return 0 when no tokens exist for user', () => {
      const revokedCount = revokeAllUserTokens('non-existent-user');
      expect(revokedCount).toBe(0);
    });
  });

  describe('getTokenStats', () => {
    beforeEach(() => {
      // Clear any existing tokens
      revokeAllUserTokens('test-user-1');
      revokeAllUserTokens('test-user-2');
    });

    it('should return correct token statistics', () => {
      const user1 = { id: 'test-user-1', username: 'user1', role: 'admin' };
      const user2 = { id: 'test-user-2', username: 'user2', role: 'admin' };
      
      // Generate tokens for different users
      generateTokenPair(user1);
      generateTokenPair(user1);
      generateTokenPair(user2);
      
      const stats = getTokenStats();
      
      expect(stats.totalRefreshTokens).toBe(3);
      expect(stats.userTokenCounts['test-user-1']).toBe(2);
      expect(stats.userTokenCounts['test-user-2']).toBe(1);
      expect(stats.oldestToken).toBeInstanceOf(Date);
      expect(stats.newestToken).toBeInstanceOf(Date);
    });

    it('should return empty stats when no tokens exist', () => {
      const stats = getTokenStats();
      
      expect(stats.totalRefreshTokens).toBe(0);
      expect(Object.keys(stats.userTokenCounts)).toHaveLength(0);
      expect(stats.oldestToken).toBeNull();
      expect(stats.newestToken).toBeNull();
    });
  });
});