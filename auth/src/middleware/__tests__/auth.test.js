// Tests for authentication middleware

const { 
  authenticateToken, 
  requireAdmin, 
  optionalAuth 
} = require('../auth');

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = global.testUtils.createMockReq();
    res = global.testUtils.createMockRes();
    next = global.testUtils.createMockNext();
    
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid Bearer token', async () => {
      const token = global.authTestUtils.createTestToken();
      req.headers.authorization = `Bearer ${token}`;
      
      await authenticateToken(req, res, next);
      
      expect(req.user).toEqual({
        userId: 'test-user-id',
        username: 'testuser',
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate valid token from cookies', async () => {
      const token = global.authTestUtils.createTestToken();
      req.cookies = { accessToken: token };
      
      await authenticateToken(req, res, next);
      
      expect(req.user).toEqual({
        userId: 'test-user-id',
        username: 'testuser', 
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
    });

    it('should prioritize Authorization header over cookies', async () => {
      const headerToken = global.authTestUtils.createTestToken({ username: 'header-user' });
      const cookieToken = global.authTestUtils.createTestToken({ username: 'cookie-user' });
      
      req.headers.authorization = `Bearer ${headerToken}`;
      req.cookies = { accessToken: cookieToken };
      
      await authenticateToken(req, res, next);
      
      expect(req.user.username).toBe('header-user');
      expect(next).toHaveBeenCalled();
    });

    it('should reject request with no token', async () => {
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access token required',
        message: 'Please provide a valid authentication token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      req.headers.authorization = 'Bearer invalid.token.here';
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Please log in again',
        code: 'TOKEN_INVALID'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject expired token with specific code', async () => {
      const expiredToken = global.authTestUtils.createExpiredToken();
      req.headers.authorization = `Bearer ${expiredToken}`;
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Token expired',
        message: 'Please refresh your token or log in again',
        code: 'TOKEN_EXPIRED'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject refresh token when expecting access token', async () => {
      const refreshToken = global.authTestUtils.createTestRefreshToken();
      req.headers.authorization = `Bearer ${refreshToken}`;
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Please log in again',
        code: 'TOKEN_INVALID'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle JWT secret configuration errors', async () => {
      // Mock loadSecret to throw error
      const { loadSecret } = require('../../../../shared/secrets-loader');
      loadSecret.mockImplementationOnce(() => {
        throw new Error('Secret not found');
      });
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication service misconfigured'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors gracefully', async () => {
      // Mock verifyAccessToken to throw unexpected error
      jest.doMock('../utils/jwt', () => ({
        verifyAccessToken: jest.fn(() => {
          throw new Error('Unexpected error');
        })
      }));
      
      const token = global.authTestUtils.createTestToken();
      req.headers.authorization = `Bearer ${token}`;
      
      await authenticateToken(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication error',
        message: 'Internal server error'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow authenticated admin user', () => {
      req.user = {
        userId: 'test-user-id',
        username: 'testuser',
        role: 'admin'
      };
      
      requireAdmin(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated user', () => {
      // No req.user set
      
      requireAdmin(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject non-admin user', () => {
      req.user = {
        userId: 'test-user-id',
        username: 'testuser',
        role: 'user' // Not admin
      };
      
      requireAdmin(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Admin access required',
        message: 'You do not have permission to access this resource'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should add user info when valid token provided', async () => {
      const token = global.authTestUtils.createTestToken();
      req.headers.authorization = `Bearer ${token}`;
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toEqual({
        userId: 'test-user-id',
        username: 'testuser',
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should continue without user when no token provided', async () => {
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should continue without user when invalid token provided', async () => {
      req.headers.authorization = 'Bearer invalid.token';
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should continue without user when JWT secret not configured', async () => {
      // Mock loadSecret to throw error
      const { loadSecret } = require('../../../../shared/secrets-loader');
      loadSecret.mockImplementationOnce(() => {
        throw new Error('Secret not found');
      });
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should use cookie token when no header provided', async () => {
      const token = global.authTestUtils.createTestToken();
      req.cookies = { accessToken: token };
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toEqual({
        userId: 'test-user-id',
        username: 'testuser',
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
    });

    it('should handle unexpected errors gracefully', async () => {
      // Simulate an unexpected error during token verification
      const token = global.authTestUtils.createTestToken();
      req.headers.authorization = `Bearer ${token}`;
      
      // Mock verifyAccessToken to throw error
      jest.doMock('../utils/jwt', () => ({
        verifyAccessToken: jest.fn(() => {
          throw new Error('Unexpected verification error');
        })
      }));
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});