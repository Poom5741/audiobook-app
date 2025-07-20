const helmet = require("helmet");
const cors = require("cors");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("security-middleware");
const metricsLogger = createMetricsLogger("security-middleware");

/**
 * Configure and apply security middleware for Express
 * @param {Object} app - Express application
 * @param {Object} options - Security configuration options
 */
function configureSecurityMiddleware(app, options = {}) {
  const {
    enableHelmet = true,
    enableCors = true,
    enableXssProtection = true,
    enableHsts = true,
    enableNoSniff = true,
    enableFrameGuard = true,
    corsOptions = {},
    contentSecurityPolicy = true,
    referrerPolicy = true,
    dnsPrefetchControl = true,
  } = options;

  logger.info("Configuring security middleware", {
    enableHelmet,
    enableCors,
    enableXssProtection,
    enableHsts,
    enableNoSniff,
    enableFrameGuard,
    contentSecurityPolicy: !!contentSecurityPolicy,
    referrerPolicy: !!referrerPolicy,
    dnsPrefetchControl: !!dnsPrefetchControl,
  });

  // Apply Helmet for security headers
  if (enableHelmet) {
    const helmetOptions = {
      contentSecurityPolicy,
      referrerPolicy,
      dnsPrefetchControl,
      xssFilter: enableXssProtection,
      hsts: enableHsts,
      noSniff: enableNoSniff,
      frameguard: enableFrameGuard,
    };

    app.use(helmet(helmetOptions));
    logger.info("Helmet security middleware configured", { helmetOptions });
  }

  // Apply CORS
  if (enableCors) {
    const defaultCorsOptions = {
      origin: process.env.CORS_ORIGIN || "*",
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
      maxAge: 86400, // 24 hours
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    };

    const finalCorsOptions = { ...defaultCorsOptions, ...corsOptions };
    app.use(cors(finalCorsOptions));
    logger.info("CORS middleware configured", {
      origin: finalCorsOptions.origin,
      credentials: finalCorsOptions.credentials,
    });
  }

  // Add custom security headers
  app.use((req, res, next) => {
    // Add security headers not covered by helmet
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

    // Add custom header to track security middleware
    res.setHeader("X-Security-Headers", "enabled");

    next();
  });

  // Add security monitoring middleware
  app.use(securityMonitoring);

  logger.info("Security middleware configuration completed");
}

/**
 * Middleware to monitor security-related metrics and events
 */
function securityMonitoring(req, res, next) {
  // Track security headers
  const trackSecurityHeaders = () => {
    const securityHeaders = {
      "content-security-policy": res.getHeader("Content-Security-Policy"),
      "strict-transport-security": res.getHeader("Strict-Transport-Security"),
      "x-content-type-options": res.getHeader("X-Content-Type-Options"),
      "x-frame-options": res.getHeader("X-Frame-Options"),
      "x-xss-protection": res.getHeader("X-XSS-Protection"),
    };

    // Count how many security headers are set
    const headerCount = Object.values(securityHeaders).filter(Boolean).length;

    metricsLogger.logBusinessMetric("security_headers_count", headerCount, {
      path: req.path,
      method: req.method,
    });
  };

  // Check for security risks in request
  const potentialRisks = [];

  // Check for suspicious query parameters
  const suspiciousParams = [
    "eval",
    "exec",
    "script",
    "alert",
    "document.cookie",
  ];
  if (req.query) {
    Object.values(req.query).forEach((value) => {
      if (typeof value === "string") {
        suspiciousParams.forEach((param) => {
          if (value.toLowerCase().includes(param)) {
            potentialRisks.push(`Suspicious query parameter: ${param}`);
          }
        });
      }
    });
  }

  // Log potential security risks
  if (potentialRisks.length > 0) {
    logger.warn("Potential security risks detected", {
      risks: potentialRisks,
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
    });

    metricsLogger.logBusinessMetric(
      "security_risks_detected",
      potentialRisks.length,
      {
        path: req.path,
        method: req.method,
      }
    );
  }

  next();
}

/**
 * Middleware to enforce HTTPS
 */
function enforceHttps(options = {}) {
  const { trustProtoHeader = true, trustXForwardedHostHeader = true } = options;

  return (req, res, next) => {
    // Skip for health checks and local development
    if (req.path === "/health" || process.env.NODE_ENV === "development") {
      return next();
    }

    // Determine if request is secure
    let isSecure = req.secure;

    // Trust proxy headers if configured
    if (trustProtoHeader && req.headers["x-forwarded-proto"] === "https") {
      isSecure = true;
    }

    if (!isSecure) {
      // Redirect to HTTPS
      const host =
        trustXForwardedHostHeader && req.headers["x-forwarded-host"]
          ? req.headers["x-forwarded-host"]
          : req.headers.host;

      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }

    next();
  };
}

/**
 * Middleware to prevent clickjacking
 */
function preventClickjacking(mode = "DENY") {
  return (req, res, next) => {
    res.setHeader("X-Frame-Options", mode);
    next();
  };
}

/**
 * Middleware to set strict Content Security Policy
 */
