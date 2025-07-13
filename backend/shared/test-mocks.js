// Shared test mocks for all services
// This file is loaded in setupFiles (before Jest globals are available)

const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-minimum-64-characters-long';
process.env.POSTGRES_PASSWORD = 'test-password';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.REDIS_PASSWORD = 'test-redis-password';

// Database configuration for tests
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'test_user';
process.env.POSTGRES_DB = 'test_audiobook_db';

// Redis configuration for tests
process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use database 1 for tests

// Disable logging during tests unless explicitly enabled
if (!process.env.TEST_VERBOSE) {
  try {
    const winston = require('winston');
    winston.configure({
      level: 'error',
      transports: [
        new winston.transports.Console({
          silent: true
        })
      ]
    });
  } catch (e) {
    // winston not available, skip logging configuration
  }
}

// Mock external services by default (conditionally)
try {
  require.resolve('axios');
  jest.mock('axios', () => ({
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    })),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }));
} catch (e) {
  // axios not available, skip mocking
}

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn()
}));

