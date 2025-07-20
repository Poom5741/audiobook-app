const CircuitBreaker = require("opossum");
const axios = require("axios");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("circuit-breaker");
const metricsLogger = createMetricsLogger("circuit-breaker");

// Enhanced circuit breaker configurations for different services
const circuitBreakerConfigs = {
  parser: {
    timeout: 10000, // Parser operations can take longer
    errorThresholdPercentage: 60,
    resetTimeout: 60000,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 10,
    name: "parser-service",
    group: "parser",
    healthEndpoint: "/health",
    fallbackStrategy: "cache", // Use cache as fallback
    cacheTtl: 3600, // 1 hour cache TTL for fallbacks
  },
  crawler: {
    timeout: 15000, // Crawling can be slow
    errorThresholdPercentage: 70,
    resetTimeout: 120000,
    rollingCountTimeout: 60000,
    rollingCountBuckets: 20,
    name: "crawler-service",
    group: "crawler",
    healthEndpoint: "/health",
    fallbackStrategy: "cache", // Use cache as fallback
    cacheTtl: 7200, // 2 hours cache TTL for fallbacks
  },
  tts: {
    timeout: 30000, // TTS operations are very slow
    errorThresholdPercentage: 60,
    resetTimeout: 300000, // 5 minutes
    rollingCountTimeout: 120000,
    rollingCountBuckets: 20,
    name: "tts-service",
    group: "tts",
    healthEndpoint: "/health",
    fallbackStrategy: "queue", // Queue for later processing
    maxQueueSize: 1000,
  },
  database: {
    timeout: 5000,
    errorThresholdPercentage: 30, // Database should be very reliable
    resetTimeout: 60000,
    rollingCountTimeout: 30000,
    rollingCountBuckets: 15,
    name: "database",
    group: "database",
    healthEndpoint: "/health",
    fallbackStrategy: "retry", // Always retry database operations
    maxRetries: 5,
  },
  auth: {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 20000,
    rollingCountBuckets: 10,
    name: "auth-service",
    group: "auth",
    healthEndpoint: "/health",
    fallbackStrategy: "fail", // Fail fast for auth issues
  },
};

// Store circuit breakers by service
const circuitBreakers = new Map();

/**
 * Create a circuit breaker for a specific service
 */
function createCircuitBreaker(serviceName, customConfig = {}) {
  const baseConfig = circuitBreakerConfigs[serviceName];

  if (!baseConfig) {
    throw new Error(
      `No circuit breaker configuration found for service: ${serviceName}`
    );
  }

  const config = {
    ...baseConfig,
    ...customConfig,
  };

  const breaker = new CircuitBreaker(executeRequest, config);

  // Event listeners for monitoring
  breaker.on("open", () => {
    logger.warn(`Circuit breaker OPENED for ${serviceName}`, {
      service: serviceName,
      group: config.group,
    });

    metricsLogger.logBusinessMetric("circuit_breaker_opened", 1, {
      service: serviceName,
      group: config.group,
    });
  });

  breaker.on("halfOpen", () => {
    logger.info(`Circuit breaker HALF-OPEN for ${serviceName}`, {
      service: serviceName,
      group: config.group,
    });

    metricsLogger.logBusinessMetric("circuit_breaker_half_open", 1, {
      service: serviceName,
      group: config.group,
    });
  });

  breaker.on("close", () => {
    logger.info(`Circuit breaker CLOSED for ${serviceName}`, {
      service: serviceName,
      group: config.group,
    });

    metricsLogger.logBusinessMetric("circuit_breaker_closed", 1, {
      service: serviceName,
      group: config.group,
    });
  });

  breaker.on("failure", (error) => {
    logger.error(`Circuit breaker failure for ${serviceName}`, {
      service: serviceName,
      error: error.message,
      group: config.group,
    });

    metricsLogger.logBusinessMetric("circuit_breaker_failure", 1, {
      service: serviceName,
      error: error.message,
      group: config.group,
    });
  });

  breaker.on("success", (result) => {
    metricsLogger.logPerformance(
      `${serviceName}_request_success`,
      result.duration,
      {
        service: serviceName,
        statusCode: result.statusCode,
        group: config.group,
      }
    );
  });

  breaker.on("timeout", () => {
    logger.warn(`Circuit breaker timeout for ${serviceName}`, {
      service: serviceName,
      timeout: config.timeout,
      group: config.group,
    });

    metricsLogger.logBusinessMetric("circuit_breaker_timeout", 1, {
      service: serviceName,
      timeout: config.timeout,
      group: config.group,
    });
  });

  circuitBreakers.set(serviceName, breaker);
  return breaker;
}

