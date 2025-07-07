const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { addToDownloadQueue, getScraper, getDownloadManager } = require('../services/queueManager');

// Add book to download queue
router.post('/', async (req, res) => {
  try {
    const { bookUrl, priority = 0 } = req.body;

    if (!bookUrl) {
      return res.status(400).json({ error: 'bookUrl is required' });
    }

    // Get book details first
    const scraper = getScraper();
    if (!scraper) {
      return res.status(503).json({ error: 'Scraper service not initialized' });
    }

    logger.info(`Fetching details for download: ${bookUrl}`);
    const bookDetails = await scraper.getBookDetails(bookUrl);

    if (!bookDetails || !bookDetails.title) {
      return res.status(404).json({ error: 'Could not fetch book details' });
    }

    // Add to download queue
    const result = await addToDownloadQueue(bookUrl, bookDetails, priority);

    res.json({
      status: result.status,
      ...result,
      book: {
        title: bookDetails.title,
        author: bookDetails.author,
        fileType: bookDetails.fileType
      }
    });

  } catch (error) {
    logger.error('Download request error:', error);
    res.status(500).json({ error: 'Failed to queue download', message: error.message });
  }
});

// Get download statistics
router.get('/stats', async (req, res) => {
  try {
    const downloadManager = getDownloadManager();
    if (!downloadManager) {
      return res.status(503).json({ error: 'Download manager not initialized' });
    }

    const stats = await downloadManager.getBookStats();
    res.json(stats);

  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics', message: error.message });
  }
});

// Cleanup orphaned files
router.post('/cleanup', async (req, res) => {
  try {
    const downloadManager = getDownloadManager();
    if (!downloadManager) {
      return res.status(503).json({ error: 'Download manager not initialized' });
    }

    const count = await downloadManager.cleanupOrphanedFiles();
    res.json({ 
      message: 'Cleanup completed',
      orphanedFilesRemoved: count 
    });

  } catch (error) {
    logger.error('Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed', message: error.message });
  }
});

module.exports = router;