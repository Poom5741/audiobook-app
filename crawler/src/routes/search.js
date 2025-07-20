const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { getScraper } = require('../services/queueManager');

// Search for books (POST)
router.post('/', async (req, res) => {
  const { query, limit = 10, language = 'en', format = '' } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Body parameter "query" is required' });
  }

  try {
    const scraper = getScraper();
    if (!scraper) {
      return res.status(503).json({ error: 'Scraper service not initialized' });
    }

    logger.info(`Searching for: ${query}`);
    
    const results = await scraper.search(query, {
      limit: parseInt(limit),
      language,
      format
    });

    res.json({
      query: query,
      count: results.length,
      results
    });

  } catch (error) {
    logger.error('Search error:', error);
    
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Search for books (GET for convenience)
router.get('/', async (req, res) => {
  const { q: query, limit = 10, language = 'en', format = '' } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const scraper = getScraper();
    if (!scraper) {
      return res.status(503).json({ error: 'Scraper service not initialized' });
    }

    logger.info(`Searching for: ${query}`);
    
    const results = await scraper.search(query, {
      limit: parseInt(limit),
      language,
      format
    });

    res.json({
      query: query,
      count: results.length,
      results
    });

  } catch (error) {
    logger.error('Search error:', error);
    
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Get book details
router.get('/details', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const scraper = getScraper();
    if (!scraper) {
      return res.status(503).json({ error: 'Scraper service not initialized' });
    }

    logger.info(`Getting details for: ${url}`);
    
    const details = await scraper.getBookDetails(url);

    res.json(details);

  } catch (error) {
    logger.error('Get details error:', error);
    res.status(500).json({ error: 'Failed to get book details', message: error.message });
  }
});

module.exports = router;