const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { 
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors
} = require('../../../shared/logger');
const { 
  createRateLimitMiddleware, 
  detectSuspiciousActivity,
  createTrustedIPMiddleware
} = require('./middleware/rateLimiting');

// Routes
const authRoutes = require('./routes/auth');

// Utils
const { initializeAdmin } = require('./utils/admin');

// Logger setup
const logger = createLogger('auth-service');
const auditLogger = createAuditLogger('auth-service');
const metricsLogger = createMetricsLogger('auth-service');

// Setup unhandled error logging
logUnhandledErrors('auth-service');

// Enhanced rate limiting middlewares
const generalRateLimit = createRateLimitMiddleware('general');
const loginRateLimit = createRateLimitMiddleware('login');
const passwordChangeRateLimit = createRateLimitMiddleware('passwordChange');
const tokenRefreshRateLimit = createRateLimitMiddleware('tokenRefresh');

// Trusted IPs (load from environment or config)
const trustedIPs = (process.env.TRUSTED_IPS || '').split(',').filter(Boolean);
const trustedIPMiddleware = createTrustedIPMiddleware(trustedIPs);

const app = express();
const PORT = process.env.PORT || 8002;

// Request ID middleware (should be first)
app.use(addRequestId);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Environment-based CORS configuration
const getAllowedOrigins = () => {
  const baseOrigins = [];
  
  // Development origins
  if (process.env.NODE_ENV === 'development') {
    baseOrigins.push(
      'http://localhost:3000',
      'http://localhost:5001', 
      'http://localhost:3002'
    );
  }
  
  // Production origins from environment
  if (process.env.FRONTEND_URLS) {
    const prodOrigins = process.env.FRONTEND_URLS.split(',').map(url => url.trim());
    baseOrigins.push(...prodOrigins);
  }
  
  // Legacy support
  if (process.env.FRONTEND_URL) {
    baseOrigins.push(process.env.FRONTEND_URL);
  }
  
  return baseOrigins.filter(Boolean);
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS rejected origin: ${origin}`, {
        allowedOrigins,
        ip: origin
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply security middlewares
app.use(trustedIPMiddleware);
app.use(detectSuspiciousActivity);
app.use((req, res, next) => {
  // Skip rate limiting for trusted IPs
  if (req.trustedIP) {
    return next();
  }
  generalRateLimit(req, res, next);
});

// Enhanced rate limiting for specific endpoints
app.use('/api/auth/login', (req, res, next) => {
  if (req.trustedIP) {return next();}
  loginRateLimit(req, res, next);
});

app.use('/api/auth/change-password', (req, res, next) => {
  if (req.trustedIP) {return next();}
  passwordChangeRateLimit(req, res, next);
});

app.use('/api/auth/refresh', (req, res, next) => {
  if (req.trustedIP) {return next();}
  tokenRefreshRateLimit(req, res, next);
});

// Enhanced logging middleware
app.use(createExpressLogger('auth-service'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'audiobook-auth',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip
  });
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    ...(isDevelopment && { stack: error.stack })
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize admin user and start server
async function startServer() {
  try {
    await initializeAdmin();
    
    app.listen(PORT, () => {
      logger.info(`🔐 Audiobook Auth Service running on port ${PORT}`);
      logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔑 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;