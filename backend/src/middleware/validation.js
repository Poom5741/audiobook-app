const { validationResult } = require('express-validator');
const Joi = require('joi');
const { z } = require('zod');
const { createLogger } = require('../../shared/logger');

const logger = createLogger('validation');

const validateRequest = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', {
        errors: errors.array(),
        path: req.path,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    
    next();
  };
};

// Validation error response structure
const formatValidationError = (errors, source = 'joi') => {
  const formattedErrors = {};
  
  if (source === 'joi') {
    errors.details.forEach(error => {
      const path = error.path.join('.');
      formattedErrors[path] = error.message;
    });
  } else if (source === 'zod') {
    errors.issues.forEach(issue => {
      const path = issue.path.join('.');
      formattedErrors[path] = issue.message;
    });
  }
  
  return formattedErrors;
};

// Joi validation middleware
const validateJoi = (schema, source = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[source];
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      logger.warn('Joi validation failed', {
        source,
        errors: formatValidationError(error, 'joi'),
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formatValidationError(error, 'joi')
      });
    }
    
    // Replace the request data with validated/sanitized version
    req[source] = value;
    next();
  };
};

// Zod validation middleware
const validateZod = (schema, source = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[source];
    
    try {
      const validatedData = schema.parse(dataToValidate);
      req[source] = validatedData;
      next();
    } catch (error) {
      logger.warn('Zod validation failed', {
        source,
        errors: formatValidationError(error, 'zod'),
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formatValidationError(error, 'zod')
      });
    }
  };
};

// Joi Schemas
const joiSchemas = {
  // User authentication schemas
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Must be a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters',
      'any.required': 'Password is required'
    })
  }),
  
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    }),
    name: Joi.string().min(2).max(50).required(),
    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords must match'
    })
  }),
  
  // Book management schemas
  uploadBook: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    author: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(1000).optional(),
    language: Joi.string().valid('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko').default('en'),
    isbn: Joi.string().pattern(/^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }),
  
  updateBook: Joi.object({
    title: Joi.string().min(1).max(200).optional(),
    author: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(1000).optional(),
    language: Joi.string().valid('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko').optional(),
    status: Joi.string().valid('pending', 'processing', 'ready', 'failed').optional()
  }),

  chapter: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    chapter_number: Joi.number().integer().min(1).required(),
    content: Joi.string().min(1).required(),
  }),
  
  // TTS generation schemas
  generateTTS: Joi.object({
    chapterIds: Joi.array().items(Joi.string().uuid()).min(1).max(50).required(),
    voice: Joi.string().valid('default', 'female', 'male', 'child', 'elderly').default('default'),
    model: Joi.string().valid('bark', 'tortoise', 'tacotron2', 'waveglow').default('bark'),
    speed: Joi.number().min(0.5).max(2.0).default(1.0),
    pitch: Joi.number().min(-1.0).max(1.0).default(0.0),
    summarize: Joi.boolean().default(false),
    summarizeOptions: Joi.object({
      style: Joi.string().valid('concise', 'detailed', 'bullet_points').default('concise'),
      maxLength: Joi.number().min(100).max(2000).default(500),
      contentType: Joi.string().valid('narrative', 'technical', 'academic', 'conversational').default('narrative')
    }).optional()
  }),
  
  // Search and pagination schemas
  searchBooks: Joi.object({
    q: Joi.string().min(1).max(100).optional(),
    author: Joi.string().max(100).optional(),
    language: Joi.string().valid('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko').optional(),
    status: Joi.string().valid('pending', 'processing', 'ready', 'failed').optional(),
    limit: Joi.number().min(1).max(100).default(20),
    offset: Joi.number().min(0).default(0),
    sortBy: Joi.string().valid('title', 'author', 'created_at', 'updated_at').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),
  
  // File download schemas
  downloadBook: Joi.object({
    url: Joi.string().uri().required(),
    format: Joi.string().valid('epub', 'pdf', 'mobi', 'txt').optional(),
    extractMetadata: Joi.boolean().default(true)
  }),
  
  // TTS book generation schema (specific for /generate/:bookId endpoint)
  generateBookTTS: Joi.object({
    voice: Joi.string().valid('default', 'female', 'male', 'child', 'elderly').default('default'),
    model: Joi.string().valid('bark', 'tortoise', 'tacotron2', 'waveglow').default('bark'),
    priority: Joi.number().min(0).max(10).default(0),
    summarize: Joi.boolean().default(false),
    summarizeOptions: Joi.object({
      style: Joi.string().valid('concise', 'detailed', 'bullet_points').default('concise'),
      maxLength: Joi.number().min(100).max(2000).default(500),
      contentType: Joi.string().valid('narrative', 'technical', 'academic', 'conversational').default('narrative')
    }).optional()
  })
    .concat(Joi.object({
      bookId: Joi.string().uuid().required()
    }).unknown(true))
};

