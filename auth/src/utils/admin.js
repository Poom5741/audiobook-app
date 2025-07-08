const bcrypt = require('bcryptjs');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// In-memory admin store (in production, use a database)
let adminUser = null;

/**
 * Initialize admin user from environment variables
 */
async function initializeAdmin() {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;
    
    if (!password) {
      logger.error('ADMIN_PASSWORD environment variable is required');
      throw new Error('Admin password not configured');
    }

    if (password.length < 8) {
      logger.error('Admin password must be at least 8 characters long');
      throw new Error('Admin password too weak');
    }

    // Hash the password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    adminUser = {
      id: 'admin-001',
      username: username,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date(),
      lastLogin: null,
      loginAttempts: 0,
      isLocked: false
    };

    logger.info(`Admin user initialized: ${username}`);
    logger.info('Auth service ready to accept requests');
    
    return adminUser;
  } catch (error) {
    logger.error('Failed to initialize admin user:', error);
    throw error;
  }
}

/**
 * Validate admin credentials
 */
async function validateAdminCredentials(username, password) {
  try {
    if (!adminUser) {
      logger.error('Admin user not initialized');
      return { success: false, error: 'Authentication service not ready' };
    }

    if (adminUser.isLocked) {
      logger.warn(`Login attempt on locked admin account: ${username}`);
      return { success: false, error: 'Account is locked due to too many failed attempts' };
    }

    // Check username
    if (adminUser.username !== username) {
      logger.warn(`Invalid username attempt: ${username}`);
      adminUser.loginAttempts++;
      
      // Lock account after 5 failed attempts
      if (adminUser.loginAttempts >= 5) {
        adminUser.isLocked = true;
        logger.warn(`Admin account locked due to failed attempts: ${username}`);
      }
      
      return { success: false, error: 'Invalid credentials' };
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, adminUser.password);
    
    if (!isPasswordValid) {
      logger.warn(`Invalid password attempt for user: ${username}`);
      adminUser.loginAttempts++;
      
      // Lock account after 5 failed attempts
      if (adminUser.loginAttempts >= 5) {
        adminUser.isLocked = true;
        logger.warn(`Admin account locked due to failed attempts: ${username}`);
      }
      
      return { success: false, error: 'Invalid credentials' };
    }

    // Successful login - reset attempts and update last login
    adminUser.loginAttempts = 0;
    adminUser.isLocked = false;
    adminUser.lastLogin = new Date();
    
    logger.info(`Successful admin login: ${username}`);
    
    return { 
      success: true, 
      user: {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        lastLogin: adminUser.lastLogin
      }
    };
  } catch (error) {
    logger.error('Error validating admin credentials:', error);
    return { success: false, error: 'Authentication error' };
  }
}

/**
 * Get admin user info (without password)
 */
function getAdminInfo() {
  if (!adminUser) {
    return null;
  }
  
  return {
    id: adminUser.id,
    username: adminUser.username,
    role: adminUser.role,
    createdAt: adminUser.createdAt,
    lastLogin: adminUser.lastLogin,
    loginAttempts: adminUser.loginAttempts,
    isLocked: adminUser.isLocked
  };
}

/**
 * Update admin password
 */
async function updateAdminPassword(newPassword) {
  try {
    if (!adminUser) {
      throw new Error('Admin user not initialized');
    }

    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    adminUser.password = hashedPassword;
    logger.info('Admin password updated successfully');
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to update admin password:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unlock admin account (for emergencies)
 */
function unlockAdminAccount() {
  if (adminUser) {
    adminUser.isLocked = false;
    adminUser.loginAttempts = 0;
    logger.info('Admin account unlocked');
    return { success: true };
  }
  return { success: false, error: 'Admin user not found' };
}

module.exports = {
  initializeAdmin,
  validateAdminCredentials,
  getAdminInfo,
  updateAdminPassword,
  unlockAdminAccount
};