// Mock implementation of shared logger for testing

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockAuditLogger = {
  logActivity: jest.fn(),
  logSecurityEvent: jest.fn(),
  logDataAccess: jest.fn()
};

const mockMetricsLogger = {
  logPerformance: jest.fn(),
  logBusinessMetric: jest.fn(),
  logResourceUsage: jest.fn()
};

const createLogger = jest.fn(() => mockLogger);
const createAuditLogger = jest.fn(() => mockAuditLogger);
const createMetricsLogger = jest.fn(() => mockMetricsLogger);

const createExpressLogger = jest.fn(() => (req, res, next) => {
  // Mock express logger middleware
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(body) {
    const duration = Date.now() - start;
    mockLogger.info('HTTP request completed', {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      requestId: req.requestId
    });
    return originalSend.call(this, body);
  };
  
  next();
});

const addRequestId = jest.fn((req, res, next) => {
  req.requestId = req.get('X-Request-ID') || 'test-request-id-' + Math.random().toString(36).substr(2, 9);
  res.set('X-Request-ID', req.requestId);
  next();
});

const logUnhandledErrors = jest.fn((service) => {
  // Mock unhandled error logging setup
  mockLogger.debug(`Unhandled error logging setup for service: ${service}`);
});

const sanitizeLogData = jest.fn((data) => {
  // Mock sanitization - in tests, just return the data as-is
  return data;
});

module.exports = {
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors,
  sanitizeLogData,
  
  // Export the mock instances for test assertions
  mockLogger,
  mockAuditLogger,
  mockMetricsLogger
};