const { cacheService, CacheKeys, TTL } = require('../services/cacheService');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('cache-middleware');

// Cache middleware for API responses
const cacheMiddleware = (options = {}) => {
  const {
    ttl = TTL.API_RESPONSE,
    keyGenerator = null,
    condition = null,
    skipCache = false
  } = options;

  return async (req, res, next) => {
    // Skip caching if disabled or conditions not met
    if (skipCache || !cacheService.isReady()) {
      return next();
    }

    // Check condition function if provided
    if (condition && !condition(req)) {
      return next();
    }

    // Generate cache key
    let cacheKey;
    if (keyGenerator) {
      cacheKey = keyGenerator(req);
    } else {
      const { method, originalUrl, query, body } = req;
      const keyData = {
        method,
        url: originalUrl,
        query: Object.keys(query).length > 0 ? query : undefined,
        body: method !== 'GET' && Object.keys(body || {}).length > 0 ? body : undefined
      };
      cacheKey = CacheKeys.api(originalUrl, keyData);
    }

    // Only cache GET requests by default
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Try to get from cache
      const cachedResponse = await cacheService.get(cacheKey);
      
      if (cachedResponse) {
        logger.debug('Serving cached response', { 
          cacheKey, 
          method: req.method, 
          url: req.originalUrl 
        });
        
        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
          'Cache-Control': `public, max-age=${ttl}`
        });
        
        return res.status(cachedResponse.status).json(cachedResponse.data);
      }

      // Cache miss - intercept response
      const originalSend = res.json;
      const originalStatus = res.status;
      let statusCode = 200;

      // Override status method to capture status code
      res.status = function(code) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json method to cache response
      res.json = function(data) {
        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
          const responseData = {
            status: statusCode,
            data: data,
            timestamp: Date.now()
          };
          
          // Cache the response asynchronously
          cacheService.set(cacheKey, responseData, ttl)
            .then(success => {
              if (success) {
                logger.debug('Response cached', { 
                  cacheKey, 
                  status: statusCode,
                  ttl
                });
              }
            })
            .catch(error => {
              logger.warn('Failed to cache response', { 
                cacheKey, 
                error: error.message 
              });
            });
        }

        // Set cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey
        });

        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', { 
        error: error.message, 
        cacheKey,
        url: req.originalUrl 
      });
      next();
    }
  };
};

// Cache invalidation middleware
const invalidateCache = (patterns) => {
  return async (req, res, next) => {
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }

    // Store patterns for post-response invalidation
    req.cacheInvalidationPatterns = patterns;
    
    // Override response methods to invalidate after successful response
    const originalSend = res.json;
    
    res.json = function(data) {
      const result = originalSend.call(this, data);
      
      // Invalidate cache asynchronously after response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(async () => {
          try {
            for (const pattern of req.cacheInvalidationPatterns) {
              const deletedCount = await cacheService.deletePattern(pattern);
              if (deletedCount > 0) {
                logger.info('Cache invalidated', { 
                  pattern, 
                  deletedKeys: deletedCount,
                  method: req.method,
                  url: req.originalUrl
                });
              }
            }
          } catch (error) {
            logger.error('Cache invalidation error:', { 
              patterns: req.cacheInvalidationPatterns,
              error: error.message 
            });
          }
        });
      }
      
      return result;
    };

    next();
  };
};

// Specific cache middleware functions
const cacheBookList = cacheMiddleware({
  ttl: TTL.BOOK_DATA,
  keyGenerator: (req) => CacheKeys.bookList(req.query),
  condition: (req) => req.method === 'GET'
});

const cacheBook = cacheMiddleware({
  ttl: TTL.BOOK_DATA,
  keyGenerator: (req) => CacheKeys.book(req.params.id || req.params.bookId),
  condition: (req) => req.method === 'GET' && (req.params.id || req.params.bookId)
});

const cacheBookProgress = cacheMiddleware({
  ttl: TTL.SHORT,
  keyGenerator: (req) => CacheKeys.bookProgress(req.params.id || req.params.bookId),
  condition: (req) => req.method === 'GET' && (req.params.id || req.params.bookId)
});

const cacheChapters = cacheMiddleware({
  ttl: TTL.BOOK_DATA,
  keyGenerator: (req) => CacheKeys.bookChapters(req.params.bookId),
  condition: (req) => req.method === 'GET' && req.params.bookId
});

const cacheSearch = cacheMiddleware({
  ttl: TTL.SEARCH,
  keyGenerator: (req) => CacheKeys.search(req.query.q || '', req.query),
  condition: (req) => req.method === 'GET' && req.query.q
});

const cacheTTSQueue = cacheMiddleware({
  ttl: TTL.QUEUE_STATUS,
  keyGenerator: (req) => CacheKeys.ttsQueue(req.query.status || 'all'),
  condition: (req) => req.method === 'GET'
});

const cacheUser = cacheMiddleware({
  ttl: TTL.USER_DATA,
  keyGenerator: (req) => CacheKeys.user(req.user?.id || req.params.userId),
  condition: (req) => req.method === 'GET' && (req.user?.id || req.params.userId)
});

// Cache invalidation patterns
const invalidateBookCache = invalidateCache([
  'book:*',
  'books:list:*',
  'search:*'
]);

const invalidateChapterCache = (bookId) => invalidateCache([
  `book:chapters:${bookId}`,
  `book:progress:${bookId}`,
  `chapter:*`
]);

const invalidateUserCache = (userId) => invalidateCache([
  `user:${userId}*`,
  'books:list:*' // User-specific book lists
]);

const invalidateSearchCache = invalidateCache([
  'search:*'
]);

// Cache warming functions
const warmBookCache = async (bookId) => {
  try {
    // This would typically fetch and cache book data
    logger.info('Warming book cache', { bookId });
    // Implementation would go here
  } catch (error) {
    logger.error('Error warming book cache:', { bookId, error: error.message });
  }
};

// Cache health check middleware
const cacheHealthCheck = async (req, res, next) => {
  try {
    const health = await cacheService.healthCheck();
    req.cacheHealth = health;
    next();
  } catch (error) {
    req.cacheHealth = { status: 'error', error: error.message };
    next();
  }
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  
  // Specific middleware
  cacheBookList,
  cacheBook,
  cacheBookProgress,
  cacheChapters,
  cacheSearch,
  cacheTTSQueue,
  cacheUser,
  
  // Invalidation functions
  invalidateBookCache,
  invalidateChapterCache,
  invalidateUserCache,
  invalidateSearchCache,
  
  // Utility functions
  warmBookCache,
  cacheHealthCheck
};