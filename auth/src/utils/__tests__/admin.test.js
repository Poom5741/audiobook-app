// Tests for Admin utility functions

const bcrypt = require('bcryptjs');
const { 
  initializeAdmin, 
  validateAdminCredentials, 
  getAdminInfo, 
  updateAdminPassword,
  unlockAdminAccount,
  resetAdminState
} = require('../admin');

describe('Admin Utilities', () => {
  beforeEach(() => {
    // Reset admin user state
    jest.clearAllMocks();
    resetAdminState();
    
    // Reset environment variables
    process.env.ADMIN_USERNAME = 'testadmin';
    process.env.ADMIN_PASSWORD = 'test-admin-password';
  });

  describe('initializeAdmin', () => {
    it('should initialize admin user with valid password', async () => {
      const adminUser = await initializeAdmin();
      
      expect(adminUser).toHaveProperty('id');
      expect(adminUser).toHaveProperty('username', 'testadmin');
      expect(adminUser).toHaveProperty('password');
      expect(adminUser).toHaveProperty('role', 'admin');
      expect(adminUser).toHaveProperty('createdAt');
      expect(adminUser).toHaveProperty('lastLogin', null);
      expect(adminUser).toHaveProperty('loginAttempts', 0);
      expect(adminUser).toHaveProperty('isLocked', false);
      
      // Password should be hashed
      expect(adminUser.password).not.toBe('test-admin-password');
      expect(bcrypt.hash).toHaveBeenCalledWith('test-admin-password', 12);
    });

    it('should use default username when not provided', async () => {
      delete process.env.ADMIN_USERNAME;
      
      const adminUser = await initializeAdmin();
      expect(adminUser.username).toBe('admin');
    });

    it('should throw error when password is not provided', async () => {
      // Mock loadSecret to return null
      const { loadSecret } = require('../../../../shared/secrets-loader');
      loadSecret.mockReturnValueOnce(null);
      
      await expect(initializeAdmin()).rejects.toThrow('Admin password not configured');
    });

    it('should throw error when password is too short', async () => {
      process.env.ADMIN_PASSWORD = '123'; // Too short
      
      await expect(initializeAdmin()).rejects.toThrow('Admin password too weak');
    });

    it('should handle bcrypt hashing errors', async () => {
      bcrypt.hash.mockRejectedValueOnce(new Error('Hashing failed'));
      
      await expect(initializeAdmin()).rejects.toThrow('Hashing failed');
    });
  });

  describe('validateAdminCredentials', () => {
    beforeEach(async () => {
      // Initialize admin before each test
      await initializeAdmin();
    });

    it('should validate correct credentials', async () => {
      bcrypt.compare.mockResolvedValueOnce(true);
      
      const result = await validateAdminCredentials('testadmin', 'test-admin-password');
      
      expect(result.success).toBe(true);
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('username', 'testadmin');
      expect(result.user).toHaveProperty('role', 'admin');
      expect(result.user).toHaveProperty('lastLogin');
    });

    it('should reject incorrect username', async () => {
      const result = await validateAdminCredentials('wronguser', 'test-admin-password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should reject incorrect password', async () => {
      bcrypt.compare.mockResolvedValueOnce(false);
      
      const result = await validateAdminCredentials('testadmin', 'wrongpassword');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should increment login attempts on failed authentication', async () => {
      bcrypt.compare.mockResolvedValueOnce(false);
      
      await validateAdminCredentials('testadmin', 'wrongpassword');
      
      const adminInfo = getAdminInfo();
      expect(adminInfo.loginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      bcrypt.compare.mockResolvedValue(false);
      
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await validateAdminCredentials('testadmin', 'wrongpassword');
      }
      
      const adminInfo = getAdminInfo();
      expect(adminInfo.isLocked).toBe(true);
      expect(adminInfo.loginAttempts).toBe(5);
    });

    it('should reject login when account is locked', async () => {
      // Lock the account first
      bcrypt.compare.mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        await validateAdminCredentials('testadmin', 'wrongpassword');
      }
      
      // Try to login with correct credentials
      bcrypt.compare.mockResolvedValueOnce(true);
      const result = await validateAdminCredentials('testadmin', 'test-admin-password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is locked due to too many failed attempts');
    });

    it('should reset login attempts on successful login', async () => {
      // First make some failed attempts
      bcrypt.compare.mockResolvedValueOnce(false);
      await validateAdminCredentials('testadmin', 'wrongpassword');
      
      // Then succeed
      bcrypt.compare.mockResolvedValueOnce(true);
      const result = await validateAdminCredentials('testadmin', 'test-admin-password');
      
      expect(result.success).toBe(true);
      
      const adminInfo = getAdminInfo();
      expect(adminInfo.loginAttempts).toBe(0);
      expect(adminInfo.isLocked).toBe(false);
    });

    it('should return error when admin is not initialized', async () => {
      // Clear the admin user (simulate uninitialized state)
      jest.resetModules();
      const { validateAdminCredentials: uninitValidate } = require('../admin');
      
      const result = await uninitValidate('testadmin', 'password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication service not ready');
    });

    it('should handle bcrypt comparison errors', async () => {
      bcrypt.compare.mockRejectedValueOnce(new Error('Comparison failed'));
      
      const result = await validateAdminCredentials('testadmin', 'test-admin-password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication error');
    });
  });

  describe('getAdminInfo', () => {
    it('should return admin info without password', async () => {
      await initializeAdmin();
      
      const adminInfo = getAdminInfo();
      
      expect(adminInfo).toHaveProperty('id');
      expect(adminInfo).toHaveProperty('username');
      expect(adminInfo).toHaveProperty('role');
      expect(adminInfo).toHaveProperty('createdAt');
      expect(adminInfo).toHaveProperty('lastLogin');
      expect(adminInfo).toHaveProperty('loginAttempts');
      expect(adminInfo).toHaveProperty('isLocked');
      expect(adminInfo).not.toHaveProperty('password');
    });

    it('should return null when admin is not initialized', () => {
      const adminInfo = getAdminInfo();
      expect(adminInfo).toBeNull();
    });
  });

  describe('updateAdminPassword', () => {
    beforeEach(async () => {
      await initializeAdmin();
    });

    it('should update admin password successfully', async () => {
      const newPassword = 'new-secure-password';
      bcrypt.hash.mockResolvedValueOnce('new-hashed-password');
      
      const result = await updateAdminPassword(newPassword);
      
      expect(result.success).toBe(true);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
    });

    it('should reject password that is too short', async () => {
      const result = await updateAdminPassword('123');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
    });

    it('should handle hashing errors', async () => {
      bcrypt.hash.mockRejectedValueOnce(new Error('Hashing failed'));
      
      const result = await updateAdminPassword('new-secure-password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Hashing failed');
    });

    it('should throw error when admin is not initialized', async () => {
      // Clear admin user
      jest.resetModules();
      const { updateAdminPassword: uninitUpdate } = require('../admin');
      
      const result = await uninitUpdate('new-password');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin user not initialized');
    });
  });

  describe('unlockAdminAccount', () => {
    beforeEach(async () => {
      await initializeAdmin();
    });

    it('should unlock locked admin account', async () => {
      // First lock the account
      bcrypt.compare.mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        await validateAdminCredentials('testadmin', 'wrongpassword');
      }
      
      // Verify it's locked
      let adminInfo = getAdminInfo();
      expect(adminInfo.isLocked).toBe(true);
      
      // Unlock it
      const result = unlockAdminAccount();
      
      expect(result.success).toBe(true);
      
      // Verify it's unlocked
      adminInfo = getAdminInfo();
      expect(adminInfo.isLocked).toBe(false);
      expect(adminInfo.loginAttempts).toBe(0);
    });

    it('should return false when admin user not found', () => {
      // Clear admin user
      jest.resetModules();
      const { unlockAdminAccount: uninitUnlock } = require('../admin');
      
      const result = uninitUnlock();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Admin user not found');
    });
  });
});