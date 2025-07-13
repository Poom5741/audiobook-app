const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
);

const createLogger = (service, logLevel = null) => {
  const level = logLevel || process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  const logsDir = process.env.LOGS_DIR || 'logs';
  
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${svc || service}] ${level}: ${message} ${metaStr}`;
        })
      )
    })
  ];

  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, `${service}-error.log`),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 10,
        tailable: true,
        format: logFormat
      }),
      new winston.transports.File({
        filename: path.join(logsDir, `${service}-combined.log`),
        maxsize: 10485760, // 10MB
        maxFiles: 10,
        tailable: true,
        format: logFormat
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'all-services.log'),
        maxsize: 20971520, // 20MB
        maxFiles: 20,
        tailable: true,
        format: logFormat
      })
    );
  }

  const logger = winston.createLogger({
    level,
    format: logFormat,
    defaultMeta: { service },
    transports,
    exitOnError: false,
    silent: process.env.NODE_ENV === 'test'
  });

  return logger;
};

const createExpressLogger = (service) => {
  const logger = createLogger(service);
  
  return (req, res, next) => {
    const start = Date.now();
    const originalSend = res.send;
    
    res.send = function(body) {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;
      
      const logData = {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode,
        duration: `${duration}ms`,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        contentLength: body ? Buffer.byteLength(body, 'utf8') : 0,
        referrer: req.get('Referrer') || req.get('Referer'),
        userId: req.user?.id || req.user?.userId,
        requestId: req.id || req.requestId
      };

      if (statusCode >= 400) {
        logger.warn('HTTP request failed', logData);
      } else {
        logger.info('HTTP request completed', logData);
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

const addRequestId = (req, res, next) => {
  req.requestId = req.get('X-Request-ID') || 
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.set('X-Request-ID', req.requestId);
  next();
};

const logUnhandledErrors = (service) => {
  const logger = createLogger(service);
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
      type: 'uncaughtException'
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : null,
      promise: promise.toString(),
      type: 'unhandledRejection'
    });
  });
};

const sanitizeLogData = (data) => {
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'authorization', 
    'jwt', 'cookie', 'session', 'credentials', 'auth'
  ];
  
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

const createAuditLogger = (service) => {
  const logger = createLogger(`${service}-audit`);
  
  return {
    logActivity: (action, userId, details = {}) => {
      logger.info('User activity', sanitizeLogData({
        action,
        userId,
        timestamp: new Date().toISOString(),
        ...details
      }));
    },
    
    logSecurityEvent: (event, severity, details = {}) => {
      const logLevel = severity === 'critical' ? 'error' : 
                     severity === 'high' ? 'warn' : 'info';
      
      logger[logLevel]('Security event', sanitizeLogData({
        event,
        severity,
        timestamp: new Date().toISOString(),
        ...details
      }));
    },
    
    logDataAccess: (resource, action, userId, details = {}) => {
      logger.info('Data access', sanitizeLogData({
        resource,
        action,
        userId,
        timestamp: new Date().toISOString(),
        ...details
      }));
    }
  };
};

const createMetricsLogger = (service) => {
  const logger = createLogger(`${service}-metrics`);
  
  return {
    logPerformance: (operation, duration, details = {}) => {
      logger.info('Performance metric', {
        operation,
        duration,
        timestamp: new Date().toISOString(),
        ...details
      });
    },
    
    logBusinessMetric: (metric, value, details = {}) => {
      logger.info('Business metric', {
        metric,
        value,
        timestamp: new Date().toISOString(),
        ...details
      });
    },
    
    logResourceUsage: (resource, usage, details = {}) => {
      logger.info('Resource usage', {
        resource,
        usage,
        timestamp: new Date().toISOString(),
        ...details
      });
    }
  };
};

module.exports = {
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors,
  sanitizeLogData
};