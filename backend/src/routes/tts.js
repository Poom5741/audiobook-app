const express = require('express');
const router = express.Router();
const { pool } = require('../services/database');
const { createLogger } = require('../../shared/logger');
const { validateRequest, validateGenerateTTS, validateBookTTSGeneration } = require('../middleware/validation');
const { cacheTTSQueue, invalidateBookCache, cacheMiddleware } = require('../middleware/cache');
const { TTL } = require('../services/cacheService');
const { param, body } = require('express-validator');
const { addTTSJob, getTTSQueue } = require('../services/queueService');
const { callService, serviceHelpers } = require('../utils/circuitBreaker');

const logger = createLogger('tts-routes');

// POST /api/tts/generate/:bookId - Generate audio for entire book
router.post('/generate/:bookId',
  validateBookTTSGeneration,
  invalidateBookCache,
  async (req, res) => {
    try {
      const { bookId } = req.params;
      const { 
        voice = 'default', 
        model = 'bark', 
        priority = 0,
        summarize = false,
        summarizeOptions = {}
      } = req.body;
      
      // Check if book exists and get chapters
      const chaptersQuery = `
        SELECT 
          c.id, c.chapter_number, c.title, c.text_content,
          b.title as book_title, b.author
        FROM chapters c
        JOIN books b ON c.book_id = b.id
        WHERE c.book_id = $1 AND c.text_content IS NOT NULL
        ORDER BY c.chapter_number
      `;
      
      const result = await pool.query(chaptersQuery, [bookId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'No chapters found',
          message: 'Book not found or has no parsed chapters'
        });
      }
      
      const chapters = result.rows;
      const jobIds = [];
      
      // Update book status
      await pool.query(`
        UPDATE books 
        SET status = 'generating', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [bookId]);
      
      // Queue TTS jobs for each chapter
      for (const chapter of chapters) {
        try {
          // Update chapter status
          await pool.query(`
            UPDATE chapters 
            SET status = 'processing', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [chapter.id]);
          
          // Add to TTS job queue
          const jobData = {
            chapterId: chapter.id,
            bookId: bookId,
            text: chapter.text_content,
            title: chapter.title,
            chapterNumber: chapter.chapter_number,
            bookTitle: chapter.book_title,
            author: chapter.author,
            voice: voice,
            model: model,
            summarize: summarize,
            summarizeOptions: summarizeOptions
          };
          
          const job = await addTTSJob(jobData, priority);
          jobIds.push({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            jobId: job.id
          });
          
          logger.info(`Queued TTS job for chapter: ${chapter.title}`);
          
        } catch (error) {
          logger.error(`Failed to queue chapter ${chapter.id}:`, error);
          
          // Reset chapter status on error
          await pool.query(`
            UPDATE chapters 
            SET status = 'parsed', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [chapter.id]);
        }
      }
      
      res.json({
        message: `Queued ${jobIds.length} chapters for TTS generation`,
        bookId: bookId,
        bookTitle: chapters[0].book_title,
        totalChapters: chapters.length,
        queuedChapters: jobIds.length,
        jobs: jobIds,
        settings: { voice, model, priority, summarize, summarizeOptions }
      });
      
    } catch (error) {
      logger.error('TTS generation error:', error);
      res.status(500).json({ error: 'Failed to queue TTS generation' });
    }
  }
);

// POST /api/tts/generate/:bookId/:chapterId - Generate audio for single chapter
router.post('/generate/:bookId/:chapterId',
  validateRequest([
    param('bookId').isUUID(),
    param('chapterId').isUUID(),
    body('voice').optional().isString(),
    body('model').optional().isIn(['bark', 'tortoise']),
    body('priority').optional().isInt({ min: 0, max: 10 }),
    body('summarize').optional().isBoolean(),
    body('summarizeOptions').optional().isObject()
  ]),
  async (req, res) => {
    try {
      const { bookId, chapterId } = req.params;
      const { 
        voice = 'default', 
        model = 'bark', 
        priority = 0,
        summarize = false,
        summarizeOptions = {}
      } = req.body;
      
      // Get chapter data
      const query = `
        SELECT 
          c.id, c.chapter_number, c.title, c.text_content, c.status,
          b.title as book_title, b.author
        FROM chapters c
        JOIN books b ON c.book_id = b.id
        WHERE c.id = $1 AND c.book_id = $2
      `;
      
      const result = await pool.query(query, [chapterId, bookId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      
      const chapter = result.rows[0];
      
      if (!chapter.text_content) {
        return res.status(400).json({ 
          error: 'Chapter has no text content',
          message: 'This chapter needs to be parsed first'
        });
      }
      
      if (chapter.status === 'processing') {
        return res.status(409).json({ 
          error: 'Chapter already processing',
          message: 'This chapter is already being converted to audio'
        });
      }
      
      // Update chapter status
      await pool.query(`
        UPDATE chapters 
        SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [chapterId]);
      
      // Queue TTS job
      const jobData = {
        chapterId: chapter.id,
        bookId: bookId,
        text: chapter.text_content,
        title: chapter.title,
        chapterNumber: chapter.chapter_number,
        bookTitle: chapter.book_title,
        author: chapter.author,
        voice: voice,
        model: model,
        summarize: summarize,
        summarizeOptions: summarizeOptions
      };
      
      const job = await addTTSJob(jobData, priority);
      
      logger.info(`Queued single TTS job for chapter: ${chapter.title}`);
      
      res.json({
        message: 'Chapter queued for TTS generation',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        jobId: job.id,
        settings: { voice, model, priority, summarize, summarizeOptions }
      });
      
    } catch (error) {
      logger.error('Single chapter TTS error:', error);
      
      // Reset chapter status on error
      await pool.query(`
        UPDATE chapters 
        SET status = 'parsed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [req.params.chapterId]).catch(() => {});
      
      res.status(500).json({ error: 'Failed to queue TTS generation' });
    }
  }
);

// GET /api/tts/queue/status - Get TTS queue status
router.get('/queue/status', async (req, res) => {
  try {
    const queue = getTTSQueue();
    
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount()
    ]);
    
    res.json({
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed
    });
    
  } catch (error) {
    logger.error('TTS queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// GET /api/tts/queue/jobs - Get TTS queue jobs
router.get('/queue/jobs', 
  cacheTTSQueue,
  async (req, res) => {
  try {
    const { status = 'active', limit = 20 } = req.query;
    const queue = getTTSQueue();
    
    let jobs;
    switch (status) {
      case 'waiting':
        jobs = await queue.getWaiting(0, limit);
        break;
      case 'active':
        jobs = await queue.getActive(0, limit);
        break;
      case 'completed':
        jobs = await queue.getCompleted(0, limit);
        break;
      case 'failed':
        jobs = await queue.getFailed(0, limit);
        break;
      default:
        jobs = await queue.getJobs(['waiting', 'active'], 0, limit);
    }
    
    const jobsData = jobs.map(job => ({
      id: job.id,
      data: job.data,
      progress: job.progress(),
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    }));
    
    res.json(jobsData);
    
  } catch (error) {
    logger.error('TTS queue jobs error:', error);
    res.status(500).json({ error: 'Failed to get queue jobs' });
  }
});

// GET /api/tts/models - Get available TTS models and voices via circuit breaker
router.get('/models', 
  cacheMiddleware({ ttl: TTL.VERY_LONG, keyGenerator: () => 'tts:models' }),
  async (req, res) => {
  try {
    const ttsApiUrl = process.env.TTS_API_URL;
    
    if (!ttsApiUrl) {
      return res.json({
        models: ['bark', 'tortoise'],
        voices: ['default'],
        note: 'TTS API not configured'
      });
    }
    
    try {
      // Use circuit breaker for TTS service call
      const result = await req.circuitBreaker.callService('tts', {
        url: `${ttsApiUrl}/models`,
        method: 'GET',
        timeout: 5000
      });
      
      logger.info('Successfully fetched TTS models via circuit breaker', {
        modelCount: result.data?.models?.length || 0,
        duration: result.duration,
        requestId: req.requestId
      });
      
      res.json(result.data);
      
    } catch (apiError) {
      logger.warn('TTS API not available via circuit breaker, returning defaults', {
        error: apiError.message,
        statusCode: apiError.statusCode,
        requestId: req.requestId
      });
      
      res.json({
        models: ['bark', 'tortoise'],
        voices: ['default', 'male', 'female'],
        note: 'TTS API not available, showing defaults',
        error: apiError.message
      });
    }
    
  } catch (error) {
    logger.error('Get TTS models error:', error);
    res.status(500).json({ 
      error: 'Failed to get TTS models',
      requestId: req.requestId
    });
  }
});

// GET /api/tts/voices - Get available TTS voices through circuit breaker
router.get('/voices', 
  cacheMiddleware({ ttl: TTL.VERY_LONG, keyGenerator: () => 'tts:voices' }),
  async (req, res) => {
  try {
    logger.info('Fetching TTS voices via circuit breaker', {
      requestId: req.requestId
    });

    const result = await serviceHelpers.tts.getVoices();
    
    logger.info('Successfully fetched TTS voices', {
      voiceCount: result.data?.voices?.length || 0,
      duration: result.duration,
      requestId: req.requestId
    });

    res.json({
      voices: result.data.voices || [],
      service: 'tts',
      duration: result.duration,
      requestId: req.requestId
    });

  } catch (error) {
    logger.error('Failed to fetch TTS voices via circuit breaker', {
      error: error.message,
      statusCode: error.statusCode,
      service: error.service,
      requestId: req.requestId
    });

    // Provide fallback response when TTS service is unavailable
    res.status(error.statusCode || 503).json({
      error: 'TTS service unavailable',
      message: 'Unable to fetch voices. Service may be experiencing issues.',
      fallbackVoices: ['default', 'male', 'female'],
      service: 'tts',
      requestId: req.requestId
    });
  }
});

// DELETE /api/tts/queue/:jobId - Cancel TTS job
router.delete('/queue/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const queue = getTTSQueue();
    
    const job = await queue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    await job.remove();
    
    // Reset chapter status if applicable
    if (job.data.chapterId) {
      await pool.query(`
        UPDATE chapters 
        SET status = 'parsed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [job.data.chapterId]);
    }
    
    logger.info(`Cancelled TTS job: ${jobId}`);
    
    res.json({ 
      message: 'Job cancelled successfully',
      jobId: jobId
    });
    
  } catch (error) {
    logger.error('Cancel TTS job error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// POST /api/tts/summarize - Test summarization for text
router.post('/summarize',
  validateRequest([
    body('text').isString().isLength({ min: 50, max: 100000 }),
    body('style').optional().isIn(['concise', 'detailed', 'bullets', 'key-points']),
    body('maxLength').optional().isInt({ min: 100, max: 2000 }),
    body('contentType').optional().isIn(['general', 'instructional', 'analytical', 'narrative', 'howto'])
  ]),
  async (req, res) => {
    try {
      const { 
        text, 
        style = 'concise', 
        maxLength = 500, 
        contentType = 'narrative' 
      } = req.body;
      
      const summarizerApiUrl = process.env.SUMMARIZER_API_URL || 'http://localhost:8001';
      
      const response = await callService('summarizer', {
        url: `${summarizerApiUrl}/api/summarize`,
        method: 'POST',
        data: {
          text,
          style,
          maxLength,
          contentType
        },
        timeout: 60000
      });
      
      res.json({
        success: true,
        original: {
          length: text.length,
          wordCount: text.split(/\s+/).length
        },
        summary: response.data.summary,
        summaryLength: response.data.summaryLength,
        compressionRatio: response.data.compressionRatio,
        provider: response.data.provider || 'ollama',
        settings: { style, maxLength, contentType }
      });
      
    } catch (error) {
      logger.error('Summarization test error:', error);
      
      const errorMessage = error.response?.data?.message || error.message;
      const statusCode = error.response?.status || 500;
      
      res.status(statusCode).json({ 
        error: 'Summarization failed',
        message: errorMessage,
        provider: 'ollama'
      });
    }
  }
);

// GET /api/tts/summarize/health - Check summarization service health
router.get('/summarize/health', async (req, res) => {
  try {
    const summarizerApiUrl = process.env.SUMMARIZER_API_URL || 'http://localhost:8001';
    
    const response = await callService('summarizer', {
      url: `${summarizerApiUrl}/api/summarize/health`,
      method: 'GET',
      timeout: 5000
    });
    
    res.json({
      summarizerService: response.data,
      apiUrl: summarizerApiUrl
    });
    
  } catch (error) {
    logger.error('Summarization health check error:', error);
    
    res.status(503).json({
      error: 'Summarization service unavailable',
      message: error.message,
      apiUrl: process.env.SUMMARIZER_API_URL || 'http://localhost:8001'
    });
  }
});

module.exports = router;