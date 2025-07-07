const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger } = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');
const { body } = require('express-validator');

// POST /api/downloads/search - Search for books to download
router.post('/search',
  validateRequest([
    body('query').isLength({ min: 1, max: 200 }),
    body('limit').optional().isInt({ min: 1, max: 50 })
  ]),
  async (req, res) => {
    try {
      const { query, limit = 10 } = req.body;
      
      const crawlerApiUrl = process.env.CRAWLER_API_URL || 'http://crawler:3001';
      
      const response = await axios.get(`${crawlerApiUrl}/api/search`, {
        params: { q: query, limit },
        timeout: 30000
      });
      
      res.json(response.data);
      
    } catch (error) {
      logger.error('Search error:', error);
      
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({ 
          error: 'Crawler service unavailable',
          message: 'The download service is not running'
        });
      }
      
      res.status(500).json({ 
        error: 'Search failed', 
        message: error.response?.data?.message || error.message 
      });
    }
  }
);

// POST /api/downloads/download - Download a book
router.post('/download',
  validateRequest([
    body('bookUrl').isURL(),
    body('priority').optional().isInt({ min: 0, max: 10 })
  ]),
  async (req, res) => {
    try {
      const { bookUrl, priority = 0 } = req.body;
      
      const crawlerApiUrl = process.env.CRAWLER_API_URL || 'http://crawler:3001';
      
      const response = await axios.post(`${crawlerApiUrl}/api/download`, {
        bookUrl,
        priority
      }, {
        timeout: 30000
      });
      
      logger.info(`Download queued: ${bookUrl}`);
      
      res.json(response.data);
      
    } catch (error) {
      logger.error('Download error:', error);
      
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({ 
          error: 'Crawler service unavailable' 
        });
      }
      
      res.status(500).json({ 
        error: 'Download failed', 
        message: error.response?.data?.message || error.message 
      });
    }
  }
);

// GET /api/downloads/queue/status - Get download queue status
router.get('/queue/status', async (req, res) => {
  try {
    const crawlerApiUrl = process.env.CRAWLER_API_URL || 'http://crawler:3001';
    
    const response = await axios.get(`${crawlerApiUrl}/api/queue/status`, {
      timeout: 5000
    });
    
    res.json(response.data);
    
  } catch (error) {
    logger.error('Download queue status error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Crawler service unavailable' 
      });
    }
    
    res.status(500).json({ error: 'Failed to get download queue status' });
  }
});

// GET /api/downloads/queue/jobs - Get download queue jobs
router.get('/queue/jobs', async (req, res) => {
  try {
    const { status = 'active', limit = 20 } = req.query;
    
    const crawlerApiUrl = process.env.CRAWLER_API_URL || 'http://crawler:3001';
    
    const response = await axios.get(`${crawlerApiUrl}/api/queue/jobs`, {
      params: { status, limit },
      timeout: 5000
    });
    
    res.json(response.data);
    
  } catch (error) {
    logger.error('Download queue jobs error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Crawler service unavailable' 
      });
    }
    
    res.status(500).json({ error: 'Failed to get download queue jobs' });
  }
});

module.exports = router;