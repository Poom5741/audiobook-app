const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const sanitize = require('sanitize-filename');
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const fileType = require('file-type');
const { logger } = require('../utils/logger');
const { pool } = require('../db/connection');

class DownloadManager {
  constructor() {
    this.booksPath = process.env.BOOKS_PATH || '/books';
    this.maxRetries = 3;
    this.timeout = 300000; // 5 minutes
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  generateFilePath(bookDetails) {
    // Sanitize names for filesystem
    const author = sanitize(bookDetails.author || 'Unknown Author');
    const title = sanitize(bookDetails.title || 'Untitled');
    const extension = bookDetails.fileType || 'pdf';

    // Create author directory
    const authorDir = path.join(this.booksPath, author);
    const fileName = `${title}.${extension}`;
    
    return {
      directory: authorDir,
      filePath: path.join(authorDir, fileName),
      fileName
    };
  }

  async downloadFile(url, bookDetails, progressCallback) {
    const { directory, filePath } = this.generateFilePath(bookDetails);
    
    // Ensure directory exists
    await this.ensureDirectoryExists(directory);

    let attempt = 0;
    let lastError;

    while (attempt < this.maxRetries) {
      try {
        logger.info(`Downloading (attempt ${attempt + 1}): ${bookDetails.title}`);

        const response = await axios({
          method: 'GET',
          url: url,
          responseType: 'stream',
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          maxRedirects: 5
        });

        // Get total size for progress tracking
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        // Create write stream
        const writer = createWriteStream(filePath);

        // Track progress
        if (progressCallback) {
          response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            const progress = totalSize ? (downloadedSize / totalSize) * 100 : 0;
            progressCallback(progress, downloadedSize, totalSize);
          });
        }

        // Download file
        await pipeline(response.data, writer);

        // Verify file type
        const type = await fileType.fromFile(filePath);
        if (type) {
          logger.info(`File type verified: ${type.ext} (${type.mime})`);
          
          // Rename if extension doesn't match
          if (type.ext !== bookDetails.fileType) {
            const newPath = filePath.replace(/\.[^.]+$/, `.${type.ext}`);
            await fs.rename(filePath, newPath);
            return newPath;
          }
        }

        logger.info(`Download completed: ${filePath}`);
        return filePath;

      } catch (error) {
        lastError = error;
        attempt++;
        
        logger.error(`Download attempt ${attempt} failed:`, error.message);
        
        // Clean up partial file
        try {
          await fs.unlink(filePath);
        } catch {}

        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Download failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  async saveBookToDatabase(bookDetails, filePath) {
    const client = await pool.connect();
    
    try {
      const query = `
        INSERT INTO books (
          title, author, isbn, file_path, file_type, 
          description, language, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (file_path) DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;
      
      const values = [
        bookDetails.title,
        bookDetails.author,
        bookDetails.isbn || null,
        filePath,
        bookDetails.fileType,
        bookDetails.description || null,
        bookDetails.language || 'en',
        'downloaded'
      ];

      const result = await client.query(query, values);
      logger.info(`Book saved to database: ${result.rows[0].id}`);
      
      return result.rows[0].id;

    } finally {
      client.release();
    }
  }

  async getBookStats() {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_books,
          COUNT(CASE WHEN status = 'downloaded' THEN 1 END) as downloaded,
          COUNT(CASE WHEN status = 'parsing' THEN 1 END) as parsing,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready,
          SUM(CASE WHEN file_type = 'pdf' THEN 1 ELSE 0 END) as pdf_count,
          SUM(CASE WHEN file_type = 'epub' THEN 1 ELSE 0 END) as epub_count
        FROM books
      `;
      
      const result = await client.query(query);
      return result.rows[0];

    } finally {
      client.release();
    }
  }

  async cleanupOrphanedFiles() {
    try {
      // Get all files in books directory
      const files = await this.getAllFiles(this.booksPath);
      
      // Get all file paths from database
      const client = await pool.connect();
      const result = await client.query('SELECT file_path FROM books');
      client.release();
      
      const dbPaths = new Set(result.rows.map(row => row.file_path));
      
      // Find orphaned files
      const orphaned = files.filter(file => !dbPaths.has(file));
      
      // Delete orphaned files
      for (const file of orphaned) {
        await fs.unlink(file);
        logger.info(`Deleted orphaned file: ${file}`);
      }
      
      return orphaned.length;

    } catch (error) {
      logger.error('Cleanup failed:', error);
      throw error;
    }
  }

  async getAllFiles(dir, files = []) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        await this.getAllFiles(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }
}

module.exports = DownloadManager;