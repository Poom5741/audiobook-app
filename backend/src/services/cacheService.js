const Redis = require('ioredis');
const { createLogger, createMetricsLogger } = require('../../shared/logger');

const logger = createLogger('cache-service');
const metricsLogger = createMetricsLogger('cache-service');

// Redis configuration with cluster support and failover
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB) || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryDelayOnTimeout: 200,
  connectTimeout: 10000,
  lazyConnect: true,
  keepAlive: 30000,
  // Connection pool settings
  family: 4,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  // Serialization settings
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'audiobook:',
};

// Initialize Redis client with error handling
let redis;
try {
  redis = new Redis(redisConfig);
  
  redis.on('connect', () => {
    logger.info('Redis client connected');
    metricsLogger.logBusinessMetric('redis_connection_established', 1);
  });
  
  redis.on('ready', () => {
    logger.info('Redis client ready');
    metricsLogger.logBusinessMetric('redis_ready', 1);
  });
  
  redis.on('error', (error) => {
    logger.error('Redis client error:', {
      error: error.message,
      code: error.code,
      errno: error.errno
    });
    metricsLogger.logBusinessMetric('redis_error', 1, {
      error: error.message
    });
  });
  
  redis.on('close', () => {
    logger.warn('Redis connection closed');
    metricsLogger.logBusinessMetric('redis_connection_closed', 1);
  });
  
  redis.on('reconnecting', (ms) => {
    logger.info(`Redis reconnecting in ${ms}ms`);
    metricsLogger.logBusinessMetric('redis_reconnecting', 1, { delay: ms });
  });
  
} catch (error) {
  logger.error('Failed to initialize Redis client:', error);
  redis = null;
}

// Cache key generators
const CacheKeys = {
  // Book-related caches
  book: (id) => `book:${id}`,
  bookList: (params) => `books:list:${JSON.stringify(params)}`,
  bookProgress: (id) => `book:progress:${id}`,
  bookChapters: (id) => `book:chapters:${id}`,
  
  // Chapter-related caches
  chapter: (id) => `chapter:${id}`,
  chapterAudio: (id) => `chapter:audio:${id}`,
  
  // User-related caches
  user: (id) => `user:${id}`,
  userBooks: (userId, params) => `user:${userId}:books:${JSON.stringify(params)}`,
  
  // Search caches
  search: (query, params) => `search:${query}:${JSON.stringify(params)}`,
  
  // TTS job caches
  ttsQueue: (status) => `tts:queue:${status}`,
  ttsJob: (id) => `tts:job:${id}`,
  
  // Audio file metadata
  audioMeta: (path) => `audio:meta:${path}`,
  
  // API response caches
  api: (endpoint, params) => `api:${endpoint}:${JSON.stringify(params)}`,
  
  // Health check cache
  health: () => 'health:status'
};

// Default TTL values (in seconds)
const TTL = {
  SHORT: 300,      // 5 minutes
  MEDIUM: 1800,    // 30 minutes  
  LONG: 3600,      // 1 hour
  VERY_LONG: 86400, // 24 hours
  BOOK_DATA: 3600,     // 1 hour for book metadata
  AUDIO_META: 86400,   // 24 hours for audio file metadata
  SEARCH: 1800,        // 30 minutes for search results
  USER_DATA: 3600,     // 1 hour for user data
  API_RESPONSE: 300,   // 5 minutes for API responses
  QUEUE_STATUS: 60     // 1 minute for queue status
};

// Cache service class
class CacheService {
  constructor() {
    this.client = redis;
    this.isAvailable = !!redis;
  }

  // Check if cache is available
  isReady() {
    return this.isAvailable && this.client && this.client.status === 'ready';
  }

  // Generic get method with metrics
  async get(key, defaultValue = null) {
    if (!this.isReady()) {
      logger.debug('Cache not available, returning default value', { key });
      return defaultValue;
    }

    try {
      const startTime = Date.now();
      const result = await this.client.get(key);
      const duration = Date.now() - startTime;
      
      if (result !== null) {
        logger.debug('Cache hit', { key, duration });
        metricsLogger.logPerformance('cache_get_hit', duration, { key });
        return JSON.parse(result);
      } else {
        logger.debug('Cache miss', { key, duration });
        metricsLogger.logPerformance('cache_get_miss', duration, { key });
        return defaultValue;
      }
    } catch (error) {
      logger.error('Cache get error:', { key, error: error.message });
      metricsLogger.logBusinessMetric('cache_get_error', 1, { key, error: error.message });
      return defaultValue;
    }
  }

