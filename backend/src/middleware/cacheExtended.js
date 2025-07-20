const { cacheService, CacheKeys, TTL } = require("../services/cacheService");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("cache-extended");
const metricsLogger = createMetricsLogger("cache-extended");

/**
 * Advanced cache middleware with more granular control and features
 * @param {Object} options - Cache options
 * @returns {Function} Express middleware
 */
const advancedCache = (options = {}) => {
  const {
    ttl = TTL.API_RESPONSE,
    keyGenerator = null,
    condition = null,
    skipCache = false,
    staleWhileRevalidate = false,
    staleIfError = true,
    cacheTags = [],
    varyBy = [],
    compress = false,
    maxSize = 1024 * 1024, // 1MB max size for cached items
    serializeResponse = true,
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

      // Build vary-by components
      const varyComponents = {};
      if (varyBy.includes("user")) {
        varyComponents.userId = req.user?.id || "anonymous";
      }
      if (varyBy.includes("language")) {
        varyComponents.lang = req.headers["accept-language"] || "en";
      }
      if (varyBy.includes("device")) {
        varyComponents.device = req.headers["user-agent"]?.includes("Mobile")
          ? "mobile"
          : "desktop";
      }

      const keyData = {
        method,
        url: originalUrl,
        query: Object.keys(query).length > 0 ? query : undefined,
        body:
          method !== "GET" && Object.keys(body || {}).length > 0
            ? body
            : undefined,
        vary:
          Object.keys(varyComponents).length > 0 ? varyComponents : undefined,
      };

      cacheKey = CacheKeys.api(originalUrl, keyData);
    }

    // Only cache GET and HEAD requests by default
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }

    try {
      // Try to get from cache
      const cachedResponse = await cacheService.get(cacheKey);

      if (cachedResponse) {
        // Check if stale
        const isStale = Date.now() - cachedResponse.timestamp > ttl * 1000;

        if (!isStale || staleWhileRevalidate) {
          logger.debug("Serving cached response", {
            cacheKey,
            method: req.method,
            url: req.originalUrl,
            isStale,
          });

          // Set cache headers
          res.set({
            "X-Cache": isStale ? "STALE" : "HIT",
            "X-Cache-Key": cacheKey,
            "Cache-Control": isStale ? "no-cache" : `public, max-age=${ttl}`,
          });

          // If stale, revalidate in background
          if (isStale && staleWhileRevalidate) {
            logger.debug("Revalidating stale cache in background", {
              cacheKey,
            });
            setImmediate(() => {
              // Execute the original request in background to refresh cache
              // This is a simplified implementation - in production you'd want to use a queue
              const originalReq = { ...req };
              const mockRes = {
                status: () => mockRes,
                json: () => {},
                set: () => {},
              };

              // Skip cache for this request to avoid infinite loop
              originalReq.skipCache = true;

              // Execute the route handler again
              try {
                // This is a simplified approach - in a real implementation,
                // you'd need to capture the route handler and re-execute it
                next();
              } catch (error) {
                logger.error("Background cache revalidation failed", {
                  error: error.message,
                  cacheKey,
                });
              }
            });
          }

          return res.status(cachedResponse.status).json(cachedResponse.data);
        }
      }

      // Cache miss - intercept response
      const originalSend = res.json;
      const originalStatus = res.status;
      let statusCode = 200;

      // Override status method to capture status code
      res.status = function (code) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json method to cache response
      res.json = function (data) {
        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
          const responseData = {
            status: statusCode,
            data: data,
            timestamp: Date.now(),
            tags: cacheTags,
          };

          // Check response size if needed
          if (compress || maxSize) {
            const responseSize = JSON.stringify(responseData).length;

            if (responseSize > maxSize) {
              logger.warn("Response too large to cache", {
                cacheKey,
                size: responseSize,
                maxSize,
              });

              // Set cache headers
              res.set({
                "X-Cache": "BYPASS",
                "X-Cache-Key": cacheKey,
                "X-Cache-Reason": "Response too large",
              });

              return originalSend.call(this, data);
            }
          }

          // Cache the response asynchronously
          cacheService
            .set(cacheKey, responseData, ttl)
            .then((success) => {
              if (success) {
                logger.debug("Response cached", {
                  cacheKey,
                  status: statusCode,
                  ttl,
                  tags: cacheTags,
                });

                // Store cache tags for later invalidation
                if (cacheTags.length > 0) {
                  cacheService
                    .addTagsToKey(cacheKey, cacheTags)
                    .catch((error) => {
                      logger.warn("Failed to add tags to cached key", {
                        cacheKey,
                        tags: cacheTags,
                        error: error.message,
                      });
                    });
                }
              }
            })
            .catch((error) => {
              logger.warn("Failed to cache response", {
                cacheKey,
                error: error.message,
              });
            });
        }

        // Set cache headers
        res.set({
          "X-Cache": "MISS",
          "X-Cache-Key": cacheKey,
        });

        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      logger.error("Cache middleware error:", {
        error: error.message,
        cacheKey,
        url: req.originalUrl,
      });
      next();
    }
  };
};

/**
 * Tag-based cache invalidation middleware
 * @param {Array|String} tags - Cache tags to invalidate
 * @returns {Function} Express middleware
 */
