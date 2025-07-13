const fs = require('fs');
const path = require('path');

/**
 * Load secret from Docker secret file or environment variable
 * Docker secrets are mounted as files in /run/secrets/
 * This function checks for a file first, then falls back to env var
 */
function loadSecret(name, options = {}) {
  const { required = true, defaultValue = null } = options;
  
  // Check for Docker secret file first
  const secretFilePath = process.env[`${name}_FILE`];
  if (secretFilePath) {
    try {
      const secret = fs.readFileSync(secretFilePath, 'utf8').trim();
      if (secret) {
        return secret;
      }
    } catch (error) {
      if (required) {
        throw new Error(`Failed to read secret file for ${name}: ${error.message}`);
      }
      console.warn(`Warning: Could not read secret file for ${name}: ${error.message}`);
    }
  }
  
  // Fall back to environment variable
  const envValue = process.env[name];
  if (envValue) {
    return envValue;
  }
  
  // Use default value if provided
  if (defaultValue !== null) {
    if (process.env.NODE_ENV === 'production' && required) {
      console.warn(`Warning: Using default value for required secret ${name} in production`);
    }
    return defaultValue;
  }
  
  // Throw error if required and not found
  if (required) {
    throw new Error(`Required secret ${name} not found in environment or secret file`);
  }
  
  return null;
}

/**
 * Validate that a secret meets minimum security requirements
 */
function validateSecret(name, value, options = {}) {
  const { minLength = 32, pattern = null } = options;
  
  if (!value) {
    throw new Error(`Secret ${name} is empty`);
  }
  
  if (value.length < minLength) {
    throw new Error(`Secret ${name} is too short (minimum ${minLength} characters)`);
  }
  
  if (pattern && !pattern.test(value)) {
    throw new Error(`Secret ${name} does not match required pattern`);
  }
  
  // Check for common weak values
  const weakValues = ['password', '12345', 'secret', 'your-secret-key-here', 'audiobook123'];
  if (weakValues.some(weak => value.toLowerCase().includes(weak))) {
    throw new Error(`Secret ${name} contains weak or default values`);
  }
  
  return true;
}

/**
 * Load all required secrets for a service
 */
function loadServiceSecrets(service) {
  const secrets = {};
  
  switch (service) {
    case 'auth':
      secrets.JWT_SECRET = loadSecret('JWT_SECRET');
      secrets.POSTGRES_PASSWORD = loadSecret('POSTGRES_PASSWORD');
      secrets.ADMIN_PASSWORD = loadSecret('ADMIN_PASSWORD', { defaultValue: null });
      
      // Validate in production
      if (process.env.NODE_ENV === 'production') {
        validateSecret('JWT_SECRET', secrets.JWT_SECRET, { minLength: 64 });
        validateSecret('POSTGRES_PASSWORD', secrets.POSTGRES_PASSWORD);
        if (secrets.ADMIN_PASSWORD) {
          validateSecret('ADMIN_PASSWORD', secrets.ADMIN_PASSWORD);
        }
      }
      break;
      
    case 'backend':
      secrets.JWT_SECRET = loadSecret('JWT_SECRET');
      secrets.POSTGRES_PASSWORD = loadSecret('POSTGRES_PASSWORD');
      secrets.REDIS_PASSWORD = loadSecret('REDIS_PASSWORD', { required: false });
      
      if (process.env.NODE_ENV === 'production') {
        validateSecret('JWT_SECRET', secrets.JWT_SECRET, { minLength: 64 });
        validateSecret('POSTGRES_PASSWORD', secrets.POSTGRES_PASSWORD);
      }
      break;
      
    case 'frontend':
      secrets.JWT_SECRET = loadSecret('JWT_SECRET');
      
      if (process.env.NODE_ENV === 'production') {
        validateSecret('JWT_SECRET', secrets.JWT_SECRET, { minLength: 64 });
      }
      break;
      
    default:
      throw new Error(`Unknown service: ${service}`);
  }
  
  return secrets;
}

/**
 * Build database URL with secret password
 */
function buildDatabaseUrl(options = {}) {
  const {
    host = process.env.POSTGRES_HOST || 'postgres',
    port = process.env.POSTGRES_PORT || 5432,
    user = process.env.POSTGRES_USER || 'audiobook_user',
    database = process.env.POSTGRES_DB || 'audiobook_db'
  } = options;
  
  const password = loadSecret('POSTGRES_PASSWORD');
  
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

/**
 * Build Redis URL with secret password
 */
function buildRedisUrl(options = {}) {
  const {
    host = process.env.REDIS_HOST || 'redis',
    port = process.env.REDIS_PORT || 6379
  } = options;
  
  const password = loadSecret('REDIS_PASSWORD', { required: false });
  
  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }
  
  return `redis://${host}:${port}`;
}

module.exports = {
  loadSecret,
  validateSecret,
  loadServiceSecrets,
  buildDatabaseUrl,
  buildRedisUrl
};