const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { getQueueStats, getQueueJobs, cleanupQueue } = require('../services/queueManager');
const { pool } = require('../db/connection');

// Get queue status
router.get('/status', async (req, res) => {
  try {
    const status = await getQueueStats();
    res.json(status);
  } catch (error) {
    logger.error('Queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status', message: error.message });
  }
});

// Get jobs by status
router.get('/jobs', async (req, res) => {
  try {
    const { status = 'waiting', limit = 20 } = req.query;
    const jobs = await getQueueJobs(status, parseInt(limit));
    res.json(jobs);
  } catch (error) {
    logger.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs', message: error.message });
  }
});

// Get download history from database
router.get('/history', async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    
    let query = `
      SELECT id, url, title, status, file_path, error_message, created_at, updated_at
      FROM download_queue
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    
    const client = await pool.connect();
    try {
      const result = await client.query(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM download_queue';
      if (status) {
        countQuery += ' WHERE status = $1';
      }
      const countResult = await client.query(countQuery, params);
      
      res.json({
        items: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('History error:', error);
    res.status(500).json({ error: 'Failed to get download history', message: error.message });
  }
});

// Clean up old jobs
router.post('/cleanup', async (req, res) => {
  try {
    await cleanupQueue();
    res.json({ message: 'Queue cleanup completed' });
  } catch (error) {
    logger.error('Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed', message: error.message });
  }
});

module.exports = router;