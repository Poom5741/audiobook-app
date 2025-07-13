require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');

const { 
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors
} = require('../shared/logger');
const { connectDB } = require('./services/database');
const { initializeQueue } = require('./services/queueService');

// Logger setup
const logger = createLogger('backend-service');
const auditLogger = createAuditLogger('backend-service');
const metricsLogger = createMetricsLogger('backend-service');

// Setup unhandled error logging
logUnhandledErrors('backend-service');

// Import routes
const booksRoutes = require('./routes/books');
const audioRoutes = require('./routes/audio');
const ttsRoutes = require('./routes/tts');
const parsingRoutes = require('./routes/parsing');
const downloadRoutes = require('./routes/downloads');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const healthRoutes = require('./routes/health');

// Security middleware
const {
  securityHeaders,
  securityLogger,
  requestSizeLimit,
  ipAccessControl,
  fileUploadSecurity,
  validateSecurityHeaders
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 5000;

// Request ID middleware (should be first)
app.use(addRequestId);

// Enhanced security middleware with CSP
app.use(securityHeaders());
app.use(validateSecurityHeaders);
app.use(securityLogger);
app.use(requestSizeLimit());
app.use(ipAccessControl());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range']
}));

// Compression
app.use(compression());

// Request parsing
// Request parsing
app.use(requestSizeLimit());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced logging middleware
app.use(createExpressLogger('backend-service'));

// Circuit breaker middleware
const {
  addCircuitBreakerContext,
  serviceResilienceMonitoring,
  circuitBreakerHealthCheck,
  serviceDependencyCheck,
  circuitBreakerErrorHandler,
  createCircuitBreakerAdminRoutes
} = require('./middleware/circuitBreaker');

app.use(addCircuitBreakerContext);
app.use(serviceResilienceMonitoring);

// Enhanced health check with circuit breaker and dependency monitoring
app.get('/health', circuitBreakerHealthCheck, serviceDependencyCheck, (req, res) => {
  const healthData = {
    status: 'ok',
    service: 'audiobook-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    circuitBreakers: req.circuitBreakerHealth,
    dependencies: req.serviceDependencies
  };

  // Determine overall health status
  const isHealthy = req.circuitBreakerHealth.healthy && 
                   req.serviceDependencies.overall === 'healthy';
  
  if (!isHealthy) {
    healthData.status = 'degraded';
    return res.status(503).json(healthData);
  }

  res.json(healthData);
});

// Circuit breaker admin routes
app.use('/api/circuit-breaker', createCircuitBreakerAdminRoutes());

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/parse', parsingRoutes);
app.use('/api/downloads', downloadRoutes);

// File upload routes would use fileUploadSecurity middleware:
// app.use('/api/upload', fileUploadSecurity(), uploadRoutes);

// Static file serving for audio
app.use('/audio', express.static(process.env.AUDIO_PATH || '/audio', {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp3')) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'audio/mpeg');
    }
  }
}));

// Circuit breaker error handling (must come before general error handler)
app.use(circuitBreakerErrorHandler);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    requestId: req.requestId
  });

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: 'Request entity too large',
      requestId: req.requestId 
    });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize services and start server
async function startServer() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Database connected successfully');

    // Initialize queue system
    await initializeQueue();
    logger.info('Queue system initialized');

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Audiobook backend server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Books path: ${process.env.BOOKS_PATH}`);
      logger.info(`Audio path: ${process.env.AUDIO_PATH}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();