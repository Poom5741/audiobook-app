const { RateLimiterMemory, RateLimiterRedis } = require('rate-limiter-flexible');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// Redis client for distributed rate limiting (if available)
let redisClient = null;
try {
  if (process.env.REDIS_URL) {
    const redis = require('redis');
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      logger.warn('Redis client error, falling back to memory-based rate limiting:', err);
      redisClient = null;
    });
  }
} catch (error) {
  logger.warn('Redis not available, using memory-based rate limiting');
}

/**
 * Create rate limiter with Redis or Memory backend
 */
function createRateLimiter(options) {
  if (redisClient) {
    return new RateLimiterRedis({
      storeClient: redisClient,
      ...options
    });
  }
  return new RateLimiterMemory(options);
}

// Different rate limiting tiers
const rateLimiters = {
  // Strict rate limiting for login attempts
  login: createRateLimiter({
    keyGenerator: (req) => `login:${req.ip}:${req.body?.username || 'unknown'}`,
    points: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    duration: (parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60,
    blockDuration: (parseInt(process.env.LOGIN_BLOCK_MINUTES) || 30) * 60,
  }),

  // Rate limiting for password change attempts
  passwordChange: createRateLimiter({
    keyGenerator: (req) => `pwd-change:${req.ip}:${req.user?.userId || 'unknown'}`,
    points: 3, // 3 attempts
    duration: 60 * 60, // per hour
    blockDuration: 60 * 60, // 1 hour block
  }),

  // Rate limiting for token refresh
  tokenRefresh: createRateLimiter({
    keyGenerator: (req) => `refresh:${req.ip}`,
    points: 20, // 20 refreshes
    duration: 60 * 60, // per hour
    blockDuration: 10 * 60, // 10 minute block
  }),

  // General API rate limiting
  general: createRateLimiter({
    keyGenerator: (req) => `general:${req.ip}`,
    points: parseInt(process.env.GENERAL_RATE_LIMIT) || 100,
    duration: 15 * 60, // 15 minutes
    blockDuration: 5 * 60, // 5 minute block
  }),

  // Aggressive rate limiting for suspicious activity
  suspicious: createRateLimiter({
    keyGenerator: (req) => `suspicious:${req.ip}`,
    points: 10,
    duration: 60 * 60, // 1 hour
    blockDuration: 60 * 60, // 1 hour block
  })
};

/**
 * Create rate limiting middleware
 */
function createRateLimitMiddleware(limiterName, options = {}) {
  const limiter = rateLimiters[limiterName];
  const {
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    customKeyGenerator = null,
    onLimitReached = null
  } = options;

  return async (req, res, next) => {
    try {
      // Use custom key generator if provided
      const key = customKeyGenerator ? customKeyGenerator(req) : limiter.keyGenerator(req);
      
      // Check rate limit
      const resRateLimiter = await limiter.consume(key);
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': limiter.points,
        'X-RateLimit-Remaining': resRateLimiter.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + resRateLimiter.msBeforeNext)
      });
      
      next();
    } catch (rejRes) {
      // Rate limit exceeded
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      
      logger.warn(`Rate limit exceeded for ${limiterName}`, {
        ip: req.ip,
        key: rejRes.key || 'unknown',
        remainingPoints: rejRes.remainingPoints,
        msBeforeNext: rejRes.msBeforeNext,
        totalHits: rejRes.totalHits,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      
      // Call custom handler if provided
      if (onLimitReached) {
        onLimitReached(req, res, rejRes);
      }
      
      res.set({
        'Retry-After': String(secs),
        'X-RateLimit-Limit': limiter.points,
        'X-RateLimit-Remaining': rejRes.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext)
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${secs} seconds.`,
        retryAfter: secs,
        type: limiterName
      });
    }
  };
}

/**
 * Suspicious activity detection middleware
 */
function detectSuspiciousActivity(req, res, next) {
  const suspiciousPatterns = [
    // SQL injection patterns
    /(\b(union|select|insert|delete|drop|create|alter|exec)\b)/i,
    // XSS patterns
    /<script|javascript:|data:text\/html/i,
    // Path traversal
    /\.\.\/|\.\.\\|%2e%2e/i,
    // Command injection
    /[;&|`$()]/,
  ];
  
  // Check request body and query parameters
  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
  
  if (isSuspicious) {
    logger.warn('Suspicious activity detected', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      data: requestData
    });
    
    // Apply aggressive rate limiting
    return createRateLimitMiddleware('suspicious')(req, res, next);
  }
  
  next();
}

/**
 * Progressive delay middleware for repeated failures
 */
function createProgressiveDelayMiddleware(identifier) {
  const delays = new Map();
  
  return (req, res, next) => {
    const key = `${identifier}:${req.ip}`;
    const currentDelay = delays.get(key) || 0;
    
    if (currentDelay > 0) {
      setTimeout(() => {
        // Increase delay for next time (exponential backoff)
        delays.set(key, Math.min(currentDelay * 2, 30000)); // Max 30 seconds
        next();
      }, currentDelay);
    } else {
      // First attempt, set initial delay for future failures
      delays.set(key, 1000); // Start with 1 second
      next();
    }
    
    // Reset delay on successful response
    res.on('finish', () => {
      if (res.statusCode < 400) {
        delays.delete(key);
      }
    });
  };
}

/**
 * Rate limit bypass for trusted IPs
 */
function createTrustedIPMiddleware(trustedIPs = []) {
  return (req, res, next) => {
    const clientIP = req.ip;
    
    // Check if IP is in trusted list
    if (trustedIPs.includes(clientIP)) {
      req.trustedIP = true;
      logger.info(`Trusted IP bypassing rate limits: ${clientIP}`);
    }
    
    next();
  };
}

/**
 * Enhanced rate limiting that adapts based on user behavior
 */
function createAdaptiveRateLimiter(baseOptions) {
  const userBehavior = new Map();
  
  return async (req, res, next) => {
    const key = req.ip;
    const behavior = userBehavior.get(key) || { score: 0, lastSeen: Date.now() };
    
    // Update behavior score based on request patterns
    const now = Date.now();
    const timeSinceLastSeen = now - behavior.lastSeen;
    
    // Decrease score over time (rehabilitation)
    if (timeSinceLastSeen > 60000) { // 1 minute
      behavior.score = Math.max(0, behavior.score - 1);
    }
    
    behavior.lastSeen = now;
    
    // Adjust rate limits based on behavior score
    const adjustedOptions = {
      ...baseOptions,
      points: Math.max(1, baseOptions.points - behavior.score),
      blockDuration: baseOptions.blockDuration * (1 + behavior.score * 0.5)
    };
    
    userBehavior.set(key, behavior);
    
    // Apply adjusted rate limiting
    const limiter = createRateLimiter(adjustedOptions);
    
    try {
      await limiter.consume(key);
      next();
    } catch (rejRes) {
      // Increase behavior score on rate limit violation
      behavior.score = Math.min(10, behavior.score + 2);
      userBehavior.set(key, behavior);
      
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: secs
      });
    }
  };
}

module.exports = {
  createRateLimitMiddleware,
  detectSuspiciousActivity,
  createProgressiveDelayMiddleware,
  createTrustedIPMiddleware,
  createAdaptiveRateLimiter,
  rateLimiters
};