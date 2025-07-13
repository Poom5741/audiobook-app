const fs = require('fs');
const https = require('https');
const path = require('path');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

/**
 * Load SSL certificates
 */
function loadSSLCertificates(domain = process.env.DOMAIN) {
  if (!domain) {
    throw new Error('Domain is required for SSL configuration');
  }
  
  const sslDir = process.env.SSL_DIR || '/etc/ssl/audiobook';
  const certDir = path.join(sslDir, 'live', domain);
  
  const certPaths = {
    key: path.join(certDir, 'privkey.pem'),
    cert: path.join(certDir, 'fullchain.pem'),
    ca: path.join(certDir, 'chain.pem')
  };
  
  // Check if certificates exist
  for (const [name, certPath] of Object.entries(certPaths)) {
    if (!fs.existsSync(certPath)) {
      if (name === 'ca' && !fs.existsSync(certPath)) {
        // CA is optional for self-signed certificates
        continue;
      }
      throw new Error(`SSL certificate file not found: ${certPath}`);
    }
  }
  
  const sslOptions = {
    key: fs.readFileSync(certPaths.key),
    cert: fs.readFileSync(certPaths.cert)
  };
  
  // Add CA chain if available
  if (fs.existsSync(certPaths.ca)) {
    const caContent = fs.readFileSync(certPaths.ca, 'utf8').trim();
    if (caContent) {
      sslOptions.ca = caContent;
    }
  }
  
  logger.info(`SSL certificates loaded for domain: ${domain}`);
  return sslOptions;
}

/**
 * Create HTTPS server with proper configuration
 */
function createHTTPSServer(app, options = {}) {
  const {
    domain = process.env.DOMAIN,
    port = process.env.HTTPS_PORT || 443,
    enableHttp2 = true,
    cipherSuites = 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384'
  } = options;
  
  try {
    const sslOptions = loadSSLCertificates(domain);
    
    // Enhanced SSL configuration
    const httpsOptions = {
      ...sslOptions,
      // Security settings
      ciphers: cipherSuites,
      honorCipherOrder: true,
      secureProtocol: 'TLSv1_2_method',
      secureOptions: require('constants').SSL_OP_NO_SSLv2 | require('constants').SSL_OP_NO_SSLv3 | require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
      
      // Session settings
      sessionIdContext: 'audiobook-app',
      sessionTimeout: 300, // 5 minutes
      
      // OCSP stapling
      requestCert: false,
      rejectUnauthorized: false
    };
    
    let server;
    
    // Use HTTP/2 if available and enabled
    if (enableHttp2) {
      try {
        const http2 = require('http2');
        server = http2.createSecureServer(httpsOptions, app);
        logger.info('HTTP/2 server created');
      } catch (error) {
        logger.warn('HTTP/2 not available, falling back to HTTPS');
        server = https.createServer(httpsOptions, app);
      }
    } else {
      server = https.createServer(httpsOptions, app);
    }
    
    return server;
  } catch (error) {
    logger.error('Failed to create HTTPS server:', error);
    throw error;
  }
}

/**
 * Middleware to force HTTPS
 */
function forceHTTPS(options = {}) {
  const {
    trustProxyHeaders = true,
    httpsPort = 443,
    permanent = true
  } = options;
  
  return (req, res, next) => {
    let isHttps = req.secure;
    
    // Check proxy headers if behind reverse proxy
    if (trustProxyHeaders) {
      isHttps = isHttps || 
                req.headers['x-forwarded-proto'] === 'https' ||
                req.headers['x-forwarded-ssl'] === 'on' ||
                req.headers['x-forwarded-scheme'] === 'https';
    }
    
    if (!isHttps && process.env.NODE_ENV === 'production') {
      const httpsUrl = `https://${req.headers.host}${req.url}`;
      logger.info(`Redirecting HTTP to HTTPS: ${req.url}`);
      
      const statusCode = permanent ? 301 : 302;
      return res.redirect(statusCode, httpsUrl);
    }
    
    next();
  };
}

/**
 * Add security headers middleware
 */
