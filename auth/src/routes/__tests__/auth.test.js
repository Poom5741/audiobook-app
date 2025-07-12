// Tests for authentication routes

const request = require('supertest');
const express = require('express');
const authRoutes = require('../auth');

// Mock the utilities and middleware
jest.mock('../../utils/admin');
jest.mock('../../utils/jwt');
jest.mock('../../middleware/auth');

describe('Auth Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const { validateAdminCredentials } = require('../../utils/admin');
      const { generateTokenPair } = require('../../utils/jwt');
      
      validateAdminCredentials.mockResolvedValue({
        success: true,
        user: {
          id: 'admin-001',
          username: 'admin',
          role: 'admin',
          lastLogin: new Date()
        }
      });
      
      generateTokenPair.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: '15m',
        tokenType: 'Bearer'
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'correct-password'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken', 'access-token');
      expect(response.body).toHaveProperty('expiresIn', '15m');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      
      // Check cookies are set
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'].some(cookie => 
        cookie.includes('accessToken=access-token')
      )).toBe(true);
      expect(response.headers['set-cookie'].some(cookie => 
        cookie.includes('refreshToken=refresh-token')
      )).toBe(true);
    });

    it('should reject invalid credentials', async () => {
      const { validateAdminCredentials } = require('../../utils/admin');
      
      validateAdminCredentials.mockResolvedValue({
        success: false,
        error: 'Invalid credentials'
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrong-password'
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
      expect(response.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'a', // Too short
          password: '123' // Too short
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid input');
      expect(response.body).toHaveProperty('details');
      expect(Array.isArray(response.body.details)).toBe(true);
    });

    it('should handle missing username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'password123'
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid input');
    });

    it('should handle missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin'
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid input');
    });

    it('should handle JWT secret configuration errors', async () => {
      const { validateAdminCredentials } = require('../../utils/admin');
      const { generateTokenPair } = require('../../utils/jwt');
      
      validateAdminCredentials.mockResolvedValue({
        success: true,
        user: { id: 'test', username: 'admin', role: 'admin' }
      });
      
      generateTokenPair.mockImplementation(() => {
        throw new Error('JWT secret not configured');
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'correct-password'
        });
      
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Authentication service misconfigured');
    });

    it('should handle authentication service errors', async () => {
      const { validateAdminCredentials } = require('../../utils/admin');
      
      validateAdminCredentials.mockRejectedValue(new Error('Database connection failed'));
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'correct-password'
        });
      
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Authentication error');
      expect(response.body).toHaveProperty('message', 'Internal server error');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      const { revokeRefreshToken } = require('../../utils/jwt');
      
      // Mock authenticated user
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { userId: 'test-user', username: 'testuser' };
        next();
      });
      
      revokeRefreshToken.mockReturnValue(true);
      
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', ['refreshToken=test-refresh-token']);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logout successful');
      
      // Check cookies are cleared
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'].some(cookie => 
        cookie.includes('accessToken=;')
      )).toBe(true);
      expect(response.headers['set-cookie'].some(cookie => 
        cookie.includes('refreshToken=;')
      )).toBe(true);
    });

    it('should require authentication', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      
      const response = await request(app)
        .post('/api/auth/logout');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const { refreshAccessToken } = require('../../utils/jwt');
      
      refreshAccessToken.mockReturnValue({
        accessToken: 'new-access-token',
        expiresIn: '15m',
        tokenType: 'Bearer'
      });
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=valid-refresh-token']);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Token refreshed successfully');
      expect(response.body).toHaveProperty('accessToken', 'new-access-token');
      expect(response.body).toHaveProperty('expiresIn', '15m');
      
      // Check new access token cookie is set
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'].some(cookie => 
        cookie.includes('accessToken=new-access-token')
      )).toBe(true);
    });

    it('should reject request without refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Refresh token required');
      expect(response.body).toHaveProperty('message', 'Please log in again');
    });

    it('should handle invalid refresh token', async () => {
      const { refreshAccessToken } = require('../../utils/jwt');
      
      refreshAccessToken.mockImplementation(() => {
        throw new Error('Invalid refresh token');
      });
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=invalid-token']);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Token refresh failed');
      expect(response.body).toHaveProperty('message', 'Invalid refresh token');
      
      // Check refresh token cookie is cleared
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'].some(cookie => 
        cookie.includes('refreshToken=;')
      )).toBe(true);
    });

    it('should handle expired refresh token', async () => {
      const { refreshAccessToken } = require('../../utils/jwt');
      
      refreshAccessToken.mockImplementation(() => {
        throw new Error('Refresh token expired');
      });
      
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=expired-token']);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Token refresh failed');
      expect(response.body).toHaveProperty('message', 'Refresh token expired');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user info', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      const { getAdminInfo } = require('../../utils/admin');
      
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { userId: 'test-user', username: 'testuser' };
        next();
      });
      
      getAdminInfo.mockReturnValue({
        id: 'admin-001',
        username: 'admin',
        role: 'admin',
        lastLogin: new Date(),
        createdAt: new Date()
      });
      
      const response = await request(app)
        .get('/api/auth/me');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', 'admin-001');
      expect(response.body.user).toHaveProperty('username', 'admin');
      expect(response.body.user).toHaveProperty('role', 'admin');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should require authentication', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      
      const response = await request(app)
        .get('/api/auth/me');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should verify valid token', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = {
          userId: 'test-user',
          username: 'testuser',
          role: 'admin'
        };
        next();
      });
      
      const response = await request(app)
        .post('/api/auth/verify');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', 'test-user');
      expect(response.body.user).toHaveProperty('username', 'testuser');
      expect(response.body.user).toHaveProperty('role', 'admin');
    });

    it('should reject invalid token', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Invalid token' });
      });
      
      const response = await request(app)
        .post('/api/auth/verify');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password successfully', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      const { validateAdminCredentials, updateAdminPassword } = require('../../utils/admin');
      
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { userId: 'test-user', username: 'admin' };
        next();
      });
      
      validateAdminCredentials.mockResolvedValue({ success: true });
      updateAdminPassword.mockResolvedValue({ success: true });
      
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'old-password',
          newPassword: 'new-secure-password'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Password changed successfully');
    });

    it('should validate input', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { userId: 'test-user', username: 'admin' };
        next();
      });
      
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'old',
          newPassword: '123' // Too short
        });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid input');
    });

    it('should reject incorrect current password', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      const { validateAdminCredentials } = require('../../utils/admin');
      
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { userId: 'test-user', username: 'admin' };
        next();
      });
      
      validateAdminCredentials.mockResolvedValue({ success: false });
      
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'wrong-password',
          newPassword: 'new-secure-password'
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Current password is incorrect');
    });

    it('should require authentication', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'old-password',
          newPassword: 'new-password'
        });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('POST /api/auth/revoke-all', () => {
    it('should revoke all user tokens', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      const { revokeAllUserTokens } = require('../../utils/jwt');
      
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { userId: 'test-user', username: 'testuser' };
        next();
      });
      
      revokeAllUserTokens.mockReturnValue(3); // 3 tokens revoked
      
      const response = await request(app)
        .post('/api/auth/revoke-all');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'All sessions revoked successfully');
      expect(response.body).toHaveProperty('revokedCount', 3);
    });

    it('should require authentication', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });
      
      const response = await request(app)
        .post('/api/auth/revoke-all');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return service status', async () => {
      const { getAdminInfo } = require('../../utils/admin');
      
      getAdminInfo.mockReturnValue({
        id: 'admin-001',
        username: 'admin'
      });
      
      const response = await request(app)
        .get('/api/auth/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serviceStatus', 'active');
      expect(response.body).toHaveProperty('adminConfigured', true);
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should show admin not configured', async () => {
      const { getAdminInfo } = require('../../utils/admin');
      
      getAdminInfo.mockReturnValue(null);
      
      const response = await request(app)
        .get('/api/auth/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('adminConfigured', false);
    });
  });
});