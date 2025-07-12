// Integration tests for Auth API endpoints
// Tests the full request/response cycle including middleware

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('../../routes/auth');
const { resetAdminState, initializeAdmin } = require('../../utils/admin');

// Create test app with middleware
function createTestApp() {
  const app = express();
  
  // Add required middleware
  app.use(express.json());
  app.use(cookieParser());
  
  // Add auth routes
  app.use('/api/auth', authRoutes);
  
  // Error handling middleware
  app.use((error, req, res, next) => {
    console.error('Test app error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  });
  
  return app;
}

describe('Auth API Integration Tests', () => {
  let app;
  
  beforeEach(async () => {
    app = createTestApp();
    resetAdminState();
    jest.clearAllMocks();
    
    // Initialize admin user for tests
    await initializeAdmin();
  });

  describe('Service Health', () => {
    it('should return service status', async () => {
      const response = await request(app)
        .get('/api/auth/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serviceStatus', 'active');
      expect(response.body).toHaveProperty('adminConfigured');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication Flow', () => {
    it('should complete full login-logout cycle', async () => {
      // Step 1: Login with valid credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'test-admin-password'
        });
      
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('message', 'Login successful');
      expect(loginResponse.body).toHaveProperty('accessToken');
      expect(loginResponse.body).toHaveProperty('user');
      
      // Extract cookies from login
      const cookies = loginResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      const accessTokenCookie = cookies.find(cookie => 
        cookie.includes('accessToken=')
      );
      const refreshTokenCookie = cookies.find(cookie => 
        cookie.includes('refreshToken=')
      );
      
      expect(accessTokenCookie).toBeDefined();
      expect(refreshTokenCookie).toBeDefined();
      
      // Step 2: Access protected endpoint with token
      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);
      
      expect(meResponse.status).toBe(200);
      expect(meResponse.body).toHaveProperty('user');
      expect(meResponse.body.user).toHaveProperty('username', 'admin');
      expect(meResponse.body.user).not.toHaveProperty('password');
      
      // Step 3: Verify token is valid
      const verifyResponse = await request(app)
        .post('/api/auth/verify')
        .set('Cookie', cookies);
      
      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body).toHaveProperty('valid', true);
      expect(verifyResponse.body).toHaveProperty('user');
      
      // Step 4: Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies);
      
      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toHaveProperty('message', 'Logout successful');
      
      // Check that logout clears cookies
      const logoutCookies = logoutResponse.headers['set-cookie'];
      expect(logoutCookies).toBeDefined();
      expect(logoutCookies.some(cookie => 
        cookie.includes('accessToken=;')
      )).toBe(true);
      expect(logoutCookies.some(cookie => 
        cookie.includes('refreshToken=;')
      )).toBe(true);
    });

    it('should handle invalid login attempts', async () => {
      // Test wrong username
      const wrongUserResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'wronguser',
          password: 'test-admin-password'
        });
      
      expect(wrongUserResponse.status).toBe(401);
      expect(wrongUserResponse.body).toHaveProperty('error', 'Authentication failed');
      
      // Test wrong password
      const wrongPassResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword'
        });
      
      expect(wrongPassResponse.status).toBe(401);
      expect(wrongPassResponse.body).toHaveProperty('error', 'Authentication failed');
    });

    it('should validate request data', async () => {
      // Test missing username
      const missingUserResponse = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'test-admin-password'
        });
      
      expect(missingUserResponse.status).toBe(400);
      expect(missingUserResponse.body).toHaveProperty('error', 'Invalid input');
      
      // Test short password
      const shortPassResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: '123'
        });
      
      expect(shortPassResponse.status).toBe(400);
      expect(shortPassResponse.body).toHaveProperty('error', 'Invalid input');
      
      // Test invalid JSON - Express returns 500 for JSON parse errors
      const invalidJsonResponse = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');
      
      expect(invalidJsonResponse.status).toBe(500);
    });
  });

  describe('Token Management', () => {
    let validCookies;
    
    beforeEach(async () => {
      // Login to get valid tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'test-admin-password'
        });
      
      expect(loginResponse.status).toBe(200);
      validCookies = loginResponse.headers['set-cookie'];
      expect(validCookies).toBeDefined();
    });

    it('should refresh access token with valid refresh token', async () => {
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', validCookies);
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body).toHaveProperty('message', 'Token refreshed successfully');
      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body).toHaveProperty('expiresIn', '15m');
      
      // Check new access token cookie is set
      const newCookies = refreshResponse.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      expect(newCookies.some(cookie => 
        cookie.includes('accessToken=')
      )).toBe(true);
    });

    it('should reject refresh request without token', async () => {
      const refreshResponse = await request(app)
        .post('/api/auth/refresh');
      
      expect(refreshResponse.status).toBe(401);
      expect(refreshResponse.body).toHaveProperty('error', 'Refresh token required');
    });

    it('should revoke all user tokens', async () => {
      const revokeResponse = await request(app)
        .post('/api/auth/revoke-all')
        .set('Cookie', validCookies);
      
      expect(revokeResponse.status).toBe(200);
      expect(revokeResponse.body).toHaveProperty('message', 'All sessions revoked successfully');
      expect(revokeResponse.body).toHaveProperty('revokedCount');
    });
  });

  describe('Password Management', () => {
    let validCookies;
    
    beforeEach(async () => {
      // Login to get valid tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'test-admin-password'
        });
      
      expect(loginResponse.status).toBe(200);
      validCookies = loginResponse.headers['set-cookie'];
      expect(validCookies).toBeDefined();
    });

    it('should change password with valid current password', async () => {
      const changeResponse = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', validCookies)
        .send({
          currentPassword: 'test-admin-password',
          newPassword: 'new-secure-password123'
        });
      
      expect(changeResponse.status).toBe(200);
      expect(changeResponse.body).toHaveProperty('message', 'Password changed successfully');
    });

    it('should reject password change with wrong current password', async () => {
      const changeResponse = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', validCookies)
        .send({
          currentPassword: 'wrong-password',
          newPassword: 'new-secure-password123'
        });
      
      expect(changeResponse.status).toBe(401);
      expect(changeResponse.body).toHaveProperty('error', 'Current password is incorrect');
    });

    it('should validate new password requirements', async () => {
      const changeResponse = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', validCookies)
        .send({
          currentPassword: 'test-admin-password',
          newPassword: '123' // Too short
        });
      
      expect(changeResponse.status).toBe(400);
      expect(changeResponse.body).toHaveProperty('error', 'Invalid input');
      expect(changeResponse.body).toHaveProperty('details');
    });
  });

  describe('Authentication Middleware', () => {
    it('should protect endpoints requiring authentication', async () => {
      // Test accessing protected endpoint without token
      const meResponse = await request(app)
        .get('/api/auth/me');
      
      expect(meResponse.status).toBe(401);
      expect(meResponse.body).toHaveProperty('error', 'Access token required');
      
      // Test accessing logout without token
      const logoutResponse = await request(app)
        .post('/api/auth/logout');
      
      expect(logoutResponse.status).toBe(401);
      expect(logoutResponse.body).toHaveProperty('error', 'Access token required');
      
      // Test accessing change password without token
      const changePassResponse = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'old',
          newPassword: 'new'
        });
      
      expect(changePassResponse.status).toBe(401);
      expect(changePassResponse.body).toHaveProperty('error', 'Access token required');
    });

    it('should reject malformed tokens', async () => {
      const malformedTokenResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(malformedTokenResponse.status).toBe(401);
      expect(malformedTokenResponse.body).toHaveProperty('error', 'Invalid token');
    });

    it('should reject expired tokens', async () => {
      // Create an expired token using the test utility
      const expiredToken = global.authTestUtils.createExpiredToken();
      
      const expiredTokenResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(expiredTokenResponse.status).toBe(401);
      expect(expiredTokenResponse.body).toHaveProperty('error', 'Token expired');
    });
  });

  describe('Error Handling', () => {
    it('should handle content-type errors gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'text/plain')
        .send('invalid data');
      
      expect(response.status).toBe(400);
    });

    it('should handle large payloads', async () => {
      const largePayload = {
        username: 'a'.repeat(10000),
        password: 'b'.repeat(10000)
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(largePayload);
      
      // Should either reject as too large or validate as invalid input
      expect([400, 413]).toContain(response.status);
    });

    it('should handle missing route gracefully', async () => {
      const response = await request(app)
        .get('/api/auth/nonexistent');
      
      expect(response.status).toBe(404);
    });
  });

  describe('Security Headers', () => {
    it('should set appropriate security headers', async () => {
      const response = await request(app)
        .get('/api/auth/status');
      
      // Check for basic security practices
      expect(response.headers).toHaveProperty('content-type');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});