const { Pool } = require("pg");
const fs = require("fs").promises;
const path = require("path");
const { createLogger, createMetricsLogger } = require("../../shared/logger");

const logger = createLogger("database");
const metricsLogger = createMetricsLogger("database");

// Enhanced database pool configuration for production
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings - optimized for better performance
  max: parseInt(process.env.DB_POOL_MAX) || 25, // Increased for better concurrency
  min: parseInt(process.env.DB_POOL_MIN) || 5,
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
  createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT) || 30000,
  destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT) || 5000,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL) || 1000,
  createRetryIntervalMillis:
    parseInt(process.env.DB_CREATE_RETRY_INTERVAL) || 200,
  propagateCreateError: false,
  // Connection settings
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // Increased timeout
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000,
  // Enhanced connection validation
  allowExitOnIdle: true,
  // SSL settings
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          ca: process.env.DB_SSL_CA,
          cert: process.env.DB_SSL_CERT,
          key: process.env.DB_SSL_KEY,
        }
      : false,
  // Application name for monitoring
  application_name: process.env.DB_APPLICATION_NAME || "audiobook-backend",
  // Enhanced error handling
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

// Enhanced pool event monitoring
pool.on("error", (err) => {
  logger.error("Unexpected database pool error:", {
    error: err.message,
    code: err.code,
    stack: err.stack,
  });

  metricsLogger.logBusinessMetric("database_pool_error", 1, {
    error: err.message,
    code: err.code,
  });
});