/**
 * Execute HTTP request with circuit breaker protection
 */
async function executeRequest(requestConfig) {
  const startTime = Date.now();

  try {
    const response = await axios(requestConfig);
    const duration = Date.now() - startTime;

    return {
      data: response.data,
      status: response.status,
      statusCode: response.status,
      headers: response.headers,
      duration,
      success: true,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhance error with additional context
    const enhancedError = new Error(error.message);
    enhancedError.status = error.response?.status;
    enhancedError.statusCode = error.response?.status;
    enhancedError.duration = duration;
    enhancedError.service = requestConfig.service || "unknown";
    enhancedError.url = requestConfig.url;
    enhancedError.method = requestConfig.method || "GET";
    enhancedError.originalError = error;

    throw enhancedError;
  }
}

/**
 * Simple retry mechanism
 */
async function retryOperation(operation, options = {}) {
  const {
    retries = 3,
    factor = 2,
    minTimeout = 1000,
    maxTimeout = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === retries) {
        throw error;
      }

      if (!shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        minTimeout * Math.pow(factor, attempt),
        maxTimeout
      );
      const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
      const finalDelay = delay + jitter;

      logger.warn(
        `Retry attempt ${attempt + 1} failed, retrying in ${Math.round(
          finalDelay
        )}ms`,
        {
          attempt: attempt + 1,
          retriesLeft: retries - attempt,
          error: error.message,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, finalDelay));
    }
  }

  throw lastError;
}

/**
 * Execute request with circuit breaker and retry logic
 * @param {String} serviceName - Name of the service
 * @param {Object} requestConfig - Axios request configuration
 * @param {Object} retryOptions - Retry options
 * @param {Object} fallbackOptions - Fallback options
 * @returns {Promise<Object>} - Service response
 */
