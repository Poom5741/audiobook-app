const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

pool.on('connect', () => {
  logger.debug('Database client connected');
});

async function connectDB() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

async function closeDB() {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
  }
}

// Database helper functions
async function executeTransaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findBookById(id) {
  const query = `
    SELECT 
      id, title, author, isbn, file_path, file_type,
      cover_image, description, language, total_chapters,
      status, created_at, updated_at
    FROM books 
    WHERE id = $1
  `;
  
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

async function findChapterById(id) {
  const query = `
    SELECT 
      c.id, c.book_id, c.chapter_number, c.title, 
      c.text_content, c.audio_path, c.duration, c.status,
      c.created_at, c.updated_at,
      b.title as book_title, b.author
    FROM chapters c
    JOIN books b ON c.book_id = b.id
    WHERE c.id = $1
  `;
  
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

async function updateBookStatus(bookId, status) {
  const query = `
    UPDATE books 
    SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, status
  `;
  
  const result = await pool.query(query, [status, bookId]);
  return result.rows[0];
}

async function updateChapterStatus(chapterId, status, audioPath = null) {
  let query = `
    UPDATE chapters 
    SET status = $1, updated_at = CURRENT_TIMESTAMP
  `;
  
  const params = [status];
  
  if (audioPath !== null) {
    query += `, audio_path = $${params.length + 1}`;
    params.push(audioPath);
  }
  
  query += ` WHERE id = $${params.length + 1} RETURNING id, status, audio_path`;
  params.push(chapterId);
  
  const result = await pool.query(query, params);
  return result.rows[0];
}

async function getBookProgress(bookId) {
  const query = `
    SELECT 
      COUNT(*) as total_chapters,
      COUNT(CASE WHEN audio_path IS NOT NULL THEN 1 END) as completed_chapters,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_chapters,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_chapters
    FROM chapters 
    WHERE book_id = $1
  `;
  
  const result = await pool.query(query, [bookId]);
  const stats = result.rows[0];
  
  return {
    totalChapters: parseInt(stats.total_chapters),
    completedChapters: parseInt(stats.completed_chapters),
    processingChapters: parseInt(stats.processing_chapters),
    failedChapters: parseInt(stats.failed_chapters),
    progress: stats.total_chapters > 0 
      ? (stats.completed_chapters / stats.total_chapters * 100).toFixed(1)
      : 0
  };
}

async function searchBooks(query, limit = 20, offset = 0) {
  const searchQuery = `
    SELECT 
      id, title, author, isbn, file_type, language,
      total_chapters, status, created_at, updated_at,
      (SELECT COUNT(*) FROM chapters WHERE book_id = books.id AND audio_path IS NOT NULL) as audio_chapters
    FROM books
    WHERE title ILIKE $1 OR author ILIKE $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  const result = await pool.query(searchQuery, [`%${query}%`, limit, offset]);
  return result.rows;
}

module.exports = {
  pool,
  connectDB,
  closeDB,
  executeTransaction,
  findBookById,
  findChapterById,
  updateBookStatus,
  updateChapterStatus,
  getBookProgress,
  searchBooks
};