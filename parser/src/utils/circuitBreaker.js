const CircuitBreaker = require('opossum');
const axios = require('axios');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('parser-circuit-breaker');

// Define circuit breaker configurations for external services
const circuitBreakerConfigs = {
  tts: {
    timeout: 60000, // 60 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 30000, // 30 seconds
    name: "tts-service",
    group: "external-services",
  },
  // Add other external services here if needed
};

const circuitBreakers = new Map();

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

  breaker.on("open", () => {
    logger.warn(`Circuit breaker OPENED for ${serviceName}`);
  });

  breaker.on("halfOpen", () => {
    logger.info(`Circuit breaker HALF-OPEN for ${serviceName}`);
  });

  breaker.on("close", () => {
    logger.info(`Circuit breaker CLOSED for ${serviceName}`);
  });

  breaker.on("failure", (error) => {
    logger.error(`Circuit breaker failure for ${serviceName}: ${error.message}`);
  });

  breaker.on("success", () => {
    logger.debug(`Circuit breaker success for ${serviceName}`);
  });

  breaker.on("timeout", () => {
    logger.warn(`Circuit breaker timeout for ${serviceName}`);
  });

  circuitBreakers.set(serviceName, breaker);
  return breaker;
}

async function executeRequest(requestConfig) {
  try {
    const response = await axios(requestConfig);
    return response;
  } catch (error) {
    // Enhance error with additional context
    const enhancedError = new Error(error.message);
    enhancedError.status = error.response?.status;
    enhancedError.statusCode = error.response?.status;
    enhancedError.service = requestConfig.service || "unknown";
    enhancedError.url = requestConfig.url;
    enhancedError.method = requestConfig.method || "GET";
    enhancedError.originalError = error;
    throw enhancedError;
  }
}

async function callService(serviceName, requestConfig) {
  const breaker =
    circuitBreakers.get(serviceName) || createCircuitBreaker(serviceName);

  try {
    const result = await breaker.fire(requestConfig);
    logger.info(`Service call successful via circuit breaker: ${serviceName}`);
    return result;
  } catch (error) {
    logger.error(`Service call failed via circuit breaker: ${serviceName}, Error: ${error.message}`);
    throw error;
  }
}

module.exports = { callService };