async function callService(
  serviceName,
  requestConfig,
  retryOptions = {},
  fallbackOptions = {}
) {
  const breaker =
    circuitBreakers.get(serviceName) || createCircuitBreaker(serviceName);

  const defaultRetryOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    shouldRetry: (error) => {
      // Don't retry client errors (4xx), but retry server errors (5xx) and network errors
      if (
        error.statusCode &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      ) {
        return false;
      }
      return true;
    },
  };

  const finalRetryOptions = { ...defaultRetryOptions, ...retryOptions };
  const enhancedConfig = { ...requestConfig, service: serviceName };

  // Fallback options
  const {
    fallbackFn = null,
    fallbackData = null,
    cacheFallback = false,
    cacheKey = null,
    cacheTtl = 3600, // 1 hour
    throwOnError = true,
  } = fallbackOptions;

  try {
    const result = await retryOperation(
      () => breaker.fire(enhancedConfig),
      finalRetryOptions
    );

    logger.info(`Service call successful: ${serviceName}`, {
      service: serviceName,
      url: requestConfig.url,
      method: requestConfig.method || "GET",
      statusCode: result.statusCode,
      duration: result.duration,
    });

    // Cache successful response if cacheFallback is enabled
    if (cacheFallback && cacheKey) {
      try {
        const { cacheService } = require("../services/cacheService");
        await cacheService.set(cacheKey, result, cacheTtl);
        logger.debug(
          `Cached successful response for fallback: ${serviceName}`,
          {
            cacheKey,
            ttl: cacheTtl,
          }
        );
      } catch (cacheError) {
        logger.warn(`Failed to cache response for fallback: ${serviceName}`, {
          cacheKey,
          error: cacheError.message,
        });
      }
    }

    return result;
  } catch (error) {
    logger.error(`Service call failed after retries: ${serviceName}`, {
      service: serviceName,
      url: requestConfig.url,
      method: requestConfig.method || "GET",
      error: error.message,
      statusCode: error.statusCode,
    });

    metricsLogger.logBusinessMetric("service_call_failure", 1, {
      service: serviceName,
      url: requestConfig.url,
      method: requestConfig.method || "GET",
      error: error.message,
      statusCode: error.statusCode,
    });

    // Try fallback strategies

    // 1. Try cache fallback if enabled
    if (cacheFallback && cacheKey) {
      try {
        const { cacheService } = require("../services/cacheService");
        const cachedResponse = await cacheService.get(cacheKey);

        if (cachedResponse) {
          logger.info(
            `Using cached fallback for failed service call: ${serviceName}`,
            {
              cacheKey,
              service: serviceName,
            }
          );

          metricsLogger.logBusinessMetric("service_call_cache_fallback", 1, {
            service: serviceName,
          });

          return {
            ...cachedResponse,
            fromCache: true,
            originalError: error.message,
          };
        }
      } catch (cacheError) {
        logger.warn(`Failed to get cached fallback: ${serviceName}`, {
          cacheKey,
          error: cacheError.message,
        });
      }
    }

    // 2. Try custom fallback function if provided
    if (typeof fallbackFn === "function") {
      try {
        logger.info(
          `Using custom fallback function for failed service call: ${serviceName}`
        );

        const fallbackResult = await fallbackFn(error, enhancedConfig);

        metricsLogger.logBusinessMetric("service_call_custom_fallback", 1, {
          service: serviceName,
        });

        return {
          ...fallbackResult,
          fromFallback: true,
          originalError: error.message,
        };
      } catch (fallbackError) {
        logger.error(
          `Fallback function failed for service call: ${serviceName}`,
          {
            error: fallbackError.message,
            originalError: error.message,
          }
        );
      }
    }

    // 3. Try static fallback data if provided
    if (fallbackData !== null) {
      logger.info(
        `Using static fallback data for failed service call: ${serviceName}`
      );

      metricsLogger.logBusinessMetric("service_call_static_fallback", 1, {
        service: serviceName,
      });

      return {
        data: fallbackData,
        status: 200,
        statusCode: 200,
        fromFallback: true,
        originalError: error.message,
      };
    }

    // No fallback worked, throw error if configured to do so
    if (throwOnError) {
      throw error;
    }

    // Return error response
    return {
      data: null,
      status: error.statusCode || 500,
      statusCode: error.statusCode || 500,
      error: error.message,
      fromError: true,
    };
  }
}

/**
 * Health check for a service through circuit breaker
 */
async function healthCheck(serviceName, healthEndpoint) {
  try {
    const result = await callService(
      serviceName,
      {
        url: healthEndpoint,
        method: "GET",
        timeout: 5000,
      },
      { retries: 1 }
    );

    return {
      service: serviceName,
      status: "healthy",
      responseTime: result.duration,
      statusCode: result.statusCode,
    };
  } catch (error) {
    return {
      service: serviceName,
      status: "unhealthy",
      error: "Breaker is open",
      statusCode: error.statusCode,
    };
  }
}

/**
 * Get circuit breaker statistics
 */
function getCircuitBreakerStats() {
  const stats = {};

  for (const [serviceName, breaker] of circuitBreakers.entries()) {
    stats[serviceName] = {
      state: breaker.state,
      stats: breaker.stats,
      options: {
        timeout: breaker.options.timeout,
        errorThresholdPercentage: breaker.options.errorThresholdPercentage,
        resetTimeout: breaker.options.resetTimeout,
      },
    };
  }

  return stats;
}

