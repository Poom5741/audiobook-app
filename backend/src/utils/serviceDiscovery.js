const axios = require("axios");
const { createLogger, createMetricsLogger } = require("../../shared/logger");
const { callService } = require("./circuitBreaker");
const Redis = require("ioredis");

const logger = createLogger("service-discovery");
const metricsLogger = createMetricsLogger("service-discovery");

// Service registry to store available services
const serviceRegistry = new Map();

// Default service endpoints from environment variables
const defaultServices = {
  parser: process.env.PARSER_SERVICE_URL || "http://parser:3002",
  crawler: process.env.CRAWLER_SERVICE_URL || "http://crawler:3001",
  tts: process.env.TTS_SERVICE_URL || "http://tts-api:8000",
  auth: process.env.AUTH_SERVICE_URL || "http://auth:8002",
};

// Service capabilities and dependencies
const serviceDefinitions = {
  parser: {
    requiredCapabilities: ["parse-pdf", "parse-epub", "parse-txt"],
    optionalCapabilities: ["chapter-detection", "metadata-extraction"],
    dependencies: [],
    criticalService: true,
    healthCheckPath: "/health",
    healthCheckInterval: 30000, // 30 seconds
  },
  crawler: {
    requiredCapabilities: ["search", "download"],
    optionalCapabilities: ["auto-download", "metadata-enrichment"],
    dependencies: [],
    criticalService: false,
    healthCheckPath: "/health",
    healthCheckInterval: 60000, // 1 minute
  },
  tts: {
    requiredCapabilities: ["text-to-speech"],
    optionalCapabilities: ["voice-selection", "speech-customization"],
    dependencies: [],
    criticalService: true,
    healthCheckPath: "/health",
    healthCheckInterval: 60000, // 1 minute
  },
  auth: {
    requiredCapabilities: ["authentication", "authorization"],
    optionalCapabilities: ["user-management"],
    dependencies: [],
    criticalService: true,
    healthCheckPath: "/health",
    healthCheckInterval: 30000, // 30 seconds
  },
};

// Redis client for distributed service registry
let redisClient;
try {
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, {
      keyPrefix: "service-discovery:",
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on("error", (error) => {
      logger.error("Redis service discovery client error:", {
        error: error.message,
        code: error.code,
      });
    });

    logger.info("Redis service discovery client initialized");
  } else {
    logger.info("Redis URL not provided, using in-memory service registry");
  }
} catch (error) {
  logger.error("Failed to initialize Redis service discovery client:", {
    error: error.message,
  });
}

/**
 * Register a service in the registry
 * @param {String} name - Service name
 * @param {Object} serviceInfo - Service information
 */
function registerService(name, serviceInfo) {
  serviceRegistry.set(name, {
    ...serviceInfo,
    lastUpdated: Date.now(),
  });

  logger.info(`Service registered: ${name}`, {
    name,
    url: serviceInfo.url,
    version: serviceInfo.version,
    status: serviceInfo.status,
  });

  metricsLogger.logBusinessMetric("service_registered", 1, {
    service: name,
    version: serviceInfo.version,
  });
}

/**
 * Discover services and register them
 * @returns {Promise<Map>} - Service registry
 */
async function discoverServices() {
  logger.info("Discovering services...");

  const discoveryPromises = Object.entries(defaultServices).map(
    async ([name, url]) => {
      try {
        // Try to get service health info
        const healthEndpoint = `${url}/health`;

        const response = await callService(
          name,
          {
            url: healthEndpoint,
            method: "GET",
            timeout: 5000,
          },
          { retries: 1 }
        );

        if (response.status === 200) {
          const serviceInfo = {
            name,
            url,
            status: "healthy",
            version: response.data.version || "unknown",
            capabilities: response.data.capabilities || [],
            healthEndpoint,
          };

          registerService(name, serviceInfo);
          return serviceInfo;
        } else {
          logger.warn(
            `Service discovery failed for ${name}: Non-200 response`,
            {
              name,
              url,
              status: response.status,
            }
          );

          // Register as unhealthy
          registerService(name, {
            name,
            url,
            status: "unhealthy",
            version: "unknown",
            healthEndpoint,
          });
        }
      } catch (error) {
        logger.error(`Service discovery failed for ${name}`, {
          name,
          url,
          error: error.message,
        });

        // Register as unavailable
        registerService(name, {
          name,
          url,
          status: "unavailable",
          error: error.message,
          healthEndpoint: `${url}/health`,
        });

        metricsLogger.logBusinessMetric("service_discovery_failure", 1, {
          service: name,
          error: error.message,
        });
      }
    }
  );

  await Promise.allSettled(discoveryPromises);

  logger.info("Service discovery completed", {
    discoveredServices: serviceRegistry.size,
    services: Array.from(serviceRegistry.keys()),
  });

  return serviceRegistry;
}

/**
 * Get a service from the registry
 * @param {String} name - Service name
 * @returns {Object|null} - Service information or null if not found
 */
function getService(name) {
  return serviceRegistry.get(name) || null;
}

