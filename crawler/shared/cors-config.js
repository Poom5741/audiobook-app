const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins() {
  const baseOrigins = [];
  
  // Development origins
  if (process.env.NODE_ENV === 'development') {
    baseOrigins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
      'http://localhost:5001',
      'http://localhost:8002'
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
  
  // API Gateway URLs
  if (process.env.API_GATEWAY_URLS) {
    const gatewayOrigins = process.env.API_GATEWAY_URLS.split(',').map(url => url.trim());
    baseOrigins.push(...gatewayOrigins);
  }
  
  return [...new Set(baseOrigins.filter(Boolean))]; // Remove duplicates
}

/**
 * Create CORS configuration for a service
 */
function createCorsConfig(serviceName = 'service', customOptions = {}) {
  const defaultOptions = {
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      
      // Allow requests with no origin in development (mobile apps, Postman, etc.)
      if (!origin && process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // Allow same-origin requests
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`${serviceName}: CORS rejected origin: ${origin}`, {
          allowedOrigins,
          origin,
          serviceName
        });
        callback(new Error(`${serviceName}: Origin not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-File-Name'
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining', 
      'X-RateLimit-Reset',
      'Content-Range',
      'X-Content-Range'
    ],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200 // For legacy browser support
  };
  
  return {
    ...defaultOptions,
    ...customOptions
  };
}

/**
 * Create CORS middleware with logging
 */
function createCorsMiddleware(serviceName, customOptions = {}) {
  const corsConfig = createCorsConfig(serviceName, customOptions);
  
  return (req, res, next) => {
    // Log CORS requests in development
    if (process.env.NODE_ENV === 'development' && req.method === 'OPTIONS') {
      logger.debug(`${serviceName}: CORS preflight from ${req.headers.origin}`);
    }
    
    // Apply CORS
    corsConfig.origin(req.headers.origin, (err, allowed) => {
      if (err) {
        return res.status(403).json({
          error: 'CORS Error',
          message: err.message
        });
      }
      
      if (allowed) {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', corsConfig.credentials);
        res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
        res.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
        res.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
        res.header('Access-Control-Max-Age', corsConfig.maxAge);
        
        if (req.method === 'OPTIONS') {
          return res.status(corsConfig.optionsSuccessStatus).end();
        }
      }
      
      next();
    });
  };
}

/**
 * Security headers middleware
 */
function createSecurityHeadersMiddleware(serviceName) {
  return (req, res, next) => {
    // Add security headers
    res.setHeader('X-Service-Name', serviceName);
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove potentially revealing headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    next();
  };
}

module.exports = {
  getAllowedOrigins,
  createCorsConfig,
  createCorsMiddleware,
  createSecurityHeadersMiddleware
};