const invalidateCacheByTags = (tags) => {
  return async (req, res, next) => {
    if (!Array.isArray(tags)) {
      tags = [tags];
    }

    // Store tags for post-response invalidation
    req.cacheInvalidationTags = tags;

    // Override response methods to invalidate after successful response
    const originalSend = res.json;

    res.json = function (data) {
      const result = originalSend.call(this, data);

      // Invalidate cache asynchronously after response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(async () => {
          try {
            for (const tag of req.cacheInvalidationTags) {
              const deletedCount = await cacheService.invalidateByTag(tag);
              if (deletedCount > 0) {
                logger.info("Cache invalidated by tag", {
                  tag,
                  deletedKeys: deletedCount,
                  method: req.method,
                  url: req.originalUrl,
                });

                metricsLogger.logBusinessMetric(
                  "cache_invalidation_by_tag",
                  deletedCount,
                  {
                    tag,
                    method: req.method,
                    path: req.path,
                  }
                );
              }
            }
          } catch (error) {
            logger.error("Cache tag invalidation error:", {
              tags: req.cacheInvalidationTags,
              error: error.message,
            });
          }
        });
      }

      return result;
    };

    next();
  };
};

/**
 * Conditional cache middleware that only caches responses based on dynamic conditions
 * @param {Function} conditionFn - Function that returns true if response should be cached
 * @param {Object} options - Cache options
 * @returns {Function} Express middleware
 */
const conditionalCache = (conditionFn, options = {}) => {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to check condition before caching
    res.json = function (data) {
      // Check condition with response data
      const shouldCache = conditionFn(req, res, data);

      // Apply cache middleware if condition is met
      if (shouldCache) {
        // Restore original json method
        res.json = originalJson;

        // Apply cache middleware
        const middleware = advancedCache(options);
        middleware(req, res, () => {
          // Call the original json method with data
          res.json(data);
        });
      } else {
        // Set cache bypass header
        res.set("X-Cache", "BYPASS");

        // Call original json method
        return originalJson.call(this, data);
      }
    };

    next();
  };
};

/**
 * Cache prefetcher middleware that warms up cache for related resources
 * @param {Function} prefetchFn - Function that returns resources to prefetch
 * @returns {Function} Express middleware
 */
const cachePrefetcher = (prefetchFn) => {
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to prefetch related resources
    res.json = function (data) {
      // Call original json method first
      const result = originalJson.call(this, data);

      // Prefetch related resources asynchronously
      setImmediate(async () => {
        try {
          const resources = prefetchFn(req, res, data);

          if (resources && resources.length > 0) {
            logger.debug("Prefetching cache for related resources", {
              count: resources.length,
              resources: resources.map((r) => r.url).join(", "),
            });

            // Prefetch each resource
            for (const resource of resources) {
              try {
                // This is a simplified implementation - in production you'd want to use a queue
                // or a more sophisticated approach to avoid overloading the server
                const { url, ttl, key } = resource;

                // Fetch resource
                const response = await fetch(url);
                const resourceData = await response.json();

                // Cache resource
                await cacheService.set(
                  key,
                  {
                    status: response.status,
                    data: resourceData,
                    timestamp: Date.now(),
                  },
                  ttl || TTL.MEDIUM
                );

                logger.debug("Prefetched and cached resource", { url, key });
              } catch (resourceError) {
                logger.error("Failed to prefetch resource", {
                  resource,
                  error: resourceError.message,
                });
              }
            }
          }
        } catch (error) {
          logger.error("Cache prefetching error:", {
            error: error.message,
          });
        }
      });

      return result;
    };

    next();
  };
};

/**
 * Cache analytics middleware that tracks cache hit/miss rates
 * @returns {Function} Express middleware
 */
const cacheAnalytics = () => {
  return (req, res, next) => {
    // Track cache hit/miss
    const trackCacheStatus = () => {
      const cacheStatus = res.getHeader("X-Cache");

      if (cacheStatus) {
        metricsLogger.logBusinessMetric(
          `cache_${cacheStatus.toLowerCase()}`,
          1,
          {
            path: req.path,
            method: req.method,
          }
        );
      }
    };

    // Override end method to track cache status
    const originalEnd = res.end;
    res.end = function (...args) {
      trackCacheStatus();
      return originalEnd.apply(this, args);
    };

    next();
  };
};

// Predefined cache configurations for common use cases
const cacheConfigs = {
  // Fast changing data - short TTL
  dynamic: {
    ttl: TTL.SHORT,
    staleWhileRevalidate: true,
  },

  // Rarely changing data - long TTL
  static: {
    ttl: TTL.VERY_LONG,
    staleWhileRevalidate: false,
  },

  // User-specific data
  userSpecific: {
    ttl: TTL.MEDIUM,
    varyBy: ["user"],
    staleWhileRevalidate: true,
  },

  // Search results
  search: {
    ttl: TTL.SEARCH,
    compress: true,
    maxSize: 2 * 1024 * 1024, // 2MB
  },

  // API responses
  api: {
    ttl: TTL.API_RESPONSE,
    staleWhileRevalidate: true,
    staleIfError: true,
  },
};

// Export enhanced cache middleware
module.exports = {
  advancedCache,
  invalidateCacheByTags,
  conditionalCache,
  cachePrefetcher,
  cacheAnalytics,
  cacheConfigs,
};
