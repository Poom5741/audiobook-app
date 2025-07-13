// Backend service test setup

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Service URLs for testing
process.env.AUTH_SERVICE_URL = 'http://localhost:8002';
process.env.PARSER_SERVICE_URL = 'http://localhost:3002';
process.env.CRAWLER_SERVICE_URL = 'http://localhost:3001';
process.env.TTS_SERVICE_URL = 'http://localhost:8000';
process.env.SUMMARIZER_API_URL = 'http://localhost:8001';

// Mock database pool
jest.mock('../services/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    options: { max: 20, min: 5 }
  },
  connectDB: jest.fn(),
  executeQuery: jest.fn(),
  getPoolStats: jest.fn(() => ({
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    maxConnections: 20,
    minConnections: 5
  })),
  healthCheck: jest.fn()
}));

// Mock queue service
jest.mock('../services/queueService', () => ({
  addTTSJob: jest.fn(),
  getTTSQueue: jest.fn(() => ({
    getWaiting: jest.fn(() => []),
    getActive: jest.fn(() => []),
    getCompleted: jest.fn(() => []),
    getFailed: jest.fn(() => []),
    getJobs: jest.fn(() => [])
  })),
  initializeQueue: jest.fn()
}));

// Global test utilities
global.testUtils = {
  // Create mock request
  createMockReq: (overrides = {}) => ({
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    ip: '127.0.0.1',
    get: jest.fn((header) => {
      const headers = {
        'User-Agent': 'test-agent',
        'X-Request-ID': 'test-request-id',
        ...overrides.headers
      };
      return headers[header];
    }),
    body: {},
    params: {},
    query: {},
    requestId: 'test-request-id',
    ...overrides
  }),
  
  // Create mock response
  createMockRes: (overrides = {}) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      statusCode: 200,
      ...overrides
    };
    return res;
  },
  
  // Create mock next function
  createMockNext: () => jest.fn(),
  
  // Create mock circuit breaker context
  createMockCircuitBreakerContext: () => ({
    callService: jest.fn(),
    healthCheck: jest.fn(),
    getStats: jest.fn(() => ({}))
  })
};

// Global test hooks
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