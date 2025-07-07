const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function saveChaptersToDB(data) {
  const { filePath, bookSlug, metadata, chapters } = data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // First, find or create the book record
    let bookId;
    const bookQuery = 'SELECT id FROM books WHERE file_path = $1';
    const bookResult = await client.query(bookQuery, [filePath]);

    if (bookResult.rows.length > 0) {
      bookId = bookResult.rows[0].id;
      
      // Update book with parsing status
      await client.query(`
        UPDATE books 
        SET status = 'parsed', 
            total_chapters = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [chapters.length, bookId]);
      
      // Clear existing chapters for re-parsing
      await client.query('DELETE FROM chapters WHERE book_id = $1', [bookId]);
      
    } else {
      // Create new book record
      const insertBookQuery = `
        INSERT INTO books (
          title, author, file_path, file_type, 
          description, language, total_chapters, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'parsed')
        RETURNING id
      `;
      
      const fileType = filePath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';
      
      const bookValues = [
        metadata.title || 'Untitled',
        metadata.author || null,
        filePath,
        fileType,
        metadata.description || null,
        metadata.language || 'en',
        chapters.length
      ];
      
      const newBookResult = await client.query(insertBookQuery, bookValues);
      bookId = newBookResult.rows[0].id;
    }

    // Insert chapters
    const chapterQuery = `
      INSERT INTO chapters (
        book_id, chapter_number, title, text_content, 
        duration, status
      ) VALUES ($1, $2, $3, $4, $5, 'parsed')
    `;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      
      // Estimate duration based on word count (200 words per minute)
      const estimatedDuration = Math.ceil(chapter.wordCount / 200 * 60); // seconds
      
      await client.query(chapterQuery, [
        bookId,
        i + 1,
        chapter.title,
        chapter.text,
        estimatedDuration
      ]);
    }

    await client.query('COMMIT');
    
    logger.info(`Saved book ${bookId} with ${chapters.length} chapters to database`);
    return bookId;

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Database save failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getBookChapters(bookId) {
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT 
        c.id, c.chapter_number, c.title, c.text_content,
        c.duration, c.status, c.audio_path,
        b.title as book_title, b.author
      FROM chapters c
      JOIN books b ON c.book_id = b.id
      WHERE c.book_id = $1
      ORDER BY c.chapter_number
    `;
    
    const result = await client.query(query, [bookId]);
    return result.rows;
    
  } finally {
    client.release();
  }
}

async function updateChapterStatus(chapterId, status, audioPath = null) {
  const client = await pool.connect();
  
  try {
    const query = `
      UPDATE chapters 
      SET status = $1, audio_path = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;
    
    await client.query(query, [status, audioPath, chapterId]);
    
  } finally {
    client.release();
  }
}

async function getParsingStats() {
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT 
        COUNT(*) as total_books,
        COUNT(CASE WHEN status = 'parsed' THEN 1 END) as parsed_books,
        SUM(total_chapters) as total_chapters,
        COUNT(CASE WHEN c.status = 'parsed' THEN 1 END) as parsed_chapters,
        COUNT(CASE WHEN c.status = 'processing' THEN 1 END) as processing_chapters,
        COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_chapters
      FROM books b
      LEFT JOIN chapters c ON b.id = c.book_id
    `;
    
    const result = await client.query(query);
    return result.rows[0];
    
  } finally {
    client.release();
  }
}

module.exports = {
  saveChaptersToDB,
  getBookChapters,
  updateChapterStatus,
  getParsingStats
};