  // Generic set method with metrics
  async set(key, value, ttl = TTL.MEDIUM) {
    if (!this.isReady()) {
      logger.debug('Cache not available, skipping set', { key });
      return false;
    }

    try {
      const startTime = Date.now();
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      const duration = Date.now() - startTime;
      
      logger.debug('Cache set', { key, ttl, duration, size: serialized.length });
      metricsLogger.logPerformance('cache_set', duration, { 
        key, 
        ttl, 
        size: serialized.length 
      });
      return true;
    } catch (error) {
      logger.error('Cache set error:', { key, error: error.message });
      metricsLogger.logBusinessMetric('cache_set_error', 1, { key, error: error.message });
      return false;
    }
  }

  // Delete cache entry
  async del(key) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const result = await this.client.del(key);
      logger.debug('Cache delete', { key, deleted: result > 0 });
      metricsLogger.logBusinessMetric('cache_delete', 1, { key, deleted: result > 0 });
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', { key, error: error.message });
      metricsLogger.logBusinessMetric('cache_delete_error', 1, { key, error: error.message });
      return false;
    }
  }

  // Delete multiple cache entries by pattern
  async deletePattern(pattern) {
    if (!this.isReady()) {
      return 0;
    }

    try {
      const keys = await this.client.keys(`${redisConfig.keyPrefix}${pattern}`);
      if (keys.length > 0) {
        const result = await this.client.del(...keys);
        logger.info('Cache pattern delete', { pattern, keysDeleted: result });
        metricsLogger.logBusinessMetric('cache_pattern_delete', result, { pattern });
        return result;
      }
      return 0;
    } catch (error) {
      logger.error('Cache pattern delete error:', { pattern, error: error.message });
      metricsLogger.logBusinessMetric('cache_pattern_delete_error', 1, { pattern, error: error.message });
      return 0;
    }
  }

  // Check if key exists
  async exists(key) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error: error.message });
      return false;
    }
  }

  // Get TTL for a key
  async ttl(key) {
    if (!this.isReady()) {
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error:', { key, error: error.message });
      return -1;
    }
  }

  // Increment counter
  async incr(key, ttl = TTL.LONG) {
    if (!this.isReady()) {
      return 0;
    }

    try {
      const result = await this.client.incr(key);
      if (result === 1) {
        // Set TTL only on first increment
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error('Cache increment error:', { key, error: error.message });
      return 0;
    }
  }

  // Set with atomic operations
  async setMultiple(keyValuePairs, ttl = TTL.MEDIUM) {
    if (!this.isReady() || !keyValuePairs || Object.keys(keyValuePairs).length === 0) {
      return false;
    }

    try {
      const pipeline = this.client.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serialized = JSON.stringify(value);
        pipeline.setex(key, ttl, serialized);
      }
      
      const results = await pipeline.exec();
      const successCount = results.filter(([err, result]) => !err && result === 'OK').length;
      
      logger.debug('Cache multi-set', { 
        total: Object.keys(keyValuePairs).length,
        successful: successCount,
        ttl 
      });
      
      metricsLogger.logBusinessMetric('cache_multi_set', successCount, { 
        total: Object.keys(keyValuePairs).length,
        ttl 
      });
      
      return successCount === Object.keys(keyValuePairs).length;
    } catch (error) {
      logger.error('Cache multi-set error:', { error: error.message });
      metricsLogger.logBusinessMetric('cache_multi_set_error', 1, { error: error.message });
      return false;
    }
  }

  // Get cache statistics
  async getStats() {
    if (!this.isReady()) {
      return {
        status: 'unavailable',
        isReady: false
      };
    }

    try {
      const info = await this.client.info('memory');
      const dbsize = await this.client.dbsize();
      
      const memoryLines = info.split('\r\n');
      const usedMemory = memoryLines.find(line => line.startsWith('used_memory:'))?.split(':')[1];
      const maxMemory = memoryLines.find(line => line.startsWith('maxmemory:'))?.split(':')[1];
      
      return {
        status: 'available',
        isReady: true,
        dbsize,
        usedMemory,
        maxMemory,
        clientStatus: this.client.status,
        keyPrefix: redisConfig.keyPrefix
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return {
        status: 'error',
        isReady: false,
        error: error.message
      };
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isReady()) {
        return {
          status: 'unhealthy',
          error: 'Redis client not ready'
        };
      }

      const startTime = Date.now();
      const testKey = CacheKeys.health();
      const testValue = { timestamp: Date.now(), test: true };
      
      await this.set(testKey, testValue, 60);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      
      const responseTime = Date.now() - startTime;
      
      if (retrieved && retrieved.test === true) {
        return {
          status: 'healthy',
          responseTime,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          status: 'unhealthy',
          error: 'Cache read/write test failed'
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Graceful shutdown
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis client connection closed gracefully');
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
      }
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = {
  cacheService,
  CacheKeys,
  TTL
};