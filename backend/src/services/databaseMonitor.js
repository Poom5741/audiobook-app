const {
  monitorConnections,
  performMaintenance,
  performHealthCheck,
} = require("./database");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("database-monitor");
const metricsLogger = createMetricsLogger("database-monitor");

class DatabaseMonitor {
  constructor(options = {}) {
    this.options = {
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      maintenanceInterval: options.maintenanceInterval || 3600000, // 1 hour
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      enabled: options.enabled !== false,
      ...options,
    };

    this.intervals = {
      monitoring: null,
      maintenance: null,
      healthCheck: null,
    };

    this.isRunning = false;
    this.lastHealthCheck = null;
    this.lastMaintenance = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn("Database monitor is already running");
      return;
    }

    if (!this.options.enabled) {
      logger.info("Database monitor is disabled");
      return;
    }

    logger.info("Starting database monitor...", {
      monitoringInterval: this.options.monitoringInterval,
      maintenanceInterval: this.options.maintenanceInterval,
      healthCheckInterval: this.options.healthCheckInterval,
    });

    this.isRunning = true;

    // Start monitoring intervals
    this.intervals.monitoring = setInterval(
      () => this.performMonitoring(),
      this.options.monitoringInterval
    );

    this.intervals.maintenance = setInterval(
      () => this.performMaintenanceCheck(),
      this.options.maintenanceInterval
    );

    this.intervals.healthCheck = setInterval(
      () => this.performHealthCheckMonitoring(),
      this.options.healthCheckInterval
    );

    // Perform initial checks
    await this.performInitialChecks();

    logger.info("Database monitor started successfully");
    metricsLogger.logBusinessMetric("database_monitor_started", 1);
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn("Database monitor is not running");
      return;
    }

    logger.info("Stopping database monitor...");

    // Clear all intervals
    Object.values(this.intervals).forEach((interval) => {
      if (interval) {
        clearInterval(interval);
      }
    });

    this.intervals = {
      monitoring: null,
      maintenance: null,
      healthCheck: null,
    };

    this.isRunning = false;

    logger.info("Database monitor stopped");
    metricsLogger.logBusinessMetric("database_monitor_stopped", 1);
  }

  async performInitialChecks() {
    try {
      logger.info("Performing initial database checks...");

      // Initial health check
      await this.performHealthCheckMonitoring();

      // Initial connection monitoring
      await this.performMonitoring();

      logger.info("Initial database checks completed");
    } catch (error) {
      logger.error("Initial database checks failed:", {
        error: error.message,
        code: error.code,
      });
    }
  }

  async performMonitoring() {
    try {
      const monitoringResult = await monitorConnections();

      if (monitoringResult.status === "ok") {
        logger.debug("Database connection monitoring completed", {
          stats: monitoringResult.stats,
          warnings: monitoringResult.warnings,
        });

        // Log metrics
        if (monitoringResult.stats) {
          metricsLogger.logBusinessMetric(
            "db_pool_total_connections",
            monitoringResult.stats.totalCount
          );
          metricsLogger.logBusinessMetric(
            "db_pool_idle_connections",
            monitoringResult.stats.idleCount
          );
          metricsLogger.logBusinessMetric(
            "db_pool_waiting_connections",
            monitoringResult.stats.waitingCount
          );
        }

        // Alert on warnings
        if (monitoringResult.warnings && monitoringResult.warnings.length > 0) {
          logger.warn("Database connection warnings detected", {
            warnings: monitoringResult.warnings,
          });

          metricsLogger.logBusinessMetric(
            "database_connection_warnings",
            monitoringResult.warnings.length,
            {
              warnings: monitoringResult.warnings.join(", "),
            }
          );
        }
      } else {
        logger.error("Database connection monitoring failed", {
          error: monitoringResult.error,
        });

        metricsLogger.logBusinessMetric("database_monitoring_failure", 1, {
          error: monitoringResult.error,
        });
      }
    } catch (error) {
      logger.error("Database monitoring error:", {
        error: error.message,
        code: error.code,
      });

      metricsLogger.logBusinessMetric("database_monitoring_error", 1, {
        error: error.message,
        code: error.code,
      });
    }
  }

  async performHealthCheckMonitoring() {
    try {
      const healthResult = await performHealthCheck();
      this.lastHealthCheck = {
        timestamp: new Date(),
        result: healthResult,
      };

      if (healthResult.overall === "healthy") {
        logger.debug("Database health check passed", {
          responseTime: healthResult.database.responseTime,
          poolStats: healthResult.pool,
        });

        metricsLogger.logPerformance(
          "database_health_check_response_time",
          healthResult.database.responseTime
        );
        metricsLogger.logBusinessMetric("database_health_check_success", 1);
      } else {
        logger.warn("Database health check indicates issues", {
          overall: healthResult.overall,
          database: healthResult.database,
          pool: healthResult.pool,
        });

        metricsLogger.logBusinessMetric("database_health_check_degraded", 1, {
          status: healthResult.overall,
        });
      }
    } catch (error) {
      logger.error("Database health check monitoring error:", {
        error: error.message,
        code: error.code,
      });

      this.lastHealthCheck = {
        timestamp: new Date(),
        error: error.message,
      };

      metricsLogger.logBusinessMetric("database_health_check_error", 1, {
        error: error.message,
        code: error.code,
      });
    }
  }

  async performMaintenanceCheck() {
    try {
      logger.info("Starting scheduled database maintenance...");

      const maintenanceResult = await performMaintenance();
      this.lastMaintenance = {
        timestamp: new Date(),
        result: maintenanceResult,
      };

      logger.info("Scheduled database maintenance completed", {
        tasksCompleted: Object.keys(maintenanceResult.tasks).length,
        timestamp: maintenanceResult.timestamp,
      });

      metricsLogger.logBusinessMetric(
        "database_maintenance_scheduled_success",
        1,
        {
          tasksCompleted: Object.keys(maintenanceResult.tasks).length,
        }
      );
    } catch (error) {
      logger.error("Scheduled database maintenance failed:", {
        error: error.message,
        code: error.code,
      });

      this.lastMaintenance = {
        timestamp: new Date(),
        error: error.message,
      };

      metricsLogger.logBusinessMetric(
        "database_maintenance_scheduled_failure",
        1,
        {
          error: error.message,
          code: error.code,
        }
      );
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      options: this.options,
      lastHealthCheck: this.lastHealthCheck,
      lastMaintenance: this.lastMaintenance,
      intervals: {
        monitoring: !!this.intervals.monitoring,
        maintenance: !!this.intervals.maintenance,
        healthCheck: !!this.intervals.healthCheck,
      },
    };
  }

  // Manual trigger methods for admin use
  async triggerHealthCheck() {
    logger.info("Manually triggering database health check...");
    await this.performHealthCheckMonitoring();
    return this.lastHealthCheck;
  }

  async triggerMaintenance() {
    logger.info("Manually triggering database maintenance...");
    await this.performMaintenanceCheck();
    return this.lastMaintenance;
  }

  async triggerMonitoring() {
    logger.info("Manually triggering database monitoring...");
    return await this.performMonitoring();
  }
}

// Create singleton instance
const databaseMonitor = new DatabaseMonitor({
  monitoringInterval: parseInt(process.env.DB_MONITORING_INTERVAL) || 30000,
  maintenanceInterval: parseInt(process.env.DB_MAINTENANCE_INTERVAL) || 3600000,
  healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 60000,
  enabled: process.env.DB_MONITORING_ENABLED !== "false",
});

module.exports = {
  DatabaseMonitor,
  databaseMonitor,
};
