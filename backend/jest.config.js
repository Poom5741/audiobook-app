// Jest configuration for Backend Service

module.exports = {
  // Service-specific configuration
  displayName: 'Backend Service',
  rootDir: '.',
  
  // Test environment for backend service
  testEnvironment: 'node',
  
  // Module mapping for mocks
  moduleNameMapper: {
    '^../../../../shared/logger$': '<rootDir>/src/__mocks__/logger.js'
  },
  
  // Test patterns
  testMatch: [
    '**/__tests__/**/*.(js|ts)',
    '**/*.(test|spec).(js|ts)'
  ],
  
  // Coverage configuration specific to backend service
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/**/*.test.{js,ts}',
    '!src/**/*.spec.{js,ts}',
    '!src/server.js' // Exclude main entry point from coverage
  ],
  
  // Lower coverage thresholds initially for backend service
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  
  // Specific timeout for backend tests
  testTimeout: 10000,
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ]
};