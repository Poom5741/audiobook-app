// Auth service specific test setup - mocks only (loaded in setupFiles)

// Load shared test mocks first
require('../../../shared/test-mocks');

// Mock Redis for rate limiting (conditionally)
try {
  require.resolve('redis');
  jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn()
    }))
  }));
} catch (e) {
  // redis not available, skip mocking
}

// Mock rate-limiter-flexible
jest.mock('rate-limiter-flexible', () => ({
  RateLimiterMemory: jest.fn().mockImplementation((options) => ({
    consume: jest.fn().mockResolvedValue({ remainingPoints: 4, msBeforeNext: 0 }),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    points: options.points || 5,
    keyGenerator: options.keyGenerator
  })),
  RateLimiterRedis: jest.fn().mockImplementation((options) => ({
    consume: jest.fn().mockResolvedValue({ remainingPoints: 4, msBeforeNext: 0 }),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    points: options.points || 5,
    keyGenerator: options.keyGenerator
  }))
}));

// Auth service specific test utilities
global.authTestUtils = {
  // Create valid JWT token for testing
  createTestToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    const defaultPayload = {
      userId: 'test-user-id',
      username: 'testuser',
      role: 'admin',
      type: 'access'
    };
    
    return jwt.sign(
      { ...defaultPayload, ...payload },
      process.env.JWT_SECRET,
      { expiresIn: '1h', issuer: 'audiobook-auth', audience: 'audiobook-app' }
    );
  },
  
  // Create refresh token for testing
  createTestRefreshToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    const defaultPayload = {
      userId: 'test-user-id',
      username: 'testuser',
      type: 'refresh',
      tokenId: 'test-token-id'
    };
    
    return jwt.sign(
      { ...defaultPayload, ...payload },
      process.env.JWT_SECRET,
      { expiresIn: '7d', issuer: 'audiobook-auth', audience: 'audiobook-app' }
    );
  },
  
  // Create expired token for testing
  createExpiredToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    const defaultPayload = {
      userId: 'test-user-id',
      username: 'testuser',
      role: 'admin',
      type: 'access'
    };
    
    return jwt.sign(
      { ...defaultPayload, ...payload },
      process.env.JWT_SECRET,
      { expiresIn: '0s', issuer: 'audiobook-auth', audience: 'audiobook-app' }
    );
  },
  
  // Create invalid token
  createInvalidToken: () => {
    return 'invalid.jwt.token';
  },
  
  // Mock admin user data
  mockAdminUser: {
    id: 'admin-001',
    username: 'admin',
    password: '$2a$12$test.hash.password', // Mock bcrypt hash
    role: 'admin',
    createdAt: new Date(),
    lastLogin: null,
    loginAttempts: 0,
    isLocked: false
  },
  
  // Create mock request with auth
  createAuthenticatedReq: (overrides = {}) => {
    const token = global.authTestUtils.createTestToken();
    return global.testUtils.createMockReq({
      headers: {
        authorization: `Bearer ${token}`
      },
      user: {
        userId: 'test-user-id',
        username: 'testuser',
        role: 'admin'
      },
      ...overrides
    });
  },
  
  // Create rate limit error
  createRateLimitError: (msBeforeNext = 60000) => ({
    msBeforeNext,
    remainingPoints: 0,
    totalPoints: 5,
    key: 'test-key'
  })
};

// Global test hooks - can only be defined after Jest is initialized
if (typeof global !== 'undefined' && global.beforeEach) {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    // Restore console methods
    console.log.mockRestore?.();
    console.error.mockRestore?.();
    console.warn.mockRestore?.();
  });
}

// Mock bcrypt for consistent testing
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$mock.hashed.password'),
  compare: jest.fn().mockImplementation((plain, hash) => {
    // Mock successful comparison for specific test passwords
    if (plain === 'correct-password' || plain === 'test-admin-password') {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }),
  genSalt: jest.fn().mockResolvedValue('$2a$12$mock.salt'),
  getRounds: jest.fn().mockReturnValue(12)
}));

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

