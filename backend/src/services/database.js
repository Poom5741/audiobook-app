const { Pool } = require('pg');
const { createLogger, createMetricsLogger } = require('../../../../shared/logger');

const logger = createLogger('database');
const metricsLogger = createMetricsLogger('database');

// Enhanced database pool configuration for production
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  min: parseInt(process.env.DB_POOL_MIN) || 5,
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
  createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT) || 30000,
  destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT) || 5000,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL) || 1000,
  createRetryIntervalMillis: parseInt(process.env.DB_CREATE_RETRY_INTERVAL) || 200,
  propagateCreateError: false,
  // Connection settings
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000,
  // SSL settings
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false,
    ca: process.env.DB_SSL_CA,
    cert: process.env.DB_SSL_CERT,
    key: process.env.DB_SSL_KEY
  } : false,
  // Application name for monitoring
  application_name: process.env.DB_APPLICATION_NAME || 'audiobook-backend'
};

const pool = new Pool(poolConfig);

// Enhanced pool event monitoring
pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', {
    error: err.message,
    code: err.code,
    stack: err.stack
  });
  
  metricsLogger.logBusinessMetric('database_pool_error', 1, {
    error: err.message,
    code: err.code
  });
});

pool.on('connect', (client) => {
  logger.debug('Database client connected to pool', {
    processId: client.processID,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
  
  metricsLogger.logBusinessMetric('database_connection_acquired', 1, {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('acquire', (client) => {
  logger.debug('Database client acquired from pool', {
    processId: client.processID,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount
  });
});

pool.on('release', (client) => {
  logger.debug('Database client released back to pool', {
    processId: client?.processID || 'unknown',
    totalCount: pool.totalCount,
    idleCount: pool.idleCount
  });
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool', {
    processId: client?.processID || 'unknown',
    totalCount: pool.totalCount
  });
  
  metricsLogger.logBusinessMetric('database_connection_removed', 1, {
    totalCount: pool.totalCount
  });
});

async function connectDB() {
  try {
    const startTime = Date.now();
    const client = await pool.connect();
    
    // Test connection with a simple query
    const result = await client.query('SELECT 1 as test, NOW() as timestamp, version() as pg_version');
    client.release();
    
    const connectionTime = Date.now() - startTime;
    
    logger.info('Database connection successful', {
      connectionTime,
      pgVersion: result.rows[0].pg_version,
      timestamp: result.rows[0].timestamp,
      poolStats: getPoolStats()
    });
    
    metricsLogger.logPerformance('database_connection_test', connectionTime, {
      success: true
    });
    
    return true;
  } catch (error) {
    logger.error('Database connection failed:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    
    metricsLogger.logBusinessMetric('database_connection_failure', 1, {
      error: error.message,
      code: error.code
    });
    
    throw error;
  }
}

async function closeDB() {
  try {
    const startTime = Date.now();
    
    logger.info('Closing database connection pool...', {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount
    });
    
    await pool.end();
    
    const closeTime = Date.now() - startTime;
    
    logger.info('Database connection pool closed successfully', {
      closeTime
    });
    
    metricsLogger.logPerformance('database_pool_close', closeTime, {
      success: true
    });
  } catch (error) {
    logger.error('Error closing database pool:', {
      error: error.message,
      code: error.code
    });
    
    metricsLogger.logBusinessMetric('database_pool_close_error', 1, {
      error: error.message,
      code: error.code
    });
    
    throw error;
  }
}

// Enhanced database helper functions
async function executeTransaction(callback, isolationLevel = 'READ_COMMITTED') {
  const client = await pool.connect();
  const startTime = Date.now();
  
  try {
    // Begin transaction with isolation level
    await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
    
    logger.debug('Transaction started', {
      isolationLevel,
      clientProcessId: client.processID
    });
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    
    const transactionTime = Date.now() - startTime;
    
    logger.debug('Transaction committed successfully', {
      transactionTime,
      isolationLevel
    });
    
    metricsLogger.logPerformance('database_transaction_success', transactionTime, {
      isolationLevel
    });
    
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      
      const transactionTime = Date.now() - startTime;
      
      logger.error('Transaction rolled back due to error', {
        error: error.message,
        transactionTime,
        isolationLevel,
        code: error.code
      });
      
      metricsLogger.logBusinessMetric('database_transaction_rollback', 1, {
        error: error.message,
        isolationLevel,
        transactionTime
      });
    } catch (rollbackError) {
      logger.error('Failed to rollback transaction', {
        originalError: error.message,
        rollbackError: rollbackError.message
      });
    }
    
    throw error;
  } finally {
    client.release();
  }
}

// Enhanced query execution with metrics
async function executeQuery(text, params = [], options = {}) {
  const startTime = Date.now();
  const { timeout = 30000, retries = 0 } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      
      try {
        if (timeout) {
          await client.query('SET statement_timeout = $1', [timeout]);
        }
        
        const result = await client.query(text, params);
        const queryTime = Date.now() - startTime;
        
        logger.debug('Query executed successfully', {
          queryTime,
          rowCount: result.rowCount,
          command: result.command,
          attempt: attempt + 1
        });
        
        metricsLogger.logPerformance('database_query_success', queryTime, {
          command: result.command,
          rowCount: result.rowCount
        });
        
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      lastError = error;
      const queryTime = Date.now() - startTime;
      
      logger.error(`Query attempt ${attempt + 1} failed`, {
        error: error.message,
        code: error.code,
        queryTime,
        attempt: attempt + 1,
        maxAttempts: retries + 1
      });
      
      if (attempt === retries) {
        metricsLogger.logBusinessMetric('database_query_failure', 1, {
          error: error.message,
          code: error.code,
          attempts: attempt + 1
        });
        break;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw lastError;
}

// Get pool statistics
function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    maxConnections: pool.options.max,
    minConnections: pool.options.min
  };
}

// Health check for database
async function healthCheck() {
  try {
    const startTime = Date.now();
    const result = await executeQuery('SELECT 1 as health_check, NOW() as timestamp', [], { timeout: 5000 });
    const responseTime = Date.now() - startTime;
    
    const stats = getPoolStats();
    
    return {
      status: 'healthy',
      responseTime,
      timestamp: result.rows[0].timestamp,
      poolStats: stats,
      connectionString: pool.options.connectionString?.replace(/\/\/.*@/, '//***@') // Mask credentials
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      code: error.code,
      poolStats: getPoolStats()
    };
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
  
  const result = await executeQuery(query, [id]);
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
  
  const result = await executeQuery(query, [id]);
  return result.rows[0] || null;
}

async function updateBookStatus(bookId, status) {
  const query = `
    UPDATE books 
    SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, status
  `;
  
  const result = await executeQuery(query, [status, bookId]);
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
  
  const result = await executeQuery(query, params);
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
  
  const result = await executeQuery(query, [bookId]);
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
  
  const result = await executeQuery(searchQuery, [`%${query}%`, limit, offset]);
  return result.rows;
}

module.exports = {
  pool,
  connectDB,
  closeDB,
  executeTransaction,
  executeQuery,
  getPoolStats,
  healthCheck,
  findBookById,
  findChapterById,
  updateBookStatus,
  updateChapterStatus,
  getBookProgress,
  searchBooks
};