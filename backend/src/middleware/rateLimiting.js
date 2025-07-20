const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const Redis = require("ioredis");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("rate-limiting");
const metricsLogger = createMetricsLogger("rate-limiting");

// Redis client for rate limiting
let redisClient;
try {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_RATE_LIMIT_DB) || 1, // Use separate DB for rate limiting
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryDelayOnTimeout: 200,
    connectTimeout: 10000,
    keyPrefix: "ratelimit:",
  });

  redisClient.on("error", (error) => {
    logger.error("Redis rate limit client error:", {
      error: error.message,
      code: error.code,
    });
    metricsLogger.logBusinessMetric("redis_rate_limit_error", 1, {
      error: error.message,
    });
  });
} catch (error) {
  logger.error("Failed to initialize Redis rate limit client:", error);
  redisClient = null;
}

/**
 * Create a rate limiter with the specified options
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100, // 100 requests per minute
    standardHeaders = true,
    legacyHeaders = false,
    message = "Too many requests, please try again later",
    keyGenerator = (req) => req.ip,
    skip = () => false,
    handler = null,
    path = "*",
    method = "*",
  } = options;

  // Default handler with logging
  const defaultHandler = (req, res) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get("User-Agent"),
      requestId: req.requestId || "unknown",
    });

    metricsLogger.logBusinessMetric("rate_limit_exceeded", 1, {
      path: req.originalUrl,
      method: req.method,
    });

    res.status(429).json({
      error: "Too many requests",
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    });
  };

  // Configure rate limiter
  const limiterConfig = {
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    keyGenerator,
    skip,
    handler: handler || defaultHandler,
    // Use Redis store if available, otherwise use memory store
    ...(redisClient
      ? {
          store: new RedisStore({
            sendCommand: (...args) => redisClient.call(...args),
          }),
        }
      : {}),
  };

  const limiter = rateLimit(limiterConfig);

  // Return middleware that only applies to specified path and method
  return (req, res, next) => {
    const pathMatches = path === "*" || req.path.startsWith(path);
    const methodMatches = method === "*" || req.method === method;

    if (pathMatches && methodMatches) {
      limiter(req, res, next);
    } else {
      next();
    }
  };
};

// Predefined rate limiters for common scenarios
const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: "Too many API requests, please try again later",
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 minutes
  message: "Too many login attempts, please try again later",
  path: "/auth",
  method: "POST",
});

const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: "Upload limit reached, please try again later",
  path: "/upload",
  method: "POST",
});

const downloadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 downloads per hour
  message: "Download limit reached, please try again later",
  path: "/download",
});

const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 searches per minute
  message: "Search limit reached, please try again later",
  path: "/search",
});

// IP-based rate limiter for all routes
const ipLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  message: "Too many requests from this IP, please try again later",
});

// Rate limiter for admin routes
const adminLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: "Too many admin requests, please try again later",
  path: "/admin",
});

// Rate limiter for TTS generation
const ttsLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 TTS generations per hour
  message: "TTS generation limit reached, please try again later",
  path: "/tts",
});

// Dynamic rate limiter based on user role
const dynamicRateLimiter = (req, res, next) => {
  const userRole = req.user?.role || "anonymous";

  // Define limits based on user role
  const limits = {
    admin: 1000,
    premium: 500,
    standard: 200,
    anonymous: 50,
  };

  const limit = limits[userRole] || limits.anonymous;

  // Create a rate limiter on-the-fly
  const limiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: limit,
    keyGenerator: (req) => `${req.ip}:${userRole}`,
    message: `Rate limit of ${limit} requests per minute exceeded for ${userRole} role`,
  });

  limiter(req, res, next);
};

// Rate limiting monitoring middleware
const rateLimitMonitor = (req, res, next) => {
  // Store original end function
  const originalEnd = res.end;

  res.end = function (...args) {
    // Check if response is rate limited
    if (res.statusCode === 429) {
      metricsLogger.logBusinessMetric("rate_limit_triggered", 1, {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        requestId: req.requestId || "unknown",
      });
    }

    // Call original end function
    return originalEnd.apply(this, args);
  };

  next();
};

// Health check for rate limiter
const rateLimitHealthCheck = async (req, res, next) => {
  try {
    if (!redisClient) {
      req.rateLimitHealth = {
        status: "degraded",
        message: "Using memory store instead of Redis",
        timestamp: new Date().toISOString(),
      };
    } else {
      const isReady = redisClient.status === "ready";
      req.rateLimitHealth = {
        status: isReady ? "healthy" : "unhealthy",
        message: isReady
          ? "Redis rate limit store is ready"
          : "Redis rate limit store is not ready",
        timestamp: new Date().toISOString(),
      };
    }
    next();
  } catch (error) {
    req.rateLimitHealth = {
      status: "error",
      message: error.message,
      timestamp: new Date().toISOString(),
    };
    next();
  }
};

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  uploadLimiter,
  downloadLimiter,
  searchLimiter,
  ipLimiter,
  adminLimiter,
  ttsLimiter,
  dynamicRateLimiter,
  rateLimitMonitor,
  rateLimitHealthCheck,
};