/**
 * Get all registered services
 * @returns {Array} - Array of service information
 */
function getAllServices() {
  return Array.from(serviceRegistry.values());
}

/**
 * Check if a service is healthy
 * @param {String} name - Service name
 * @returns {Boolean} - True if service is healthy
 */
function isServiceHealthy(name) {
  const service = serviceRegistry.get(name);
  return service && service.status === "healthy";
}

/**
 * Refresh service health status
 * @param {String} name - Service name
 * @returns {Promise<Object>} - Updated service information
 */
async function refreshServiceHealth(name) {
  const service = serviceRegistry.get(name);

  if (!service) {
    logger.warn(`Cannot refresh health for unknown service: ${name}`);
    return null;
  }

  try {
    const response = await callService(
      name,
      {
        url: service.healthEndpoint,
        method: "GET",
        timeout: 5000,
      },
      { retries: 1 }
    );

    if (response.status === 200) {
      const updatedService = {
        ...service,
        status: "healthy",
        version: response.data.version || service.version,
        capabilities: response.data.capabilities || service.capabilities,
        lastUpdated: Date.now(),
      };

      serviceRegistry.set(name, updatedService);

      logger.debug(`Service health refreshed: ${name}`, {
        name,
        status: "healthy",
      });

      return updatedService;
    } else {
      const updatedService = {
        ...service,
        status: "unhealthy",
        lastUpdated: Date.now(),
      };

      serviceRegistry.set(name, updatedService);

      logger.warn(`Service health check failed: ${name}`, {
        name,
        status: response.status,
      });

      return updatedService;
    }
  } catch (error) {
    const updatedService = {
      ...service,
      status: "unavailable",
      error: error.message,
      lastUpdated: Date.now(),
    };

    serviceRegistry.set(name, updatedService);

    logger.error(`Service health check failed: ${name}`, {
      name,
      error: error.message,
    });

    metricsLogger.logBusinessMetric("service_health_check_failure", 1, {
      service: name,
      error: error.message,
    });

    return updatedService;
  }
}

/**
 * Refresh all service health statuses
 * @returns {Promise<Array>} - Updated service information
 */
async function refreshAllServicesHealth() {
  logger.info("Refreshing all service health statuses...");

  const refreshPromises = Array.from(serviceRegistry.keys()).map((name) =>
    refreshServiceHealth(name)
  );

  const results = await Promise.allSettled(refreshPromises);

  const healthyCount = results.filter(
    (r) => r.status === "fulfilled" && r.value?.status === "healthy"
  ).length;

  logger.info("Service health refresh completed", {
    totalServices: serviceRegistry.size,
    healthyServices: healthyCount,
  });

  metricsLogger.logBusinessMetric("services_health_refresh", 1, {
    totalServices: serviceRegistry.size,
    healthyServices: healthyCount,
  });

  return Array.from(serviceRegistry.values());
}

/**
 * Call a service with automatic discovery and circuit breaking
 * @param {String} name - Service name
 * @param {String} endpoint - Service endpoint (without base URL)
 * @param {Object} options - Request options
 * @returns {Promise<Object>} - Service response
 */
async function callServiceEndpoint(name, endpoint, options = {}) {
  // Get service from registry or discover it
  let service = serviceRegistry.get(name);

  if (!service) {
    logger.info(`Service ${name} not found in registry, discovering...`);
    await discoverServices();
    service = serviceRegistry.get(name);

    if (!service) {
      throw new Error(`Service ${name} not found`);
    }
  }

  // Check if service is available
  if (service.status === "unavailable") {
    // Try to refresh service health
    await refreshServiceHealth(name);
    service = serviceRegistry.get(name);

    if (service.status === "unavailable") {
      throw new Error(`Service ${name} is unavailable`);
    }
  }

  // Build request URL
  const url = `${service.url}${endpoint}`;

  // Call service with circuit breaker
  return callService(name, {
    url,
    ...options,
  });
}

/**
 * Start automatic health check monitoring for all services
 * @param {Object} options - Monitoring options
 * @returns {Object} - Monitoring intervals
 */
function startServiceMonitoring(options = {}) {
  const { enabled = true, useDefaultIntervals = true } = options;

  if (!enabled) {
    logger.info("Service monitoring is disabled");
    return null;
  }

  logger.info("Starting service monitoring...");

  const intervals = {};

  // Set up monitoring for each service
  Object.entries(serviceDefinitions).forEach(([name, definition]) => {
    const interval = useDefaultIntervals
      ? definition.healthCheckInterval
      : options[name]?.interval || 60000;

    intervals[name] = setInterval(async () => {
      try {
        await refreshServiceHealth(name);
      } catch (error) {
        logger.error(`Service monitoring error for ${name}:`, {
          error: error.message,
        });
      }
    }, interval);

    logger.debug(`Started monitoring for service: ${name}`, {
      interval,
    });
  });

  // Set up periodic full refresh
  intervals._fullRefresh = setInterval(async () => {
    try {
      await refreshAllServicesHealth();
    } catch (error) {
      logger.error("Full service refresh error:", {
        error: error.message,
      });
    }
  }, options.fullRefreshInterval || 300000); // 5 minutes by default

  logger.info("Service monitoring started", {
    services: Object.keys(intervals),
  });

  return intervals;
}

