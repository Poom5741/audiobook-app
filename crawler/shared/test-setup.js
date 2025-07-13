// Shared test utilities for all services
// This file is loaded in setupFilesAfterEnv

// Global test utilities
global.testUtils = {
  // Create mock request object
  createMockReq: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    get: jest.fn(),
    ...overrides
  }),
  
  // Create mock response object
  createMockRes: () => {
    const res = {
      status: jest.fn(),
      json: jest.fn(),
      send: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      set: jest.fn(),
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
      redirect: jest.fn(),
      end: jest.fn()
    };
    
    // Chain methods
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    res.send.mockReturnValue(res);
    res.cookie.mockReturnValue(res);
    res.clearCookie.mockReturnValue(res);
    res.set.mockReturnValue(res);
    res.setHeader.mockReturnValue(res);
    res.redirect.mockReturnValue(res);
    
    return res;
  },
  
  // Create mock next function
  createMockNext: () => jest.fn(),
  
  // Wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate test data
  generateTestData: {
    user: (overrides = {}) => ({
      id: 'test-user-id',
      username: 'testuser',
      role: 'admin',
      createdAt: new Date(),
      lastLogin: new Date(),
      ...overrides
    }),
    
    book: (overrides = {}) => ({
      id: 'test-book-id',
      title: 'Test Book',
      author: 'Test Author',
      url: 'https://example.com/test-book',
      status: 'pending',
      createdAt: new Date(),
      ...overrides
    }),
    
    audioFile: (overrides = {}) => ({
      id: 'test-audio-id',
      bookId: 'test-book-id',
      chapter: 1,
      filename: 'chapter-1.mp3',
      path: '/audio/test-book/chapter-1.mp3',
      duration: 3600,
      createdAt: new Date(),
      ...overrides
    })
  },
  
  // Database helpers
  db: {
    // Mock database operations
    mockQuery: jest.fn(),
    mockTransaction: jest.fn(),
    
    // Reset database mocks
    reset: () => {
      global.testUtils.db.mockQuery.mockReset();
      global.testUtils.db.mockTransaction.mockReset();
    }
  }
};

// Global test hooks for shared behavior
beforeEach(() => {
  // Reset database mocks
  if (global.testUtils && global.testUtils.db) {
    global.testUtils.db.reset();
  }
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  throw reason;
});

// Increase timeout for integration tests
jest.setTimeout(10000);