/**
 * Reset circuit breaker for a service
 */
function resetCircuitBreaker(serviceName) {
  const breaker = circuitBreakers.get(serviceName);
  if (breaker) {
    breaker.close();
    logger.info(`Circuit breaker reset for ${serviceName}`);
    return true;
  }
  return false;
}

/**
 * Service-specific helper functions
 */
const serviceHelpers = {
  // Auth service calls
  auth: {
    async validateToken(token) {
      return callService(
        "auth",
        {
          url: `${process.env.AUTH_SERVICE_URL}/api/auth/verify`,
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
        { retries: 0 } // No retries for auth validation
      );
    },

    async refreshToken(refreshToken) {
      return callService(
        "auth",
        {
          url: `${process.env.AUTH_SERVICE_URL}/api/auth/refresh`,
          method: "POST",
          data: { refreshToken },
        },
        { retries: 0 } // No retries for token refresh
      );
    },
  },

  // Parser service calls
  parser: {
    async parseBook(bookData) {
      return callService(
        "parser",
        {
          url: `${process.env.PARSER_SERVICE_URL}/api/parse/upload`,
          method: "POST",
          data: bookData,
          timeout: 30000,
        },
        { retries: 2 }
      );
    },

    async getParsingStatus(jobId) {
      return callService("parser", {
        url: `${process.env.PARSER_SERVICE_URL}/api/parse/status/${jobId}`,
        method: "GET",
      });
    },
  },

  // Crawler service calls
  crawler: {
    async searchBooks(query) {
      return callService("crawler", {
        url: `${process.env.CRAWLER_SERVICE_URL}/api/search`,
        method: "POST",
        data: { query },
        timeout: 20000,
      });
    },

    async downloadBook(bookUrl) {
      return callService(
        "crawler",
        {
          url: `${process.env.CRAWLER_SERVICE_URL}/api/download`,
          method: "POST",
          data: { url: bookUrl },
          timeout: 60000,
        },
        { retries: 2 }
      );
    },
  },

  // TTS service calls
  tts: {
    async generateAudio(text, options = {}) {
      return callService(
        "tts",
        {
          url: `${process.env.TTS_SERVICE_URL}/synthesize`,
          method: "POST",
          data: { text, ...options },
          timeout: 120000,
        },
        { retries: 1 }
      );
    },

    async getVoices() {
      return callService("tts", {
        url: `${process.env.TTS_SERVICE_URL}/voices`,
        method: "GET",
      });
    },
  },
};

/**
 * Bulk health check for all services
 */
async function bulkHealthCheck() {
  const services = [
    { name: "parser", url: `${process.env.PARSER_SERVICE_URL}/health` },
    { name: "crawler", url: `${process.env.CRAWLER_SERVICE_URL}/health` },
    { name: "tts", url: `${process.env.TTS_SERVICE_URL}/health` },
  ];

  const healthChecks = services.map((service) =>
    healthCheck(service.name, service.url).catch((error) => ({
      service: service.name,
      status: "error",
      error: error.message,
    }))
  );

  const results = await Promise.all(healthChecks);

  const healthSummary = {
    timestamp: new Date().toISOString(),
    overall: results.every((r) => r.status === "healthy")
      ? "healthy"
      : "degraded",
    services: results.reduce((acc, result) => {
      acc[result.service] = result;
      return acc;
    }, {}),
  };

  metricsLogger.logBusinessMetric("bulk_health_check", 1, healthSummary);

  return healthSummary;
}

function resetAllCircuitBreakers() {
  circuitBreakers.clear();
}

module.exports = {
  createCircuitBreaker,
  callService,
  healthCheck,
  bulkHealthCheck,
  getCircuitBreakerStats,
  resetCircuitBreaker,
  serviceHelpers,
  resetAllCircuitBreakers,
};
