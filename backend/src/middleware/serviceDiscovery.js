const {
  discoverServices,
  startServiceMonitoring,
  stopServiceMonitoring,
  callServiceEndpoint,
  checkSystemHealth,
  getAllServices,
} = require("../utils/serviceDiscovery");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("service-discovery-middleware");
const metricsLogger = createMetricsLogger("service-discovery-middleware");

let monitoringIntervals = null;

/**
 * Initialize service discovery and monitoring
 * @param {Object} app - Express application
 * @param {Object} options - Configuration options
 */
async function initializeServiceDiscovery(app, options = {}) {
  const {
    autoDiscover = true,
    startMonitoring = true,
    monitoringOptions = {},
    exposeHealthEndpoint = true,
    healthEndpointPath = "/api/system/health",
    exposeServicesEndpoint = true,
    servicesEndpointPath = "/api/system/services",
    requireAdminForServices = true,
  } = options;

  logger.info("Initializing service discovery middleware", {
    autoDiscover,
    startMonitoring,
    exposeHealthEndpoint,
    healthEndpointPath,
    exposeServicesEndpoint,
    servicesEndpointPath,
  });

  // Auto-discover services
  if (autoDiscover) {
    try {
      await discoverServices();
      logger.info("Initial service discovery completed");
    } catch (error) {
      logger.error("Initial service discovery failed", {
        error: error.message,
      });
    }
  }

  // Start monitoring
  if (startMonitoring) {
    monitoringIntervals = startServiceMonitoring(monitoringOptions);
  }

  // Expose health endpoint
  if (exposeHealthEndpoint) {
    app.get(healthEndpointPath, (req, res) => {
      const health = checkSystemHealth();

      const statusCode = health.healthy ? 200 : 503;

      res.status(statusCode).json({
        status: health.healthy ? "healthy" : "degraded",
        timestamp: health.timestamp,
        services: health.services,
        criticalServicesDown: health.criticalServicesDown,
      });
    });

    logger.info(`Health endpoint exposed at ${healthEndpointPath}`);
  }

  // Expose services endpoint
  if (exposeServicesEndpoint) {
    const servicesHandler = (req, res) => {
      const services = getAllServices();

      res.json({
        count: services.length,
        services,
        timestamp: new Date().toISOString(),
      });
    };

    // Apply admin check middleware if required
    if (requireAdminForServices && app.locals.middleware?.isAdmin) {
      app.get(
        servicesEndpointPath,
        app.locals.middleware.isAdmin,
        servicesHandler
      );
    } else {
      app.get(servicesEndpointPath, servicesHandler);
    }

    logger.info(`Services endpoint exposed at ${servicesEndpointPath}`);
  }

  // Store service discovery in app locals for access in routes
  app.locals.serviceDiscovery = {
    callService: callServiceEndpoint,
    checkHealth: checkSystemHealth,
    getAllServices,
  };

  logger.info("Service discovery middleware initialized");
}

/**
 * Shutdown service discovery and monitoring
 */
function shutdownServiceDiscovery() {
  logger.info("Shutting down service discovery middleware");

  if (monitoringIntervals) {
    stopServiceMonitoring(monitoringIntervals);
    monitoringIntervals = null;
  }

  logger.info("Service discovery middleware shutdown complete");
}

/**
 * Middleware to check service health before processing requests
 * @param {Array} requiredServices - List of services that must be healthy
 * @returns {Function} Express middleware
 */
function requireHealthyServices(requiredServices = []) {
  return (req, res, next) => {
    const health = checkSystemHealth();

    // If no specific services required, check overall health
    if (requiredServices.length === 0) {
      if (health.healthy) {
        return next();
      }

      logger.warn("Request blocked due to unhealthy system", {
        path: req.path,
        criticalServicesDown: health.criticalServicesDown,
      });

      return res.status(503).json({
        error: "Service Unavailable",
        message: "System is currently unavailable due to service issues",
        criticalServicesDown: health.criticalServicesDown,
      });
    }

    // Check specific required services
    const unhealthyRequiredServices = requiredServices.filter(
      (name) =>
        !health.services[name] || health.services[name].status !== "healthy"
    );

    if (unhealthyRequiredServices.length === 0) {
      return next();
    }

    logger.warn("Request blocked due to required services being unhealthy", {
      path: req.path,
      unhealthyRequiredServices,
    });

    return res.status(503).json({
      error: "Service Unavailable",
      message: "Required services are currently unavailable",
      unhealthyServices: unhealthyRequiredServices,
    });
  };
}

/**
 * Middleware to add service discovery client to request
 */
function serviceDiscoveryClient(req, res, next) {
  req.services = {
    call: callServiceEndpoint,
    health: checkSystemHealth,
    getAll: getAllServices,
  };

  next();
}

module.exports = {
  initializeServiceDiscovery,
  shutdownServiceDiscovery,
  requireHealthyServices,
  serviceDiscoveryClient,
};
