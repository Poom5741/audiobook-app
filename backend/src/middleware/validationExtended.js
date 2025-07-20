const Joi = require("joi");
const { z } = require("zod");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("validation-extended");
const metricsLogger = createMetricsLogger("validation-extended");

/**
 * Enhanced validation middleware with more features and better error handling
 */

// Custom Joi extensions for advanced validation
const customJoi = Joi.extend((joi) => ({
  type: "stringArray",
  base: joi.array(),
  coerce: {
    from: "string",
    method(value) {
      if (typeof value !== "string") return { value };
      return { value: value.split(",").map((s) => s.trim()) };
    },
  },
}));

// Enhanced error formatting for better client responses
const formatValidationErrors = (errors, source = "joi") => {
  const formattedErrors = {
    _summary: [],
    fields: {},
  };

  if (source === "joi") {
    errors.details.forEach((error) => {
      const path = error.path.join(".");
      formattedErrors.fields[path] = error.message;
      formattedErrors._summary.push({
        path,
        message: error.message,
        type: error.type,
      });
    });
  } else if (source === "zod") {
    errors.issues.forEach((issue) => {
      const path = issue.path.join(".");
      formattedErrors.fields[path] = issue.message;
      formattedErrors._summary.push({
        path,
        message: issue.message,
        code: issue.code,
      });
    });
  }

  return formattedErrors;
};

/**
 * Enhanced Joi validation middleware with better error handling and metrics
 * @param {Object} schema - Joi schema
 * @param {String} source - Request property to validate (body, query, params)
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware
 */
const validateJoiExtended = (schema, source = "body", options = {}) => {
  const {
    abortEarly = false,
    stripUnknown = true,
    convert = true,
    allowUnknown = false,
    statusCode = 400,
    errorTransformer = null,
  } = options;

  return (req, res, next) => {
    const startTime = Date.now();
    const dataToValidate = req[source];

    const validationOptions = {
      abortEarly,
      stripUnknown,
      convert,
      allowUnknown,
    };

    const { error, value } = schema.validate(dataToValidate, validationOptions);

    const duration = Date.now() - startTime;
    metricsLogger.logPerformance("validation_duration", duration, {
      source,
      path: req.path,
      method: req.method,
    });

    if (error) {
      logger.warn("Joi validation failed", {
        source,
        errors: error.details.map((d) => d.message),
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration,
      });

      metricsLogger.logBusinessMetric("validation_failure", 1, {
        source,
        path: req.path,
        method: req.method,
        errorCount: error.details.length,
      });

      // Format errors
      let formattedErrors = formatValidationErrors(error, "joi");

      // Apply custom error transformer if provided
      if (errorTransformer) {
        formattedErrors = errorTransformer(formattedErrors, error, req);
      }

      return res.status(statusCode).json({
        success: false,
        message: "Validation failed",
        errors: formattedErrors,
      });
    }

    // Replace the request data with validated/sanitized version
    req[source] = value;

    metricsLogger.logBusinessMetric("validation_success", 1, {
      source,
      path: req.path,
      method: req.method,
    });

    next();
  };
};

/**
 * Enhanced Zod validation middleware with better error handling and metrics
 * @param {Object} schema - Zod schema
 * @param {String} source - Request property to validate (body, query, params)
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware
 */
const validateZodExtended = (schema, source = "body", options = {}) => {
  const { statusCode = 400, errorTransformer = null } = options;

  return (req, res, next) => {
    const startTime = Date.now();
    const dataToValidate = req[source];

    try {
      const validatedData = schema.parse(dataToValidate);
      req[source] = validatedData;

      const duration = Date.now() - startTime;
      metricsLogger.logPerformance("validation_duration", duration, {
        source,
        path: req.path,
        method: req.method,
      });

      metricsLogger.logBusinessMetric("validation_success", 1, {
        source,
        path: req.path,
        method: req.method,
      });

      next();
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.warn("Zod validation failed", {
        source,
        errors: error.issues.map((i) => i.message),
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration,
      });

      metricsLogger.logBusinessMetric("validation_failure", 1, {
        source,
        path: req.path,
        method: req.method,
        errorCount: error.issues.length,
      });

      // Format errors
      let formattedErrors = formatValidationErrors(error, "zod");

      // Apply custom error transformer if provided
      if (errorTransformer) {
        formattedErrors = errorTransformer(formattedErrors, error, req);
      }

      return res.status(statusCode).json({
        success: false,
        message: "Validation failed",
        errors: formattedErrors,
      });
    }
  };
};

/**
 * Validate multiple parts of the request at once (body, query, params)
 * @param {Object} schemas - Object containing schemas for different parts of the request
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware
 */
