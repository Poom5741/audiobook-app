const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');

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

module.exports = { validateRequest };