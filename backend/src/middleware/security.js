const helmet = require('helmet');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('security-middleware');

// Security configuration for different environments
const getSecurityConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Base CSP configuration
  const cspConfig = {
    directives: {
      // Default source restrictions
      defaultSrc: ["'self'"],
      
      // Script sources - allow self and specific trusted CDNs
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Allow inline scripts for development
        ...(isProduction ? [] : ["'unsafe-eval'"]), // Only allow eval in development
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com"
      ],
      
      // Style sources
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Allow inline styles for component libraries
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      
      // Font sources
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net",
        "data:" // Allow data URLs for fonts
      ],
      
      // Image sources
      imgSrc: [
        "'self'",
        "data:", // Allow data URLs for images
        "blob:", // Allow blob URLs for file uploads
        "https:", // Allow HTTPS images
        ...(isDevelopment ? ["http:"] : []) // Allow HTTP images in development
      ],
      
      // Audio sources for audiobook functionality
      mediaSrc: [
        "'self'",
        "blob:",
        "data:",
        ...(process.env.AUDIO_CDN_URL ? [process.env.AUDIO_CDN_URL] : [])
      ],
      
      // Connect sources for API calls
      connectSrc: [
        "'self'",
        ...(process.env.API_URL ? [process.env.API_URL] : []),
        ...(process.env.TTS_API_URL ? [process.env.TTS_API_URL] : []),
        ...(process.env.PARSER_API_URL ? [process.env.PARSER_API_URL] : []),
        ...(process.env.CRAWLER_API_URL ? [process.env.CRAWLER_API_URL] : []),
        ...(isDevelopment ? ["ws:", "wss:"] : []), // WebSocket for development
        ...(isDevelopment ? ["http://localhost:*"] : []) // Allow localhost in development
      ],
      
      // Frame sources - restrict iframe embedding
      frameSrc: ["'none'"],
      
      // Object sources - prevent plugin execution
      objectSrc: ["'none'"],
      
      // Base URI restrictions
      baseUri: ["'self'"],
      
      // Form action restrictions
      formAction: ["'self'"],
      
      // Worker sources for service workers
      workerSrc: ["'self'", "blob:"],
      
      // Manifest source for PWA
      manifestSrc: ["'self'"],
      
      // Child sources
      childSrc: ["'none'"],
      
      // Frame ancestors - prevent clickjacking
      frameAncestors: ["'none'"]
    },
    
    // Report violations in production
    ...(isProduction ? {
      reportOnly: false,
      reportUri: process.env.CSP_REPORT_URI
    } : {
      reportOnly: true // Use report-only mode in development
    })
  };

  return {
    csp: cspConfig,
    isProduction,
    isDevelopment
  };
};

// Comprehensive security headers middleware
const securityHeaders = () => {
  const { csp, isProduction, isDevelopment } = getSecurityConfig();
  
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: csp,
    
    // DNS Prefetch Control
    dnsPrefetchControl: {
      allow: false
    },
    
    // Frame Guard - prevent clickjacking
    frameguard: {
      action: 'deny'
    },
    
    // Hide Powered By header
    hidePoweredBy: true,
    
    // HTTP Strict Transport Security
    hsts: {
      maxAge: isProduction ? 31536000 : 0, // 1 year in production, disabled in dev
      includeSubDomains: isProduction,
      preload: isProduction
    },
    
    // IE No Open
    ieNoOpen: true,
    
    // Don't Sniff Mimetype
    noSniff: true,
    
    // Origin Agent Cluster
    originAgentCluster: true,
    
    // Permitted Cross Domain Policies
    permittedCrossDomainPolicies: false,
    
    // Referrer Policy
    referrerPolicy: {
      policy: ["no-referrer", "strict-origin-when-cross-origin"]
    },
    
    // X-XSS-Protection
    xssFilter: true,
    
    // Cross Origin Embedder Policy
    crossOriginEmbedderPolicy: false, // Disabled to allow audio streaming
    
    // Cross Origin Opener Policy
    crossOriginOpenerPolicy: {
      policy: "same-origin"
    },
    
    // Cross Origin Resource Policy
    crossOriginResourcePolicy: {
      policy: "cross-origin" // Allow cross-origin for audio files
    }
  });
};

// Security logging middleware
const securityLogger = (req, res, next) => {
  try {
    // Log security-relevant events
    const securityContext = {
      ip: req.ip || '127.0.0.1',
      userAgent: req.get('User-Agent') || 'unknown',
      method: req.method,
      url: req.originalUrl,
      requestId: req.requestId || 'unknown',
      timestamp: new Date().toISOString()
    };
    
    // Log suspicious activities
    const suspiciousPatterns = [
      /\.\.\//g, // Directory traversal
      /<script/gi, // Script injection
      /union\s+select/gi, // SQL injection
      /javascript:/gi, // JavaScript protocol
      /data:text\/html/gi, // Data URL XSS
      /vbscript:/gi, // VBScript protocol
      /onload\s*=/gi, // Event handler injection
      /onerror\s*=/gi, // Error handler injection
    ];
    
    try {
      const requestContent = JSON.stringify({
        url: req.originalUrl,
        query: req.query || {},
        body: req.body || {},
        headers: req.headers || {}
      });
      
      const isSuspicious = suspiciousPatterns.some(pattern => 
        pattern.test(requestContent)
      );
      
      if (isSuspicious) {
        const matchedPatterns = suspiciousPatterns
          .filter(pattern => pattern.test(requestContent))
          .map(p => p.toString());
          
        logger.warn('Suspicious request detected', {
          ...securityContext,
          patterns: matchedPatterns
        });
      }
    } catch (jsonError) {
      // Skip pattern checking if JSON serialization fails
      logger.debug('Could not serialize request for pattern checking', {
        error: jsonError.message,
        ...securityContext
      });
    }
    
    // Log authentication attempts
    if (req.originalUrl.includes('/auth/') || req.headers.authorization) {
      logger.info('Authentication request', {
        ...securityContext,
        hasAuth: !!req.headers.authorization,
        authType: req.headers.authorization ? req.headers.authorization.split(' ')[0] : null
      });
    }
    
    // Log admin access attempts
    if (req.originalUrl.includes('/admin') || req.originalUrl.includes('/circuit-breaker')) {
      logger.info('Admin access attempt', securityContext);
    }
    
    next();
  } catch (error) {
    // Don't let logging errors break the request
    logger.error('Security logging error', { error: error.message });
    next();
  }
};