const validateRequest = (schemas, options = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    const errors = {};
    let hasErrors = false;

    // Process each schema
    for (const [source, schema] of Object.entries(schemas)) {
      if (!req[source]) continue;

      const isZodSchema = typeof schema.parse === "function";

      try {
        if (isZodSchema) {
          // Zod schema
          req[source] = schema.parse(req[source]);
        } else {
          // Joi schema
          const { error, value } = schema.validate(req[source], {
            abortEarly: false,
            stripUnknown: true,
            convert: true,
          });

          if (error) {
            errors[source] = formatValidationErrors(error, "joi");
            hasErrors = true;
          } else {
            req[source] = value;
          }
        }
      } catch (error) {
        // Zod error
        if (isZodSchema) {
          errors[source] = formatValidationErrors(error, "zod");
          hasErrors = true;
        } else {
          throw error;
        }
      }
    }

    const duration = Date.now() - startTime;

    if (hasErrors) {
      logger.warn("Multi-part validation failed", {
        errors,
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration,
      });

      metricsLogger.logBusinessMetric("validation_failure", 1, {
        path: req.path,
        method: req.method,
      });

      return res.status(options.statusCode || 400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    metricsLogger.logPerformance("validation_duration", duration, {
      path: req.path,
      method: req.method,
    });

    metricsLogger.logBusinessMetric("validation_success", 1, {
      path: req.path,
      method: req.method,
    });

    next();
  };
};

/**
 * Sanitize request data to prevent common security issues
 * @param {Array} sources - Request properties to sanitize (body, query, params)
 * @returns {Function} Express middleware
 */
const sanitizeRequest = (sources = ["body", "query", "params"]) => {
  // Common XSS patterns to sanitize
  const xssPatterns = [
    {
      pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      replacement: "",
    },
    { pattern: /javascript:/gi, replacement: "blocked:" },
    { pattern: /on\w+\s*=/gi, replacement: "data-blocked=" },
    { pattern: /eval\s*\(/gi, replacement: "blocked(" },
    { pattern: /expression\s*\(/gi, replacement: "blocked(" },
  ];

  // SQL injection patterns
  const sqlPatterns = [
    { pattern: /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi, replacement: "" },
    {
      pattern: /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi,
      replacement: "",
    },
    {
      pattern: /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi,
      replacement: "",
    },
    { pattern: /((\%27)|(\'))union/gi, replacement: "" },
  ];

  // Sanitize a single value
  const sanitizeValue = (value) => {
    if (typeof value !== "string") return value;

    let sanitized = value;

    // Apply XSS patterns
    xssPatterns.forEach(({ pattern, replacement }) => {
      sanitized = sanitized.replace(pattern, replacement);
    });

    // Apply SQL patterns
    sqlPatterns.forEach(({ pattern, replacement }) => {
      sanitized = sanitized.replace(pattern, replacement);
    });

    return sanitized;
  };

  // Recursively sanitize an object
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => sanitizeObject(item));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        result[key] = sanitizeObject(value);
      } else {
        result[key] = sanitizeValue(value);
      }
    }

    return result;
  };

  return (req, res, next) => {
    try {
      sources.forEach((source) => {
        if (req[source]) {
          req[source] = sanitizeObject(req[source]);
        }
      });
      next();
    } catch (error) {
      logger.error("Sanitization error:", {
        error: error.message,
        requestId: req.requestId,
      });
      next();
    }
  };
};

/**
 * Validate file uploads with comprehensive checks
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware
 */
const validateFileUploads = (options = {}) => {
  const {
    maxFileSize = 100 * 1024 * 1024, // 100MB
    allowedMimeTypes = [
      "application/pdf",
      "application/epub+zip",
      "text/plain",
    ],
    allowedExtensions = [".pdf", ".epub", ".txt"],
    maxFiles = 5,
    fieldName = "file",
  } = options;

  return (req, res, next) => {
    // Skip if no files
    if (!req.files || !req.files[fieldName]) {
      return next();
    }

    const files = Array.isArray(req.files[fieldName])
      ? req.files[fieldName]
      : [req.files[fieldName]];

    // Check number of files
    if (files.length > maxFiles) {
      return res.status(400).json({
        success: false,
        message: `Too many files. Maximum allowed: ${maxFiles}`,
        error: "TOO_MANY_FILES",
      });
    }

    // Validate each file
    for (const file of files) {
      // Check file size
      if (file.size > maxFileSize) {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size: ${
            maxFileSize / (1024 * 1024)
          }MB`,
          error: "FILE_TOO_LARGE",
          file: file.name,
        });
      }

      // Check MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file type. Allowed types: ${allowedMimeTypes.join(
            ", "
          )}`,
          error: "INVALID_FILE_TYPE",
          file: file.name,
          mimetype: file.mimetype,
        });
      }

      // Check file extension
      const extension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf("."));
      if (!allowedExtensions.includes(extension)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file extension. Allowed extensions: ${allowedExtensions.join(
            ", "
          )}`,
          error: "INVALID_FILE_EXTENSION",
          file: file.name,
          extension,
        });
      }
    }

    // All validations passed
    next();
  };
};

// Common validation schemas for reuse
const commonSchemas = {
  joi: {
    id: Joi.string().uuid().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(100).required(),
    name: Joi.string().min(2).max(100).required(),
    date: Joi.date().iso(),
    pagination: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sortBy: Joi.string().default("createdAt"),
      sortOrder: Joi.string().valid("asc", "desc").default("desc"),
    }),
    language: Joi.string()
      .valid("en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko")
      .default("en"),
    // Book related schemas
    book: Joi.object({
      title: Joi.string().min(1).max(500).required(),
      author: Joi.string().min(1).max(500).allow(null, ""),
      isbn: Joi.string().max(20).allow(null, ""),
      language: Joi.string().max(10).default("en"),
      description: Joi.string().allow(null, ""),
      fileType: Joi.string().valid("pdf", "epub", "txt").required(),
    }),
    chapter: Joi.object({
      bookId: Joi.string().uuid().required(),
      chapterNumber: Joi.number().integer().min(1).required(),
      title: Joi.string().min(1).max(500).allow(null, ""),
      textContent: Joi.string().required(),
      audioPath: Joi.string().max(1000).allow(null, ""),
      duration: Joi.number().integer().min(0).allow(null),
      status: Joi.string()
        .valid("pending", "processing", "completed", "failed")
        .default("pending"),
    }),
    // TTS related schemas
    ttsJob: Joi.object({
      chapterId: Joi.string().uuid().required(),
      bookId: Joi.string().uuid().required(),
      text: Joi.string().required(),
      title: Joi.string().allow(null, ""),
      voice: Joi.string().default("default"),
      model: Joi.string().default("default"),
      priority: Joi.number().integer().min(1).max(10).default(5),
    }),
    // Search related schemas
    search: Joi.object({
      query: Joi.string().min(1).required(),
      filters: Joi.object({
        author: Joi.string().allow(null, ""),
        language: Joi.string().allow(null, ""),
        fileType: Joi.string().valid("pdf", "epub", "txt").allow(null, ""),
      }).optional(),
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
      }).optional(),
    }),
    // Download related schemas
    download: Joi.object({
      url: Joi.string().uri().required(),
      title: Joi.string().allow(null, ""),
      author: Joi.string().allow(null, ""),
      priority: Joi.number().integer().min(1).max(10).default(5),
    }),
    // Auto-download related schemas
    autoDownload: Joi.object({
      query: Joi.string().min(1).required(),
      schedule: Joi.string()
        .regex(/^(0|[1-9][0-9]*) (minute|hour|day|week)s?$/)
        .required(),
      maxResults: Joi.number().integer().min(1).max(100).default(10),
      filters: Joi.object({
        author: Joi.string().allow(null, ""),
        language: Joi.string().allow(null, ""),
        fileType: Joi.string().valid("pdf", "epub", "txt").allow(null, ""),
      }).optional(),
      enabled: Joi.boolean().default(true),
    }),
  },
  zod: {
    id: z.string().uuid(),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    name: z.string().min(2).max(100),
    date: z.string().datetime(),
    pagination: z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      sortBy: z.string().default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }),
    language: z
      .enum(["en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko"])
      .default("en"),
    // Book related schemas
    book: z.object({
      title: z.string().min(1).max(500),
      author: z.string().max(500).optional().nullable(),
      isbn: z.string().max(20).optional().nullable(),
      language: z.string().max(10).default("en"),
      description: z.string().optional().nullable(),
      fileType: z.enum(["pdf", "epub", "txt"]),
    }),
    chapter: z.object({
      bookId: z.string().uuid(),
      chapterNumber: z.number().int().min(1),
      title: z.string().max(500).optional().nullable(),
      textContent: z.string(),
      audioPath: z.string().max(1000).optional().nullable(),
      duration: z.number().int().min(0).optional().nullable(),
      status: z
        .enum(["pending", "processing", "completed", "failed"])
        .default("pending"),
    }),
    // TTS related schemas
    ttsJob: z.object({
      chapterId: z.string().uuid(),
      bookId: z.string().uuid(),
      text: z.string(),
      title: z.string().optional().nullable(),
      voice: z.string().default("default"),
      model: z.string().default("default"),
      priority: z.number().int().min(1).max(10).default(5),
    }),
    // Search related schemas
    search: z.object({
      query: z.string().min(1),
      filters: z
        .object({
          author: z.string().optional().nullable(),
          language: z.string().optional().nullable(),
          fileType: z.enum(["pdf", "epub", "txt"]).optional().nullable(),
        })
        .optional(),
      pagination: z
        .object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    }),
    // Download related schemas
    download: z.object({
      url: z.string().url(),
      title: z.string().optional().nullable(),
      author: z.string().optional().nullable(),
      priority: z.number().int().min(1).max(10).default(5),
    }),
    // Auto-download related schemas
    autoDownload: z.object({
      query: z.string().min(1),
      schedule: z.string().regex(/^(0|[1-9][0-9]*) (minute|hour|day|week)s?$/),
      maxResults: z.number().int().min(1).max(100).default(10),
      filters: z
        .object({
          author: z.string().optional().nullable(),
          language: z.string().optional().nullable(),
          fileType: z.enum(["pdf", "epub", "txt"]).optional().nullable(),
        })
        .optional(),
      enabled: z.boolean().default(true),
    }),
  },
};

module.exports = {
  validateJoiExtended,
  validateZodExtended,
  validateRequest,
  sanitizeRequest,
  validateFileUploads,
  formatValidationErrors,
  customJoi,
  commonSchemas,
};