pool.on("connect", (client) => {
  logger.debug("Database client connected to pool", {
    processId: client.processID,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });

  metricsLogger.logBusinessMetric("database_connection_acquired", 1, {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on("acquire", (client) => {
  logger.debug("Database client acquired from pool", {
    processId: client.processID,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
  });
});

pool.on("release", (client) => {
  logger.debug("Database client released back to pool", {
    processId: client?.processID || "unknown",
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
  });
});

pool.on("remove", (client) => {
  logger.debug("Database client removed from pool", {
    processId: client?.processID || "unknown",
    totalCount: pool.totalCount,
  });

  metricsLogger.logBusinessMetric("database_connection_removed", 1, {
    totalCount: pool.totalCount,
  });
});

// Schema initialization and verification functions
async function initializeSchema() {
  try {
    logger.info("Initializing database schema...");

    // Read and execute the schema initialization script
    const schemaPath = path.join(__dirname, "../../../database/init.sql");

    try {
      const schemaSQL = await fs.readFile(schemaPath, "utf8");

      // Execute schema in a transaction
      await executeTransaction(async (client) => {
        // Split SQL by statements and execute each one
        const statements = schemaSQL
          .split(";")
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }

        logger.info("Database schema initialized successfully", {
          statementsExecuted: statements.length,
        });
      });
    } catch (fileError) {
      if (fileError.code === "ENOENT") {
        logger.warn(
          "Schema file not found, creating basic schema programmatically"
        );
        await createBasicSchema();
      } else {
        throw fileError;
      }
    }

    metricsLogger.logBusinessMetric("database_schema_initialized", 1);
  } catch (error) {
    logger.error("Failed to initialize database schema:", {
      error: error.message,
      code: error.code,
      detail: error.detail,
    });

    metricsLogger.logBusinessMetric("database_schema_init_failure", 1, {
      error: error.message,
      code: error.code,
    });

    throw error;
  }
}

async function createBasicSchema() {
  logger.info("Creating basic database schema programmatically...");

  await executeTransaction(async (client) => {
    // Create UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create books table
    await client.query(`
      CREATE TABLE IF NOT EXISTS books (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(500) NOT NULL,
        author VARCHAR(500),
        isbn VARCHAR(20),
        file_path VARCHAR(1000) NOT NULL,
        file_type VARCHAR(10) NOT NULL,
        cover_image TEXT,
        description TEXT,
        language VARCHAR(10) DEFAULT 'en',
        total_chapters INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'downloaded',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create chapters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chapters (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        chapter_number INTEGER NOT NULL,
        title VARCHAR(500),
        text_content TEXT,
        audio_path VARCHAR(1000),
        duration INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book_id, chapter_number)
      )
    `);

    // Create indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_books_status ON books(status)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_books_author ON books(author)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status)"
    );

    // Create update trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Create triggers
    await client.query(`
      DROP TRIGGER IF EXISTS update_books_updated_at ON books;
      CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_chapters_updated_at ON chapters;
      CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    logger.info("Basic database schema created successfully");
  });
}

async function verifySchema() {
  try {
    logger.info("Verifying database schema integrity...");

    const verificationQueries = [
      {
        name: "books_table",
        query: `SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_name = 'books' AND table_schema = 'public'`,
      },
      {
        name: "chapters_table",
        query: `SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_name = 'chapters' AND table_schema = 'public'`,
      },
      {
        name: "users_table",
        query: `SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_name = 'users' AND table_schema = 'public'`,
      },
      {
        name: "tts_jobs_table",
        query: `SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_name = 'tts_jobs' AND table_schema = 'public'`,
      },
      {
        name: "download_queue_table",
        query: `SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_name = 'download_queue' AND table_schema = 'public'`,
      },
      {
        name: "reading_progress_table",
        query: `SELECT COUNT(*) as count FROM information_schema.tables 
                WHERE table_name = 'reading_progress' AND table_schema = 'public'`,
      },
      {
        name: "uuid_extension",
        query: `SELECT COUNT(*) as count FROM pg_extension WHERE extname = 'uuid-ossp'`,
      },
      {
        name: "books_indexes",
        query: `SELECT COUNT(*) as count FROM pg_indexes 
                WHERE tablename = 'books' AND schemaname = 'public'`,
      },
      {
        name: "chapters_indexes",
        query: `SELECT COUNT(*) as count FROM pg_indexes 
                WHERE tablename = 'chapters' AND schemaname = 'public'`,
      },
      {
        name: "foreign_key_constraints",
        query: `SELECT COUNT(*) as count FROM information_schema.table_constraints 
                WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'`,
      },
      {
        name: "triggers",
        query: `SELECT COUNT(*) as count FROM information_schema.triggers 
                WHERE trigger_schema = 'public' AND trigger_name LIKE '%updated_at%'`,
      },
    ];

    const results = {};

    for (const check of verificationQueries) {
      try {
        const result = await executeQuery(check.query, [], { timeout: 10000 });
        results[check.name] = parseInt(result.rows[0].count);
      } catch (error) {
        logger.warn(`Schema verification query failed: ${check.name}`, {
          error: error.message,
          query: check.query,
        });
        results[check.name] = 0;
      }
    }

    // Verify expected counts with more comprehensive checks
    const expectedCounts = {
      books_table: 1,
      chapters_table: 1,
      users_table: 1,
      tts_jobs_table: 1,
      download_queue_table: 1,
      reading_progress_table: 1,
      uuid_extension: 1,
      books_indexes: 3, // At least 3 indexes expected
      chapters_indexes: 2, // At least 2 indexes expected
      foreign_key_constraints: 4, // At least 4 FK constraints expected
      triggers: 6, // 6 update triggers expected
    };

    let schemaValid = true;
    const issues = [];
    const warnings = [];

    for (const [check, expectedCount] of Object.entries(expectedCounts)) {
      if (results[check] < expectedCount) {
        if (check.includes("_table") || check === "uuid_extension") {
          // Critical issues
          schemaValid = false;
          issues.push(
            `${check}: expected >= ${expectedCount}, got ${results[check]}`
          );
        } else {
          // Non-critical warnings
          warnings.push(
            `${check}: expected >= ${expectedCount}, got ${results[check]}`
          );
        }
      }
    }

    if (warnings.length > 0) {
      logger.warn("Database schema has minor issues", {
        warnings,
        results,
      });
    }

    if (schemaValid) {
      logger.info("Database schema verification successful", {
        results,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
      metricsLogger.logBusinessMetric("database_schema_verified", 1, {
        warnings: warnings.length,
      });
    } else {
      logger.error("Database schema verification failed", {
        results,
        issues,
        warnings,
      });
      metricsLogger.logBusinessMetric(
        "database_schema_verification_failure",
        1,
        {
          issues: issues.join(", "),
          warnings: warnings.join(", "),
        }
      );
      throw new Error(`Schema verification failed: ${issues.join(", ")}`);
    }

    return {
      valid: schemaValid,
      results,
      issues,
      warnings,
    };
  } catch (error) {
    logger.error("Schema verification error:", {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

// Enhanced connection with retry logic and schema initialization
async function connectDB(maxRetries = 10, retryDelay = 5000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();

      logger.info(`Database connection attempt ${attempt}/${maxRetries}`, {
        attempt,
        maxRetries,
        connectionString: poolConfig.connectionString?.replace(
          /\/\/.*@/,
          "//***@"
        ),
      });

      // Test connection with a simple query
      const client = await pool.connect();
      const result = await client.query(
        "SELECT 1 as test, NOW() as timestamp, version() as pg_version"
      );
      client.release();

      const connectionTime = Date.now() - startTime;

      logger.info("Database connection successful", {
        connectionTime,
        pgVersion: result.rows[0].pg_version,
        timestamp: result.rows[0].timestamp,
        poolStats: getPoolStats(),
        attempt,
      });

      metricsLogger.logPerformance("database_connection_test", connectionTime, {
        success: true,
        attempt,
      });

      // Initialize database schema after successful connection
      await initializeSchema();

      // Verify schema integrity
      await verifySchema();

      logger.info("Database initialization completed successfully");
      return true;
    } catch (error) {
      lastError = error;

      logger.error(`Database connection attempt ${attempt} failed:`, {
        error: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        attempt,
        maxRetries,
      });

      metricsLogger.logBusinessMetric("database_connection_failure", 1, {
        error: error.message,
        code: error.code,
        attempt,
      });

      // Don't retry on authentication or configuration errors
      if (
        error.code === "28P01" ||
        error.code === "3D000" ||
        error.code === "28000"
      ) {
        logger.error(
          "Database authentication or configuration error, not retrying",
          {
            code: error.code,
            message: error.message,
          }
        );
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(1.5, attempt - 1); // Exponential backoff
        logger.info(`Retrying database connection in ${delay}ms...`, {
          attempt: attempt + 1,
          delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error("Database connection failed after all retry attempts", {
    maxRetries,
    lastError: lastError?.message,
  });
  throw lastError;
}

async function closeDB() {
  try {
    const startTime = Date.now();

    logger.info("Closing database connection pool...", {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount,
    });

    await pool.end();

    const closeTime = Date.now() - startTime;

    logger.info("Database connection pool closed successfully", {
      closeTime,
    });

    metricsLogger.logPerformance("database_pool_close", closeTime, {
      success: true,
    });
  } catch (error) {
    logger.error("Error closing database pool:", {
      error: error.message,
      code: error.code,
    });

    metricsLogger.logBusinessMetric("database_pool_close_error", 1, {
      error: error.message,
      code: error.code,
    });

    throw error;
  }
}

// Enhanced database helper functions
async function executeTransaction(callback, isolationLevel = "READ COMMITTED") {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Begin transaction with isolation level
    await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

    logger.debug("Transaction started", {
      isolationLevel,
      clientProcessId: client.processID,
    });

    const result = await callback(client);

    await client.query("COMMIT");

    const transactionTime = Date.now() - startTime;

    logger.debug("Transaction committed successfully", {
      transactionTime,
      isolationLevel,
    });

    metricsLogger.logPerformance(
      "database_transaction_success",
      transactionTime,
      {
        isolationLevel,
      }
    );

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");

      const transactionTime = Date.now() - startTime;

      logger.error("Transaction rolled back due to error", {
        error: error.message,
        transactionTime,
        isolationLevel,
        code: error.code,
      });

      metricsLogger.logBusinessMetric("database_transaction_rollback", 1, {
        error: error.message,
        isolationLevel,
        transactionTime,
      });
    } catch (rollbackError) {
      logger.error("Failed to rollback transaction", {
        originalError: error.message,
        rollbackError: rollbackError.message,
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
          await client.query(`SET statement_timeout = ${timeout}`);
        }

        const result = await client.query(text, params);
        const queryTime = Date.now() - startTime;

        logger.debug("Query executed successfully", {
          queryTime,
          rowCount: result.rowCount,
          command: result.command,
          attempt: attempt + 1,
        });

        metricsLogger.logPerformance("database_query_success", queryTime, {
          command: result.command,
          rowCount: result.rowCount,
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
        maxAttempts: retries + 1,
      });

      if (attempt === retries) {
        metricsLogger.logBusinessMetric("database_query_failure", 1, {
          error: error.message,
          code: error.code,
          attempts: attempt + 1,
        });
        break;
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
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
    minConnections: pool.options.min,
  };
}

// Health check for database
async function healthCheck() {
  try {
    const startTime = Date.now();
    const result = await executeQuery(
      "SELECT 1 as health_check, NOW() as timestamp",
      [],
      { timeout: 5000 }
    );
    const responseTime = Date.now() - startTime;

    const stats = getPoolStats();

    return {
      status: "healthy",
      responseTime,
      timestamp: result.rows[0].timestamp,
      poolStats: stats,
      connectionString: pool.options.connectionString?.replace(
        /\/\/.*@/,
        "//***@"
      ), // Mask credentials
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      code: error.code,
      poolStats: getPoolStats(),
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
    progress:
      stats.total_chapters > 0
        ? ((stats.completed_chapters / stats.total_chapters) * 100).toFixed(1)
        : 0,
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

// Enhanced monitoring and maintenance functions
async function performHealthCheck() {
  const healthData = {
    timestamp: new Date().toISOString(),
    database: {},
    pool: {},
    performance: {},
  };

  try {
    // Basic connectivity test
    const startTime = Date.now();
    const connectResult = await executeQuery(
      "SELECT 1 as test, NOW() as timestamp, version() as version",
      [],
      { timeout: 5000 }
    );
    const responseTime = Date.now() - startTime;

    healthData.database = {
      status: "healthy",
      responseTime,
      version: connectResult.rows[0].version,
      timestamp: connectResult.rows[0].timestamp,
    };

    // Pool statistics
    healthData.pool = getPoolStats();

    // Performance metrics
    const performanceQueries = [
      {
        name: "active_connections",
        query:
          "SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'",
      },
      {
        name: "database_size",
        query:
          "SELECT pg_size_pretty(pg_database_size(current_database())) as size",
      },
      {
        name: "table_stats",
        query: `SELECT 
          schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del 
          FROM pg_stat_user_tables 
          WHERE schemaname = 'public'`,
      },
    ];

    for (const perfQuery of performanceQueries) {
      try {
        const result = await executeQuery(perfQuery.query, [], {
          timeout: 3000,
        });
        healthData.performance[perfQuery.name] = result.rows;
      } catch (error) {
        healthData.performance[perfQuery.name] = { error: error.message };
      }
    }

    // Overall health determination
    const isHealthy =
      healthData.database.status === "healthy" &&
      healthData.pool.totalCount > 0 &&
      responseTime < 5000;

    healthData.overall = isHealthy ? "healthy" : "degraded";

    metricsLogger.logBusinessMetric("database_health_check", 1, {
      status: healthData.overall,
      responseTime,
    });

    return healthData;
  } catch (error) {
    healthData.database = {
      status: "unhealthy",
      error: error.message,
      code: error.code,
    };
    healthData.overall = "unhealthy";

    logger.error("Database health check failed:", {
      error: error.message,
      code: error.code,
    });

    metricsLogger.logBusinessMetric("database_health_check_failure", 1, {
      error: error.message,
      code: error.code,
    });

    return healthData;
  }
}

// Connection monitoring and recovery
async function monitorConnections() {
  try {
    const stats = getPoolStats();

    // Log pool statistics
    logger.debug("Database pool statistics", stats);

    // Check for potential issues
    const warnings = [];

    if (stats.waitingCount > 5) {
      warnings.push(
        `High number of waiting connections: ${stats.waitingCount}`
      );
    }

    if (stats.totalCount >= stats.maxConnections * 0.9) {
      warnings.push(
        `Pool near capacity: ${stats.totalCount}/${stats.maxConnections}`
      );
    }

    if (stats.idleCount === 0 && stats.totalCount > 0) {
      warnings.push("No idle connections available");
    }

    if (warnings.length > 0) {
      logger.warn("Database pool warnings detected", {
        warnings,
        stats,
      });

      metricsLogger.logBusinessMetric("database_pool_warning", 1, {
        warnings: warnings.join(", "),
        ...stats,
      });
    }

    // Log metrics
    metricsLogger.logBusinessMetric(
      "database_pool_total_connections",
      stats.totalCount
    );
    metricsLogger.logBusinessMetric(
      "database_pool_idle_connections",
      stats.idleCount
    );
    metricsLogger.logBusinessMetric(
      "database_pool_waiting_connections",
      stats.waitingCount
    );

    return { status: "ok", stats, warnings };
  } catch (error) {
    logger.error("Connection monitoring failed:", {
      error: error.message,
      code: error.code,
    });

    return { status: "error", error: error.message };
  }
}

// Database maintenance functions
async function performMaintenance() {
  try {
    logger.info("Starting database maintenance...");

    const maintenanceResults = {
      timestamp: new Date().toISOString(),
      tasks: {},
    };

    // Analyze tables for optimization
    const analyzeQueries = ["ANALYZE books", "ANALYZE chapters"];

    for (const query of analyzeQueries) {
      try {
        const startTime = Date.now();
        await executeQuery(query, [], { timeout: 30000 });
        const duration = Date.now() - startTime;

        maintenanceResults.tasks[query] = {
          status: "completed",
          duration,
        };

        logger.debug(`Maintenance task completed: ${query}`, { duration });
      } catch (error) {
        maintenanceResults.tasks[query] = {
          status: "failed",
          error: error.message,
        };

        logger.error(`Maintenance task failed: ${query}`, {
          error: error.message,
        });
      }
    }

    // Get table statistics after maintenance
    const statsQuery = `
      SELECT 
        schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del,
        n_live_tup, n_dead_tup, last_vacuum, last_autovacuum,
        last_analyze, last_autoanalyze
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
    `;

    try {
      const statsResult = await executeQuery(statsQuery);
      maintenanceResults.tableStats = statsResult.rows;
    } catch (error) {
      logger.error("Failed to get table statistics:", error);
    }

    logger.info("Database maintenance completed", maintenanceResults);

    metricsLogger.logBusinessMetric("database_maintenance_completed", 1, {
      tasksCompleted: Object.keys(maintenanceResults.tasks).length,
    });

    return maintenanceResults;
  } catch (error) {
    logger.error("Database maintenance failed:", {
      error: error.message,
      code: error.code,
    });

    metricsLogger.logBusinessMetric("database_maintenance_failure", 1, {
      error: error.message,
    });

    throw error;
  }
}

// Enhanced transaction with deadlock detection and retry
async function executeTransactionWithRetry(callback, options = {}) {
  const {
    isolationLevel = "READ COMMITTED",
    maxRetries = 3,
    retryDelay = 1000,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeTransaction(callback, isolationLevel);
    } catch (error) {
      lastError = error;

      // Check if error is retryable (deadlock, serialization failure, etc.)
      const retryableCodes = ["40001", "40P01", "55P03"];

      if (retryableCodes.includes(error.code) && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);

        logger.warn(
          `Transaction failed with retryable error, retrying in ${delay}ms`,
          {
            error: error.message,
            code: error.code,
            attempt,
            maxRetries,
          }
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error or max retries reached
      logger.error("Transaction failed after retries", {
        error: error.message,
        code: error.code,
        attempt,
        maxRetries,
      });

      break;
    }
  }

  throw lastError;
}

// Graceful shutdown with connection cleanup
async function gracefulShutdown() {
  try {
    logger.info("Starting graceful database shutdown...");

    // Stop accepting new connections
    const stats = getPoolStats();
    logger.info("Current pool state before shutdown", stats);

    // Wait for active connections to finish (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (
      pool.totalCount > pool.idleCount &&
      Date.now() - startTime < shutdownTimeout
    ) {
      logger.info("Waiting for active connections to finish...", {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        activeConnections: pool.totalCount - pool.idleCount,
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Close the pool
    await closeDB();

    logger.info("Database graceful shutdown completed");
  } catch (error) {
    logger.error("Error during graceful shutdown:", {
      error: error.message,
      code: error.code,
    });

    throw error;
  }
}

module.exports = {
  pool,
  connectDB,
  closeDB,
  executeTransaction,
  executeTransactionWithRetry,
  executeQuery,
  getPoolStats,
  healthCheck,
  performHealthCheck,
  monitorConnections,
  performMaintenance,
  gracefulShutdown,
  findBookById,
  findChapterById,
  updateBookStatus,
  updateChapterStatus,
  getBookProgress,
  searchBooks,
};