// Zod Schemas
const zodSchemas = {
  // User authentication schemas
  login: z.object({
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters')
  }),
  
  register: z.object({
    email: z.string().email(),
    password: z.string()
      .min(6, 'Password must be at least 6 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    name: z.string().min(2).max(50),
    confirmPassword: z.string()
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword']
  }),
  
  // Book management schemas
  uploadBook: z.object({
    title: z.string().min(1).max(200),
    author: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']).default('en'),
    isbn: z.string().regex(/^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/).optional(),
    tags: z.array(z.string().max(50)).max(10).optional()
  }),
  
  // TTS generation schemas
  generateTTS: z.object({
    chapterIds: z.array(z.string().uuid()).min(1).max(50),
    voice: z.enum(['default', 'female', 'male', 'child', 'elderly']).default('default'),
    model: z.enum(['bark', 'tortoise', 'tacotron2', 'waveglow']).default('bark'),
    speed: z.number().min(0.5).max(2.0).default(1.0),
    pitch: z.number().min(-1.0).max(1.0).default(0.0),
    summarize: z.boolean().default(false),
    summarizeOptions: z.object({
      style: z.enum(['concise', 'detailed', 'bullet_points']).default('concise'),
      maxLength: z.number().min(100).max(2000).default(500),
      contentType: z.enum(['narrative', 'technical', 'academic', 'conversational']).default('narrative')
    }).optional()
  }),
  
  // Search schemas
  searchBooks: z.object({
    q: z.string().min(1).max(100).optional(),
    author: z.string().max(100).optional(),
    language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']).optional(),
    status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
    sortBy: z.enum(['title', 'author', 'created_at', 'updated_at']).default('created_at'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
};

// Special validator for params + body validation
const validateBookTTSGeneration = (req, res, next) => {
  // Validate params
  const paramsSchema = Joi.object({
    bookId: Joi.string().uuid().required()
  });
  
  const { error: paramsError } = paramsSchema.validate(req.params);
  if (paramsError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid parameters',
      errors: formatValidationError(paramsError, 'joi')
    });
  }
  
  // Validate body
  const { error: bodyError, value } = joiSchemas.generateBookTTS.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });
  
  if (bodyError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formatValidationError(bodyError, 'joi')
    });
  }
  
  req.body = value;
  next();
};

// Convenience functions for common validations
const validateLogin = validateJoi(joiSchemas.login);
const validateRegister = validateJoi(joiSchemas.register);
const validateUploadBook = validateJoi(joiSchemas.uploadBook);
const validateUpdateBook = validateJoi(joiSchemas.updateBook);
const validateGenerateTTS = validateJoi(joiSchemas.generateTTS);
const validateSearchBooks = validateJoi(joiSchemas.searchBooks, 'query');
const validateDownloadBook = validateJoi(joiSchemas.downloadBook);

// Zod convenience functions
const validateLoginZod = validateZod(zodSchemas.login);
const validateRegisterZod = validateZod(zodSchemas.register);
const validateUploadBookZod = validateZod(zodSchemas.uploadBook);
const validateGenerateTTSZod = validateZod(zodSchemas.generateTTS);
const validateSearchBooksZod = validateZod(zodSchemas.searchBooks, 'query');

module.exports = {
  // Legacy express-validator support
  validateRequest,
  
  // Middleware functions
  validateJoi,
  validateZod,
  
  // Joi schemas
  joiSchemas,
  
  // Zod schemas  
  zodSchemas,
  
  // Convenience validators (Joi)
  validateLogin,
  validateRegister,
  validateUploadBook,
  validateUpdateBook,
  validateGenerateTTS,
  validateSearchBooks,
  validateDownloadBook,
  validateBookTTSGeneration,
  
  // Convenience validators (Zod)
  validateLoginZod,
  validateRegisterZod,
  validateUploadBookZod,
  validateGenerateTTSZod,
  validateSearchBooksZod,

  // Task 2.1 specific exports
  validateBook: validateJoi(joiSchemas.uploadBook),
  validateChapter: validateJoi(joiSchemas.chapter),
  validateTTS: validateJoi(joiSchemas.generateTTS),
  
  // Utility functions
  formatValidationError
};