function addSecurityHeaders(options = {}) {
  const {
    hsts = true,
    hstsMaxAge = 31536000, // 1 year
    hstsIncludeSubDomains = true,
    contentSecurityPolicy = true,
    frameOptions = 'DENY',
    contentTypeOptions = true,
    xssProtection = true,
    referrerPolicy = 'strict-origin-when-cross-origin'
  } = options;
  
  return (req, res, next) => {
    // HSTS (HTTP Strict Transport Security)
    if (hsts && req.secure) {
      let hstsValue = `max-age=${hstsMaxAge}`;
      if (hstsIncludeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
    
    // Content Security Policy
    if (contentSecurityPolicy) {
      const csp = "default-src 'self'; " +
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                  "style-src 'self' 'unsafe-inline'; " +
                  "img-src 'self' data: https:; " +
                  "font-src 'self'; " +
                  "connect-src 'self' ws: wss:; " +
                  "media-src 'self'; " +
                  "object-src 'none'; " +
                  "frame-ancestors 'none';";
      res.setHeader('Content-Security-Policy', csp);
    }
    
    // X-Frame-Options
    if (frameOptions) {
      res.setHeader('X-Frame-Options', frameOptions);
    }
    
    // X-Content-Type-Options
    if (contentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // X-XSS-Protection
    if (xssProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    
    // Referrer-Policy
    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', referrerPolicy);
    }
    
    // Remove potentially revealing headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    next();
  };
}

/**
 * Check if SSL is enabled and properly configured
 */
function isSSLEnabled() {
  return process.env.SSL_ENABLED === 'true' && !!process.env.DOMAIN;
}

/**
 * Get SSL configuration status
 */
function getSSLStatus() {
  const status = {
    enabled: isSSLEnabled(),
    domain: process.env.DOMAIN || null,
    sslDir: process.env.SSL_DIR || '/etc/ssl/audiobook',
    certificates: {}
  };
  
  if (status.enabled && status.domain) {
    const certDir = path.join(status.sslDir, 'live', status.domain);
    const certFiles = ['privkey.pem', 'fullchain.pem', 'chain.pem'];
    
    for (const file of certFiles) {
      const filePath = path.join(certDir, file);
      status.certificates[file] = {
        path: filePath,
        exists: fs.existsSync(filePath),
        readable: false
      };
      
      if (status.certificates[file].exists) {
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          status.certificates[file].readable = true;
        } catch (error) {
          // File exists but not readable
        }
      }
    }
  }
  
  return status;
}

/**
 * Start server with SSL support
 */
function startServer(app, options = {}) {
  const {
    httpPort = process.env.PORT || 3000,
    httpsPort = process.env.HTTPS_PORT || 443,
    serviceName = 'service'
  } = options;
  
  if (isSSLEnabled()) {
    try {
      // Create HTTPS server
      const httpsServer = createHTTPSServer(app, options);
      
      httpsServer.listen(httpsPort, () => {
        logger.info(`🔒 ${serviceName} HTTPS server running on port ${httpsPort}`);
      });
      
      // Also create HTTP server for redirects
      const http = require('http');
      const httpApp = require('express')();
      
      httpApp.use(forceHTTPS({ httpsPort }));
      httpApp.use('*', (req, res) => {
        res.redirect(301, `https://${req.headers.host}${req.url}`);
      });
      
      const httpServer = http.createServer(httpApp);
      httpServer.listen(httpPort, () => {
        logger.info(`↗️  ${serviceName} HTTP redirect server running on port ${httpPort}`);
      });
      
      return { httpsServer, httpServer };
    } catch (error) {
      logger.error('Failed to start HTTPS server, falling back to HTTP:', error);
      // Fall back to HTTP
    }
  }
  
  // HTTP only
  const httpServer = app.listen(httpPort, () => {
    logger.info(`🌐 ${serviceName} HTTP server running on port ${httpPort}`);
  });
  
  return { httpServer };
}

module.exports = {
  loadSSLCertificates,
  createHTTPSServer,
  forceHTTPS,
  addSecurityHeaders,
  isSSLEnabled,
  getSSLStatus,
  startServer
};