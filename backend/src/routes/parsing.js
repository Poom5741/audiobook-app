const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger } = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');
const { body, param } = require('express-validator');

// POST /api/parse/book/:bookId - Parse a downloaded book
router.post('/book/:bookId',
  validateRequest([
    param('bookId').isUUID(),
    body('chunkSize').optional().isInt({ min: 500, max: 5000 }),
    body('splitBy').optional().isIn(['chapters', 'chunks', 'both'])
  ]),
  async (req, res) => {
    try {
      const { bookId } = req.params;
      const { chunkSize = 1500, splitBy = 'both' } = req.body;
      
      const parserApiUrl = process.env.PARSER_API_URL || 'http://parser:3002';
      
      // Get book file path from database
      const { pool } = require('../services/database');
      const bookQuery = 'SELECT file_path, title FROM books WHERE id = $1';
      const bookResult = await pool.query(bookQuery, [bookId]);
      
      if (bookResult.rows.length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      
      const book = bookResult.rows[0];
      
      // Call parser service
      const parseResponse = await axios.post(`${parserApiUrl}/api/parse/file`, {
        filePath: book.file_path,
        options: {
          chunkSize,
          splitBy,
          saveToDb: true
        }
      }, {
        timeout: 300000 // 5 minutes
      });
      
      logger.info(`Parsed book: ${book.title}`);
      
      res.json({
        message: 'Book parsed successfully',
        bookId: bookId,
        bookTitle: book.title,
        result: parseResponse.data
      });
      
    } catch (error) {
      logger.error('Parse book error:', error);
      
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({ 
          error: 'Parser service unavailable',
          message: 'The parsing service is not running'
        });
      }
      
      res.status(500).json({ 
        error: 'Parsing failed', 
        message: error.response?.data?.message || error.message 
      });
    }
  }
);

// GET /api/parse/stats - Get parsing statistics
router.get('/stats', async (req, res) => {
  try {
    const parserApiUrl = process.env.PARSER_API_URL || 'http://parser:3002';
    
    const response = await axios.get(`${parserApiUrl}/api/stats`, {
      timeout: 5000
    });
    
    res.json(response.data);
    
  } catch (error) {
    logger.error('Get parsing stats error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Parser service unavailable' 
      });
    }
    
    res.status(500).json({ error: 'Failed to get parsing statistics' });
  }
});

module.exports = router;