/**
 * Stop service monitoring
 * @param {Object} intervals - Monitoring intervals
 */
function stopServiceMonitoring(intervals) {
  if (!intervals) return;

  logger.info("Stopping service monitoring...");

  Object.entries(intervals).forEach(([name, interval]) => {
    clearInterval(interval);
    logger.debug(`Stopped monitoring for service: ${name}`);
  });

  logger.info("Service monitoring stopped");
}

/**
 * Check if a service has required capabilities
 * @param {String} name - Service name
 * @param {Array} requiredCapabilities - Required capabilities
 * @returns {Boolean} - True if service has all required capabilities
 */
function serviceHasCapabilities(name, requiredCapabilities) {
  const service = serviceRegistry.get(name);

  if (!service || service.status !== "healthy") {
    return false;
  }

  if (
    !Array.isArray(requiredCapabilities) ||
    requiredCapabilities.length === 0
  ) {
    return true;
  }

  const serviceCapabilities = service.capabilities || [];
  return requiredCapabilities.every((cap) => serviceCapabilities.includes(cap));
}

/**
 * Find best service instance for a given capability
 * @param {String} capability - Required capability
 * @returns {Object|null} - Best service instance or null if not found
 */
function findServiceForCapability(capability) {
  const candidates = [];

  for (const [name, service] of serviceRegistry.entries()) {
    if (
      service.status === "healthy" &&
      (service.capabilities || []).includes(capability)
    ) {
      candidates.push({
        name,
        service,
        priority: serviceDefinitions[name]?.priority || 0,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by priority (higher is better)
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].service;
}

/**
 * Register service in distributed registry (Redis)
 * @param {String} name - Service name
 * @param {Object} serviceInfo - Service information
 * @returns {Promise<Boolean>} - Success status
 */
async function registerServiceDistributed(name, serviceInfo) {
  if (!redisClient) {
    // Fall back to local registry
    registerService(name, serviceInfo);
    return true;
  }

  try {
    const key = `service:${name}`;
    const value = JSON.stringify({
      ...serviceInfo,
      lastUpdated: Date.now(),
    });

    await redisClient.set(key, value);
    await redisClient.expire(key, 300); // 5 minute TTL

    logger.info(`Service registered in distributed registry: ${name}`, {
      name,
      url: serviceInfo.url,
    });

    // Also update local registry
    registerService(name, serviceInfo);
    return true;
  } catch (error) {
    logger.error(
      `Failed to register service in distributed registry: ${name}`,
      {
        error: error.message,
      }
    );

    // Fall back to local registry
    registerService(name, serviceInfo);
    return false;
  }
}

/**
 * Get service dependency graph
 * @returns {Object} - Service dependency graph
 */
function getServiceDependencyGraph() {
  const graph = {};

  for (const [name, definition] of Object.entries(serviceDefinitions)) {
    graph[name] = {
      dependencies: definition.dependencies || [],
      dependents: [],
      status: serviceRegistry.get(name)?.status || "unknown",
      critical: definition.criticalService || false,
    };
  }

  // Build reverse dependencies
  for (const [name, data] of Object.entries(graph)) {
    for (const dependency of data.dependencies) {
      if (graph[dependency]) {
        graph[dependency].dependents.push(name);
      }
    }
  }

  return graph;
}

/**
 * Check system health based on service dependencies
 * @returns {Object} - System health status
 */
function checkSystemHealth() {
  const graph = getServiceDependencyGraph();
  const services = getAllServices();

  const criticalServicesDown = services.filter(
    (service) =>
      serviceDefinitions[service.name]?.criticalService &&
      service.status !== "healthy"
  );

  const healthStatus = {
    timestamp: new Date().toISOString(),
    healthy: criticalServicesDown.length === 0,
    services: services.reduce((acc, service) => {
      acc[service.name] = {
        status: service.status,
        version: service.version,
        lastUpdated: service.lastUpdated,
      };
      return acc;
    }, {}),
    criticalServicesDown: criticalServicesDown.map((s) => s.name),
    dependencyGraph: graph,
  };

  if (criticalServicesDown.length > 0) {
    logger.warn("System health check: Critical services down", {
      criticalServicesDown: criticalServicesDown.map((s) => s.name),
    });

    metricsLogger.logBusinessMetric("system_health_critical", 1, {
      criticalServicesDown: criticalServicesDown.length,
    });
  }

  return healthStatus;
}

module.exports = {
  registerService,
  discoverServices,
  getService,
  getAllServices,
  isServiceHealthy,
  refreshServiceHealth,
  refreshAllServicesHealth,
  callServiceEndpoint,
  startServiceMonitoring,
  stopServiceMonitoring,
  serviceHasCapabilities,
  findServiceForCapability,
  registerServiceDistributed,
  getServiceDependencyGraph,
  checkSystemHealth,
};
