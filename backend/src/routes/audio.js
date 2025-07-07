const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pool } = require('../services/database');
const { logger } = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');
const { param } = require('express-validator');

// GET /api/audio/:bookId/:chapterId - Stream audio file
router.get('/:bookId/:chapterId',
  validateRequest([
    param('bookId').isUUID(),
    param('chapterId').isUUID()
  ]),
  async (req, res) => {
    try {
      const { bookId, chapterId } = req.params;
      
      // Get chapter and audio path from database
      const query = `
        SELECT 
          c.audio_path, c.title, c.duration,
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
      
      if (!chapter.audio_path) {
        return res.status(404).json({ 
          error: 'Audio not available',
          message: 'This chapter has not been converted to audio yet'
        });
      }
      
      // Check if file exists
      const audioPath = path.join(process.env.AUDIO_PATH || '/audio', chapter.audio_path);
      
      if (!fs.existsSync(audioPath)) {
        logger.error(`Audio file not found: ${audioPath}`);
        return res.status(404).json({ 
          error: 'Audio file not found',
          message: 'The audio file exists in database but not on disk'
        });
      }
      
      // Get file stats
      const stat = fs.statSync(audioPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      
      // Set response headers
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="${chapter.title}.mp3"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Handle range requests for audio seeking
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        if (start >= fileSize || end >= fileSize) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
          return res.end();
        }
        
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunksize);
        
        const stream = fs.createReadStream(audioPath, { start, end });
        stream.pipe(res);
        
      } else {
        // Full file
        res.setHeader('Content-Length', fileSize);
        const stream = fs.createReadStream(audioPath);
        stream.pipe(res);
      }
      
      // Log access
      logger.debug(`Streaming audio: ${chapter.book_title} - ${chapter.title}`);
      
    } catch (error) {
      logger.error('Audio streaming error:', error);
      res.status(500).json({ error: 'Failed to stream audio' });
    }
  }
);

// GET /api/audio/:bookId/:chapterId/info - Get audio file info
router.get('/:bookId/:chapterId/info',
  validateRequest([
    param('bookId').isUUID(),
    param('chapterId').isUUID()
  ]),
  async (req, res) => {
    try {
      const { bookId, chapterId } = req.params;
      
      const query = `
        SELECT 
          c.id, c.title, c.duration, c.audio_path, c.status,
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
      
      let fileInfo = null;
      if (chapter.audio_path) {
        const audioPath = path.join(process.env.AUDIO_PATH || '/audio', chapter.audio_path);
        
        if (fs.existsSync(audioPath)) {
          const stat = fs.statSync(audioPath);
          fileInfo = {
            size: stat.size,
            created: stat.birthtime,
            modified: stat.mtime,
            exists: true
          };
        } else {
          fileInfo = { exists: false };
        }
      }
      
      res.json({
        chapter: {
          id: chapter.id,
          title: chapter.title,
          duration: chapter.duration,
          status: chapter.status,
          hasAudio: !!chapter.audio_path
        },
        book: {
          title: chapter.book_title,
          author: chapter.author
        },
        audio: fileInfo,
        streamUrl: chapter.audio_path ? `/api/audio/${bookId}/${chapterId}` : null
      });
      
    } catch (error) {
      logger.error('Audio info error:', error);
      res.status(500).json({ error: 'Failed to get audio info' });
    }
  }
);

// GET /api/audio/book/:bookId/playlist - Get playlist for entire book
router.get('/book/:bookId/playlist',
  validateRequest([
    param('bookId').isUUID()
  ]),
  async (req, res) => {
    try {
      const { bookId } = req.params;
      
      const query = `
        SELECT 
          c.id, c.chapter_number, c.title, c.duration, c.audio_path,
          b.title as book_title, b.author
        FROM chapters c
        JOIN books b ON c.book_id = b.id
        WHERE c.book_id = $1 AND c.audio_path IS NOT NULL
        ORDER BY c.chapter_number
      `;
      
      const result = await pool.query(query, [bookId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'No audio chapters found',
          message: 'This book has no audio chapters available'
        });
      }
      
      const chapters = result.rows.map(chapter => ({
        id: chapter.id,
        chapterNumber: chapter.chapter_number,
        title: chapter.title,
        duration: chapter.duration,
        url: `/api/audio/${bookId}/${chapter.id}`
      }));
      
      const totalDuration = result.rows.reduce((sum, ch) => sum + (ch.duration || 0), 0);
      
      res.json({
        book: {
          id: bookId,
          title: result.rows[0].book_title,
          author: result.rows[0].author
        },
        playlist: chapters,
        stats: {
          totalChapters: chapters.length,
          totalDuration: totalDuration
        }
      });
      
    } catch (error) {
      logger.error('Playlist error:', error);
      res.status(500).json({ error: 'Failed to get playlist' });
    }
  }
);

// DELETE /api/audio/:bookId/:chapterId - Delete audio file
router.delete('/:bookId/:chapterId',
  validateRequest([
    param('bookId').isUUID(),
    param('chapterId').isUUID()
  ]),
  async (req, res) => {
    try {
      const { bookId, chapterId } = req.params;
      
      // Get chapter info
      const query = `
        SELECT audio_path, title 
        FROM chapters 
        WHERE id = $1 AND book_id = $2
      `;
      
      const result = await pool.query(query, [chapterId, bookId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      
      const chapter = result.rows[0];
      
      if (!chapter.audio_path) {
        return res.status(404).json({ error: 'No audio file to delete' });
      }
      
      // Delete file from disk
      const audioPath = path.join(process.env.AUDIO_PATH || '/audio', chapter.audio_path);
      
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        logger.info(`Deleted audio file: ${audioPath}`);
      }
      
      // Update database
      await pool.query(`
        UPDATE chapters 
        SET audio_path = NULL, status = 'parsed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [chapterId]);
      
      res.json({ 
        message: 'Audio file deleted successfully',
        chapter: chapter.title
      });
      
    } catch (error) {
      logger.error('Delete audio error:', error);
      res.status(500).json({ error: 'Failed to delete audio file' });
    }
  }
);

module.exports = router;