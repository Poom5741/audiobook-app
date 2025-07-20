const express = require('express');
const router = express.Router();
const { pool } = require('../services/database');
const { logger } = require('../utils/logger');
const { validateRequest, validateSearchBooks, validateUploadBook, validateUpdateBook } = require('../middleware/validation');
const { cacheBookList, cacheBook, cacheBookProgress, invalidateBookCache, cacheMiddleware } = require('../middleware/cache');
const { TTL } = require('../services/cacheService');
const { param, query } = require('express-validator');

// GET /api/books - List all books
router.get('/', 
  validateSearchBooks,
  cacheBookList,
  async (req, res) => {
    try {
      const { limit = 20, offset = 0, status, search } = req.query;
      
      let query = `
        SELECT 
          id, title, author, isbn, file_type, language,
          total_chapters, status, created_at, updated_at,
          (SELECT COUNT(*) FROM chapters WHERE book_id = books.id AND audio_path IS NOT NULL) as audio_chapters
        FROM books
      `;
      
      const params = [];
      const conditions = [];
      
      if (status) {
        conditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }
      
      if (search) {
        conditions.push(`(title ILIKE $${params.length + 1} OR author ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await pool.query(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM books';
      const countParams = [];
      
      if (conditions.length > 0) {
        countQuery += ` WHERE ${conditions.join(' AND ')}`;
        // Use the same conditions parameters (excluding limit/offset)
        countParams.push(...params.slice(0, -2));
      }
      
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);
      
      res.json({
        books: result.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
      
    } catch (error) {
      logger.error('Get books error:', error);
      res.status(500).json({ error: 'Failed to fetch books' });
    }
  }
);

// POST /api/books - Create a new book
router.post('/', 
  validateUploadBook,
  invalidateBookCache,
  async (req, res) => {
    try {
      const { title, author, isbn, description, language, tags } = req.body;

      const query = `
        INSERT INTO books (title, author, isbn, description, language, tags, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'new')
        RETURNING id, title, author, status, created_at
      `;

      const params = [title, author, isbn, description, language, tags];
      const result = await pool.query(query, params);

      res.status(201).json({
        message: 'Book created successfully',
        book: result.rows[0]
      });

    } catch (error) {
      logger.error('Create book error:', error);
      res.status(500).json({ error: 'Failed to create book' });
    }
  }
);

// GET /api/books/:id - Get book details
router.get('/:id',
  validateRequest([
    param('id').isUUID()
  ]),
  cacheBook,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const bookQuery = `
        SELECT 
          id, title, author, isbn, file_path, file_type, 
          cover_image, description, language, total_chapters, 
          status, created_at, updated_at
        FROM books 
        WHERE id = $1
      `;
      
      const bookResult = await pool.query(bookQuery, [id]);
      
      if (bookResult.rows.length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      
      const book = bookResult.rows[0];
      
      // Get chapters summary
      const chaptersQuery = `
        SELECT 
          COUNT(*) as total_chapters,
          COUNT(CASE WHEN audio_path IS NOT NULL THEN 1 END) as audio_chapters,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_chapters,
          SUM(duration) as total_duration
        FROM chapters 
        WHERE book_id = $1
      `;
      
      const chaptersResult = await pool.query(chaptersQuery, [id]);
      const chapterStats = chaptersResult.rows[0];
      
      res.json({
        book: {
          ...book,
          stats: {
            totalChapters: parseInt(chapterStats.total_chapters) || 0,
            audioChapters: parseInt(chapterStats.audio_chapters) || 0,
            processingChapters: parseInt(chapterStats.processing_chapters) || 0,
            totalDuration: parseInt(chapterStats.total_duration) || 0
          }
        }
      });
      
    } catch (error) {
      logger.error('Get book details error:', error);
      res.status(500).json({ error: 'Failed to fetch book details' });
    }
  }
);

// PUT /api/books/:id - Update book details
router.put('/:id',
  validateRequest([
    param('id').isUUID()
  ]),
  validateUpdateBook,
  invalidateBookCache,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, author, isbn, description, language, tags, status } = req.body;

      const query = `
        UPDATE books
        SET 
          title = COALESCE($1, title),
          author = COALESCE($2, author),
          isbn = COALESCE($3, isbn),
          description = COALESCE($4, description),
          language = COALESCE($5, language),
          tags = COALESCE($6, tags),
          status = COALESCE($7, status),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING id, title, author, status, updated_at
      `;

      const params = [title, author, isbn, description, language, tags, status, id];
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }

      res.json({
        message: 'Book updated successfully',
        book: result.rows[0]
      });

    } catch (error) {
      logger.error('Update book error:', error);
      res.status(500).json({ error: 'Failed to update book' });
    }
  }
);

// GET /api/books/:id/chapters - Get book chapters
router.get('/:id/chapters',
  validateRequest([
    param('id').isUUID(),
    query('includeText').optional().isBoolean().toBoolean()
  ]),
  cacheBookProgress,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { includeText = false } = req.query;
      
      // First check if book exists
      const bookCheck = await pool.query('SELECT id FROM books WHERE id = $1', [id]);
      if (bookCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      
      let query = `
        SELECT 
          id, chapter_number, title, duration, status, audio_path,
          created_at, updated_at
      `;
      
      if (includeText) {
        query += ', text_content';
      }
      
      query += `
        FROM chapters 
        WHERE book_id = $1 
        ORDER BY chapter_number
      `;
      
      const result = await pool.query(query, [id]);
      
      res.json({
        bookId: id,
        chapters: result.rows.map(chapter => ({
          ...chapter,
          hasAudio: !!chapter.audio_path,
          audioUrl: chapter.audio_path ? `/api/audio/${id}/${chapter.id}` : null
        }))
      });
      
    } catch (error) {
      logger.error('Get chapters error:', error);
      res.status(500).json({ error: 'Failed to fetch chapters' });
    }
  }
);

// GET /api/books/stats - Get overall statistics
router.get('/stats', 
  cacheMiddleware({ ttl: TTL.MEDIUM, keyGenerator: () => 'books:stats' }),
  async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_books,
        COUNT(CASE WHEN status = 'downloaded' THEN 1 END) as downloaded_books,
        COUNT(CASE WHEN status = 'parsed' THEN 1 END) as parsed_books,
        COUNT(CASE WHEN status = 'generating' THEN 1 END) as generating_books,
        COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_books,
        SUM(total_chapters) as total_chapters,
        (SELECT COUNT(*) FROM chapters WHERE audio_path IS NOT NULL) as audio_chapters,
        (SELECT COUNT(*) FROM chapters WHERE status = 'processing') as processing_chapters
      FROM books
    `;
    
    const result = await pool.query(statsQuery);
    const stats = result.rows[0];
    
    // Convert strings to integers
    Object.keys(stats).forEach(key => {
      stats[key] = parseInt(stats[key]) || 0;
    });
    
    res.json(stats);
    
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// DELETE /api/books/:id - Delete book and associated data
router.delete('/:id',
  validateRequest([
    param('id').isUUID()
  ]),
  invalidateBookCache,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Get book info before deletion
        const bookResult = await client.query('SELECT title, file_path FROM books WHERE id = $1', [id]);
        
        if (bookResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Book not found' });
        }
        
        const book = bookResult.rows[0];
        
        // Delete chapters (cascades due to foreign key)
        await client.query('DELETE FROM chapters WHERE book_id = $1', [id]);
        
        // Delete book
        await client.query('DELETE FROM books WHERE id = $1', [id]);
        
        await client.query('COMMIT');
        
        logger.info(`Deleted book: ${book.title}`);
        
        res.json({ 
          message: 'Book deleted successfully',
          deletedBook: {
            id,
            title: book.title
          }
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      logger.error('Delete book error:', error);
      res.status(500).json({ error: 'Failed to delete book' });
    }
  }
);

module.exports = router;