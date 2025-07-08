/**
 * Summarization API Routes
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');

const { prepareForStyle } = require('../processors/textPrep');
const OllamaSummarizer = require('../summarizers/ollama');

const router = express.Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// Initialize summarizer
const summarizer = new OllamaSummarizer();

// Validation schema
const summarizeSchema = Joi.object({
  text: Joi.string().min(50).max(100000).required(),
  style: Joi.string().valid('concise', 'detailed', 'bullets', 'key-points').default('concise'),
  maxLength: Joi.number().integer().min(100).max(2000).default(500),
  contentType: Joi.string().valid('general', 'instructional', 'analytical', 'narrative', 'howto').default('general')
});

/**
 * POST /api/summarize
 * Main summarization endpoint
 */
router.post('/', async (req, res) => {
  try {
    // Validate input
    const { error, value } = summarizeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.details.map(d => d.message)
      });
    }

    const { text, style, maxLength, contentType } = value;

    logger.info(`Summarization request: style=${style}, length=${maxLength}, contentType=${contentType}`);

    // Prepare text for summarization
    const prepared = prepareForStyle(text, style);
    
    // Check if text is too short to summarize
    if (prepared.analysis.wordCount < 100) {
      return res.json({
        summary: text,
        originalLength: text.length,
        summaryLength: text.length,
        compressionRatio: '0.00',
        provider: 'none',
        message: 'Text too short to summarize effectively',
        analysis: prepared.analysis
      });
    }

    // Perform summarization
    const result = await summarizer.summarize(text, {
      style,
      targetLength: maxLength,
      contentType,
      chunks: prepared.chunks,
      analysis: prepared.analysis
    });

    // Add analysis data to response
    result.analysis = prepared.analysis;
    result.processingTime = Date.now() - req.startTime;

    logger.info(`Summarization completed: ${result.compressionRatio}% compression`);
    
    res.json(result);

  } catch (error) {
    logger.error('Summarization error:', error);
    
    res.status(500).json({
      error: 'Summarization failed',
      message: error.message,
      provider: 'ollama'
    });
  }
});

/**
 * GET /api/summarize/health
 * Check if summarization service is available
 */
router.get('/health', async (req, res) => {
  try {
    const isAvailable = await summarizer.isAvailable();
    const models = await summarizer.getAvailableModels();

    res.json({
      status: isAvailable ? 'healthy' : 'unavailable',
      provider: 'ollama',
      model: summarizer.model,
      availableModels: models.map(m => m.name),
      baseUrl: summarizer.baseUrl
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      provider: 'ollama'
    });
  }
});

/**
 * POST /api/summarize/models/pull
 * Pull a new model for Ollama
 */
router.post('/models/pull', async (req, res) => {
  try {
    const { model } = req.body;
    
    if (!model || typeof model !== 'string') {
      return res.status(400).json({
        error: 'Model name required'
      });
    }

    logger.info(`Starting model pull: ${model}`);
    
    // This is a long-running operation
    const success = await summarizer.pullModel(model);
    
    if (success) {
      res.json({
        message: `Model ${model} pulled successfully`,
        model
      });
    } else {
      res.status(500).json({
        error: `Failed to pull model ${model}`
      });
    }
  } catch (error) {
    logger.error('Model pull error:', error);
    res.status(500).json({
      error: 'Model pull failed',
      message: error.message
    });
  }
});

/**
 * GET /api/summarize/models
 * List available models
 */
router.get('/models', async (req, res) => {
  try {
    const models = await summarizer.getAvailableModels();
    
    res.json({
      models: models.map(model => ({
        name: model.name,
        size: model.size,
        modified: model.modified_at
      })),
      currentModel: summarizer.model
    });
  } catch (error) {
    logger.error('Get models error:', error);
    res.status(500).json({
      error: 'Failed to get models',
      message: error.message
    });
  }
});

// Middleware to track processing time
router.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

module.exports = router;