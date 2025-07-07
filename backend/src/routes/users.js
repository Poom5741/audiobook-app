const express = require('express');
const router = express.Router();
const { pool } = require('../services/database');
const { logger } = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');
const { param, body } = require('express-validator');

// Simple auth middleware (for demo - replace with proper JWT middleware)
const authenticateUser = (req, res, next) => {
  // For now, just pass through - implement JWT verification here
  req.user = { id: '00000000-0000-0000-0000-000000000000' }; // Demo user
  next();
};

// GET /api/users/profile - Get user profile
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET /api/users/progress - Get user's reading progress
router.get('/progress', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        rp.book_id, rp.chapter_id, rp.position, rp.completed_chapters,
        rp.last_accessed,
        b.title as book_title, b.author,
        c.title as chapter_title, c.chapter_number
      FROM reading_progress rp
      JOIN books b ON rp.book_id = b.id
      LEFT JOIN chapters c ON rp.chapter_id = c.id
      WHERE rp.user_id = $1
      ORDER BY rp.last_accessed DESC
    `;
    
    const result = await pool.query(query, [userId]);
    
    res.json(result.rows);
    
  } catch (error) {
    logger.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to get reading progress' });
  }
});

// POST /api/users/progress - Update reading progress
router.post('/progress',
  authenticateUser,
  validateRequest([
    body('bookId').isUUID(),
    body('chapterId').optional().isUUID(),
    body('position').isInt({ min: 0 }),
    body('completedChapters').optional().isInt({ min: 0 })
  ]),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { bookId, chapterId, position, completedChapters } = req.body;
      
      // Upsert reading progress
      const query = `
        INSERT INTO reading_progress (user_id, book_id, chapter_id, position, completed_chapters, last_accessed)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, book_id)
        DO UPDATE SET
          chapter_id = EXCLUDED.chapter_id,
          position = EXCLUDED.position,
          completed_chapters = COALESCE(EXCLUDED.completed_chapters, reading_progress.completed_chapters),
          last_accessed = EXCLUDED.last_accessed,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const result = await pool.query(query, [
        userId, bookId, chapterId || null, position, completedChapters || null
      ]);
      
      res.json({
        message: 'Progress updated',
        progress: result.rows[0]
      });
      
    } catch (error) {
      logger.error('Update progress error:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  }
);

// GET /api/users/stats - Get user statistics
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        COUNT(DISTINCT rp.book_id) as books_started,
        COUNT(DISTINCT CASE WHEN rp.completed_chapters = b.total_chapters THEN rp.book_id END) as books_completed,
        SUM(rp.completed_chapters) as total_chapters_completed,
        AVG(rp.completed_chapters::float / NULLIF(b.total_chapters, 0) * 100) as avg_completion_rate
      FROM reading_progress rp
      JOIN books b ON rp.book_id = b.id
      WHERE rp.user_id = $1
    `;
    
    const result = await pool.query(query, [userId]);
    const stats = result.rows[0];
    
    // Convert to integers and handle nulls
    const userStats = {
      booksStarted: parseInt(stats.books_started) || 0,
      booksCompleted: parseInt(stats.books_completed) || 0,
      totalChaptersCompleted: parseInt(stats.total_chapters_completed) || 0,
      avgCompletionRate: parseFloat(stats.avg_completion_rate) || 0
    };
    
    res.json(userStats);
    
  } catch (error) {
    logger.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

module.exports = router;