// Request size limiting middleware
const requestSizeLimit = (options = {}) => {
  const {
    maxBodySize = '10mb',
    maxFileSize = '100mb',
    maxFieldSize = '1mb'
  } = options;
  
  return (req, res, next) => {
    // Check content length
    const contentLength = parseInt(req.get('content-length') || '0');
    
    const isFileUpload = req.get('content-type')?.includes('multipart/form-data');
    
    // Parse size limits
    const parseSize = (sizeStr) => {
      const match = sizeStr.match(/^(\d+)(kb|mb|gb)?$/i);
      if (!match) return parseInt(sizeStr);
      const num = parseInt(match[1]);
      const unit = (match[2] || '').toLowerCase();
      switch (unit) {
        case 'kb': return num * 1024;
        case 'mb': return num * 1024 * 1024;
        case 'gb': return num * 1024 * 1024 * 1024;
        default: return num;
      }
    };
    
    const maxSize = isFileUpload ? parseSize(maxFileSize) : parseSize(maxBodySize);
    
    if (contentLength > 0 && contentLength > maxSize) {
      logger.warn('Request size limit exceeded', {
        contentLength,
        maxSize,
        isFileUpload,
        ip: req.ip,
        url: req.originalUrl,
        requestId: req.requestId
      });
      
      return res.status(413).json({
        error: 'Request size too large',
        maxSize: isFileUpload ? maxFileSize : maxBodySize
      });
    }
    
    next();
  };
};

// IP whitelist/blacklist middleware
const ipAccessControl = (options = {}) => {
  const {
    whitelist = [],
    blacklist = [],
    enabled = process.env.NODE_ENV === 'production'
  } = options;
  
  if (!enabled) {
    return (req, res, next) => next();
  }
  
  return (req, res, next) => {
    // Get client IP from various sources
    const clientIP = req.ip || 
                     req.connection?.remoteAddress || 
                     req.socket?.remoteAddress ||
                     (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     '127.0.0.1'; // fallback for tests
    
    // Check blacklist first
    if (blacklist.length > 0 && blacklist.includes(clientIP)) {
      logger.warn('Blacklisted IP access attempt', {
        ip: clientIP,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId
      });
      
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check whitelist if configured
    if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
      logger.warn('Non-whitelisted IP access attempt', {
        ip: clientIP,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId
      });
      
      return res.status(403).json({ error: 'Access denied' });
    }
    
    next();
  };
};

// File upload security middleware
const fileUploadSecurity = (options = {}) => {
  const {
    allowedMimeTypes = [
      'application/pdf',
      'application/epub+zip',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxFileSize = 100 * 1024 * 1024, // 100MB
    allowedExtensions = ['.pdf', '.epub', '.txt', '.docx']
  } = options;
  
  return (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }
    
    const files = Array.isArray(req.files.file) ? req.files.file : [req.files.file];
    
    for (const file of files) {
      if (!file) continue;
      
      // Check file size
      if (file.size > maxFileSize) {
        logger.warn('File size exceeded limit', {
          filename: file.name,
          size: file.size,
          maxSize: maxFileSize,
          ip: req.ip,
          requestId: req.requestId
        });
        
        return res.status(413).json({
          error: 'File size too large',
          maxSize: `${maxFileSize / (1024 * 1024)}MB`
        });
      }
      
      // Check MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        logger.warn('Invalid file type uploaded', {
          filename: file.name,
          mimetype: file.mimetype,
          allowedTypes: allowedMimeTypes,
          ip: req.ip,
          requestId: req.requestId
        });
        
        return res.status(400).json({
          error: 'Invalid file type',
          allowedTypes: allowedMimeTypes
        });
      }
      
      // Check file extension
      const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!allowedExtensions.includes(extension)) {
        logger.warn('Invalid file extension uploaded', {
          filename: file.name,
          extension,
          allowedExtensions,
          ip: req.ip,
          requestId: req.requestId
        });
        
        return res.status(400).json({
          error: 'Invalid file extension',
          allowedExtensions
        });
      }
    }
    
    next();
  };
};

// Security headers validation
const validateSecurityHeaders = (req, res, next) => {
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': process.env.NODE_ENV === 'production' ? 
      'max-age=31536000; includeSubDomains; preload' : undefined,
    'Referrer-Policy': 'no-referrer, strict-origin-when-cross-origin'
  };
  
  Object.entries(securityHeaders).forEach(([header, value]) => {
    if (value) {
      res.setHeader(header, value);
    }
  });
  
  next();
};

module.exports = {
  securityHeaders,
  securityLogger,
  requestSizeLimit,
  ipAccessControl,
  fileUploadSecurity,
  validateSecurityHeaders,
  getSecurityConfig
};