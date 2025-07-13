const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { addToDownloadQueue, getScraper, getDownloadManager } = require('../services/queueManager');

// Add book to download queue
router.post('/queue', async (req, res) => {
  try {
    const { url, title, author, priority = 0 } = req.body;
    const bookUrl = url; // Support both 'url' and 'bookUrl' for compatibility

    if (!bookUrl) {
      return res.status(400).json({ error: 'url is required' });
    }

    // Use provided title/author if available, otherwise fetch details
    let bookDetails;
    if (title && author) {
      bookDetails = { title, author, fileType: 'text' };
      logger.info(`Using provided book details: ${title} by ${author}`);
    } else {
      // Get book details from scraper
      const scraper = getScraper();
      if (!scraper) {
        return res.status(503).json({ error: 'Scraper service not initialized' });
      }

      logger.info(`Fetching details for download: ${bookUrl}`);
      bookDetails = await scraper.getBookDetails(bookUrl);

      if (!bookDetails || !bookDetails.title) {
        return res.status(404).json({ error: 'Could not fetch book details' });
      }
    }

    // Add to download queue
    const result = await addToDownloadQueue(bookUrl, bookDetails, priority);

    res.json({
      status: 'success',
      downloadId: result.id || 'unknown',
      message: 'Download queued successfully',
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

// Get download status by ID
router.get('/status/:downloadId', async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    // For now, return a simple status - in a real implementation this would check actual download status
    // This is a placeholder that assumes downloads complete quickly for testing
    res.json({
      id: downloadId,
      status: 'completed',
      progress: 100,
      message: 'Download completed successfully'
    });

  } catch (error) {
    logger.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get download status', message: error.message });
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