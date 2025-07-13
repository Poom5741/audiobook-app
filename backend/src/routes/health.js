const express = require('express');
const router = express.Router();
const { cacheService } = require('../services/cacheService');
const { healthCheck } = require('../services/database');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('health');

// GET /api/health - Comprehensive health check
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Check individual services
    const [dbHealth, cacheHealth] = await Promise.allSettled([
      healthCheck(),
      cacheService.healthCheck()
    ]);
    
    const responseTime = Date.now() - startTime;
    
    // Determine overall status
    const dbStatus = dbHealth.status === 'fulfilled' ? dbHealth.value.status : 'unhealthy';
    const cacheStatus = cacheHealth.status === 'fulfilled' ? cacheHealth.value.status : 'unhealthy';
    
    const isHealthy = dbStatus === 'healthy';
    const isCacheHealthy = cacheStatus === 'healthy';
    
    const overallStatus = isHealthy && isCacheHealthy ? 'healthy' : 
                         isHealthy ? 'degraded' : 'unhealthy';
    
    const healthData = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime,
      services: {
        database: dbHealth.status === 'fulfilled' ? dbHealth.value : {
          status: 'unhealthy',
          error: dbHealth.reason?.message || 'Database check failed'
        },
        cache: cacheHealth.status === 'fulfilled' ? cacheHealth.value : {
          status: 'unhealthy',
          error: cacheHealth.reason?.message || 'Cache check failed'
        }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      }
    };
    
    // Log health check
    logger.info('Health check completed', {
      status: overallStatus,
      responseTime,
      dbStatus,
      cacheStatus
    });
    
    // Return appropriate status code
    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthData);
    
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      message: error.message
    });
  }
});

// GET /api/health/cache - Cache-specific health check
router.get('/cache', async (req, res) => {
  try {
    const health = await cacheService.healthCheck();
    const stats = await cacheService.getStats();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      health,
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Cache health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/health/database - Database-specific health check  
router.get('/database', async (req, res) => {
  try {
    const health = await healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      ...health,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Database health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/health/ready - Kubernetes readiness probe
router.get('/ready', async (req, res) => {
  try {
    // Quick health checks for readiness
    const dbHealth = await healthCheck();
    const isReady = dbHealth.status === 'healthy';
    
    if (isReady) {
      res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready', 
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// GET /api/health/live - Kubernetes liveness probe
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime()
  });
});

module.exports = router;