function setContentSecurityPolicy(options = {}) {
  const defaultDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    reportUri: "/api/csp-report",
  };

  const directives = { ...defaultDirectives, ...options };

  return (req, res, next) => {
    // Build CSP header value
    const cspValue = Object.entries(directives)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key} ${value.join(" ")}`;
        }
        return `${key} ${value}`;
      })
      .join("; ");

    res.setHeader("Content-Security-Policy", cspValue);
    next();
  };
}

/**
 * Middleware to detect and block common attack patterns
 */
function blockAttackPatterns() {
  // Common attack patterns to detect
  const sqlInjectionPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
  ];

  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /expression\s*\(/i,
  ];

  const pathTraversalPatterns = [/\.\.\//i, /\.\.\\\\i/];

  return (req, res, next) => {
    // Function to check patterns in a string
    const checkPatterns = (str, patterns) => {
      if (typeof str !== "string") return false;
      return patterns.some((pattern) => pattern.test(str));
    };

    // Check URL
    const url = req.originalUrl;
    const isSuspiciousUrl =
      checkPatterns(url, sqlInjectionPatterns) ||
      checkPatterns(url, xssPatterns) ||
      checkPatterns(url, pathTraversalPatterns);

    // Check query parameters
    let isSuspiciousQuery = false;
    if (req.query) {
      isSuspiciousQuery = Object.values(req.query).some((value) => {
        if (typeof value !== "string") return false;
        return (
          checkPatterns(value, sqlInjectionPatterns) ||
          checkPatterns(value, xssPatterns) ||
          checkPatterns(value, pathTraversalPatterns)
        );
      });
    }

    // Block suspicious requests
    if (isSuspiciousUrl || isSuspiciousQuery) {
      logger.warn("Blocked potential attack", {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        userAgent: req.get("User-Agent"),
        isSuspiciousUrl,
        isSuspiciousQuery,
      });

      metricsLogger.logBusinessMetric("security_attack_blocked", 1, {
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({
        error: "Forbidden",
        message: "Request contains potentially malicious patterns",
      });
    }

    next();
  };
}

/**
 * Middleware to set secure cookie options
 */
function secureSessionCookies(options = {}) {
  const {
    secure = process.env.NODE_ENV === "production",
    httpOnly = true,
    sameSite = "lax",
    maxAge = 24 * 60 * 60 * 1000, // 24 hours
  } = options;

  return (req, res, next) => {
    if (req.session) {
      req.session.cookie.secure = secure;
      req.session.cookie.httpOnly = httpOnly;
      req.session.cookie.sameSite = sameSite;
      req.session.cookie.maxAge = maxAge;
    }
    next();
  };
}

// Additional functions expected by tests
function securityHeaders(options = {}) {
  return (req, res, next) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    } else {
      res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'");
    }
    
    next();
  };
}

function requestSizeLimit(options = {}) {
  const { maxBodySize = '1mb' } = options;
  const maxBytes = parseSize(maxBodySize);
  
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxBytes) {
      return res.status(413).json({
        error: 'Request size too large',
        maxSize: maxBodySize
      });
    }
    
    next();
  };
}

function ipAccessControl(options = {}) {
  const { 
    allowList = [], 
    blockList = [], 
    whitelist = [], 
    blacklist = [],
    enabled = true 
  } = options;
  
  return (req, res, next) => {
    if (!enabled) {
      return next();
    }
    
    const clientIp = req.ip || req.connection.remoteAddress;
    const finalBlockList = [...blockList, ...blacklist];
    const finalAllowList = [...allowList, ...whitelist];
    
    if (finalBlockList.includes(clientIp)) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }
    
    if (finalAllowList.length > 0 && !finalAllowList.includes(clientIp)) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }
    
    next();
  };
}

function fileUploadSecurity(options = {}) {
  const { allowedTypes = [], maxFileSize = '10mb' } = options;
  
  return (req, res, next) => {
    try {
      const file = req.file || (req.files && req.files.file);
      
      if (file) {
        const fileType = file.mimetype;
        const fileSize = file.size;
        const maxBytes = parseSize(maxFileSize);
        
        if (allowedTypes.length > 0 && !allowedTypes.includes(fileType)) {
          return res.status(400).json({
            error: 'Invalid file type',
            message: `File type ${fileType} not allowed`
          });
        }
        
        if (fileSize > maxBytes) {
          return res.status(413).json({
            error: 'File too large',
            message: `File size exceeds limit of ${maxFileSize}`
          });
        }
      }
      
      next();
    } catch (error) {
      logger.error('Error in fileUploadSecurity middleware', { error: error.message, stack: error.stack });
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

function validateSecurityHeaders(req, res, next) {
  const requiredHeaders = ['x-content-type-options', 'x-frame-options'];
  const missingHeaders = requiredHeaders.filter(header => !res.getHeader(header));
  
  if (missingHeaders.length > 0) {
    logger.warn('Missing security headers', { missingHeaders });
  }
  
  next();
}

function getSecurityConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "http:"], // Added http: for development
    connectSrc: ["'self'", "ws:"], // Added ws: for development
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  };

  if (process.env.API_URL) {
    cspDirectives.connectSrc.push(process.env.API_URL);
  }
  if (process.env.TTS_API_URL) {
    cspDirectives.connectSrc.push(process.env.TTS_API_URL);
  }

  return {
    environment: process.env.NODE_ENV || 'development',
    isProduction,
    isDevelopment,
    httpsEnabled: process.env.HTTPS_ENABLED === 'true',
    corsEnabled: process.env.CORS_ENABLED !== 'false',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    csp: {
      reportOnly: isDevelopment,
      directives: cspDirectives,
    },
  };
}

function securityLogger() {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    logger.info('Security middleware', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  };
}

// Helper function to parse size strings
function parseSize(size) {
  if (typeof size === 'number') return size;
  
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.toString().toLowerCase().match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * (units[unit] || 1));
}

module.exports = {
  configureSecurityMiddleware,
  securityMonitoring,
  enforceHttps,
  preventClickjacking,
  setContentSecurityPolicy,
  blockAttackPatterns,
  secureSessionCookies,
  // Test-expected functions
  securityHeaders,
  securityLogger,
  requestSizeLimit,
  ipAccessControl,
  fileUploadSecurity,
  validateSecurityHeaders,
  getSecurityConfig,
};
