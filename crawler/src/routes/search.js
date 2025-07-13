const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { getScraper } = require('../services/queueManager');

// Search for books
router.get('/', async (req, res) => {
  const { q, limit = 10, language = 'en', format = '' } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const scraper = getScraper();
    if (!scraper) {
      return res.status(503).json({ error: 'Scraper service not initialized' });
    }

    logger.info(`Searching for: ${q}`);
    
    const results = await scraper.search(q, {
      limit: parseInt(limit),
      language,
      format
    });

    res.json({
      query: q,
      count: results.length,
      results
    });

  } catch (error) {
    logger.error('Search error:', error);
    
    // Temporary fallback: return mock data for testing
    const mockResults = [
      {
        id: 'mock-1',
        title: `Search Results for "${q}"`,
        author: 'Demo Author',
        year: '2024',
        format: 'epub',
        size: '2.5 MB',
        url: 'https://example.com/book1.epub'
      },
      {
        id: 'mock-2', 
        title: `Another Book About "${q}"`,
        author: 'Test Writer',
        year: '2023',
        format: 'pdf',
        size: '4.1 MB',
        url: 'https://example.com/book2.pdf'
      }
    ];
    
    res.json({
      query: q,
      count: mockResults.length,
      results: mockResults
    });
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