const { callService, healthCheck, getCircuitBreakerStats, bulkHealthCheck } = require('../utils/circuitBreaker');
const { createLogger, createAuditLogger } = require('../../../../shared/logger');

const logger = createLogger('circuit-breaker-middleware');
const auditLogger = createAuditLogger('circuit-breaker-middleware');

/**
 * Circuit breaker health check middleware
 */
function circuitBreakerHealthCheck(req, res, next) {
  const healthData = getCircuitBreakerStats();
  
  req.circuitBreakerHealth = {
    circuitBreakers: healthData,
    timestamp: new Date().toISOString(),
    healthy: Object.values(healthData).every(cb => cb.state === 'CLOSED')
  };
  
  next();
}

/**
 * Service dependency health check middleware
 */
async function serviceDependencyCheck(req, res, next) {
  try {
    const healthCheck = await bulkHealthCheck();
    req.serviceDependencies = healthCheck;
    next();
  } catch (error) {
    logger.error('Service dependency check failed', {
      error: error.message,
      requestId: req.requestId
    });
    
    req.serviceDependencies = {
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error.message,
      services: {}
    };
    
    next();
  }
}

/**
 * Circuit breaker error handler middleware
 */
function circuitBreakerErrorHandler(error, req, res, next) {
  if (error.name === 'CircuitBreakerOpenError') {
    auditLogger.logSecurityEvent('circuit_breaker_open', 'medium', {
      service: error.service || 'unknown',
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    });

    logger.warn('Circuit breaker is open', {
      service: error.service,
      url: req.originalUrl,
      method: req.method,
      requestId: req.requestId
    });

    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'The requested service is currently experiencing issues. Please try again later.',
      code: 'CIRCUIT_BREAKER_OPEN',
      retryAfter: 30, // seconds
      requestId: req.requestId
    });
  }

  if (error.name === 'CircuitBreakerTimeoutError') {
    logger.warn('Circuit breaker timeout', {
      service: error.service,
      timeout: error.timeout,
      url: req.originalUrl,
      method: req.method,
      requestId: req.requestId
    });

    return res.status(504).json({
      error: 'Service timeout',
      message: 'The requested service took too long to respond.',
      code: 'SERVICE_TIMEOUT',
      timeout: error.timeout,
      requestId: req.requestId
    });
  }

  // Pass other errors to the next error handler
  next(error);
}

/**
 * Request circuit breaker context middleware
 */
function addCircuitBreakerContext(req, res, next) {
  // Add circuit breaker utilities to request object
  req.circuitBreaker = {
    async callService(serviceName, config, retryOptions) {
      try {
        const result = await callService(serviceName, config, retryOptions);
        
        // Log successful service call
        logger.info(`Service call successful via circuit breaker`, {
          service: serviceName,
          url: config.url,
          method: config.method || 'GET',
          statusCode: result.statusCode,
          duration: result.duration,
          requestId: req.requestId
        });

        return result;
      } catch (error) {
        // Log failed service call
        logger.error(`Service call failed via circuit breaker`, {
          service: serviceName,
          url: config.url,
          method: config.method || 'GET',
          error: error.message,
          statusCode: error.statusCode,
          requestId: req.requestId
        });

        throw error;
      }
    },

    async healthCheck(serviceName, endpoint) {
      return healthCheck(serviceName, endpoint);
    },

    getStats() {
      return getCircuitBreakerStats();
    }
  };

  next();
}

/**
 * Service resilience monitoring middleware
 */
function serviceResilienceMonitoring(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(body) {
    // Track response patterns for circuit breaker optimization
    const responseData = {
      statusCode: res.statusCode,
      url: req.originalUrl,
      method: req.method,
      duration: Date.now() - req.startTime,
      requestId: req.requestId
    };

    // Log slow responses that might indicate service degradation
    if (responseData.duration > 5000) {
      logger.warn('Slow response detected', {
        ...responseData,
        threshold: 5000
      });
    }

    // Log error responses that might trigger circuit breakers
    if (res.statusCode >= 500) {
      logger.error('Server error response', responseData);
    }

    return originalSend.call(this, body);
  };

  req.startTime = Date.now();
  next();
}

/**
 * Circuit breaker admin routes middleware
 */
function createCircuitBreakerAdminRoutes() {
  const express = require('express');
  const router = express.Router();

  // Get circuit breaker status
  router.get('/status', (req, res) => {
    const stats = getCircuitBreakerStats();
    res.json({
      timestamp: new Date().toISOString(),
      circuitBreakers: stats,
      requestId: req.requestId
    });
  });

  // Get detailed health check
  router.get('/health', async (req, res) => {
    try {
      const healthCheck = await bulkHealthCheck();
      res.json(healthCheck);
    } catch (error) {
      res.status(500).json({
        error: 'Health check failed',
        message: error.message,
        requestId: req.requestId
      });
    }
  });

  // Reset circuit breaker
  router.post('/reset/:service', (req, res) => {
    const { service } = req.params;
    
    auditLogger.logActivity('circuit_breaker_reset', req.user?.userId || 'system', {
      service,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    });

    const { resetCircuitBreaker } = require('../utils/circuitBreaker');
    const success = resetCircuitBreaker(service);
    
    if (success) {
      res.json({
        message: `Circuit breaker reset for ${service}`,
        service,
        requestId: req.requestId
      });
    } else {
      res.status(404).json({
        error: 'Circuit breaker not found',
        service,
        requestId: req.requestId
      });
    }
  });

  return router;
}

module.exports = {
  circuitBreakerHealthCheck,
  serviceDependencyCheck,
  circuitBreakerErrorHandler,
  addCircuitBreakerContext,
  serviceResilienceMonitoring,
  createCircuitBreakerAdminRoutes
};