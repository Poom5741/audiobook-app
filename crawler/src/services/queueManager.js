const Bull = require('bull');
const { logger } = require('../utils/logger');
const Scraper = require('./scraper');
const DownloadManager = require('./downloadManager');
const { pool } = require('../db/connection');

let downloadQueue;
let scraper;
let downloadManager;

async function initializeQueue() {
  // Initialize services
  scraper = new Scraper();
  await scraper.initialize();
  
  downloadManager = new DownloadManager();

  // Create download queue
  downloadQueue = new Bull('download-queue', {
    redis: {
      port: 6379,
      host: 'redis',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  });

  // Process download jobs
  downloadQueue.process(2, async (job) => {
    const { bookUrl, bookDetails } = job.data;
    
    try {
      // Update job progress
      await job.progress(10);

      // Get direct download link if needed
      let downloadUrl = bookUrl;
      if (bookDetails.downloadLinks && bookDetails.downloadLinks.length > 0) {
        // Try to get direct download link
        for (const link of bookDetails.downloadLinks) {
          try {
            const directLink = await scraper.getDirectDownloadLink(link.url);
            if (directLink) {
              downloadUrl = directLink;
              break;
            }
          } catch (error) {
            logger.warn(`Failed to get direct link from ${link.source}:`, error.message);
          }
        }
      }

      // Update job progress
      await job.progress(30);

      // Download file with progress tracking
      const filePath = await downloadManager.downloadFile(
        downloadUrl, 
        bookDetails,
        (progress) => {
          // Update job progress (30-90% for download)
          job.progress(30 + (progress * 0.6));
        }
      );

      // Save to database
      await job.progress(95);
      const bookId = await downloadManager.saveBookToDatabase(bookDetails, filePath);

      // Update download queue record
      await updateDownloadRecord(job.data.queueId, 'completed', bookId);

      await job.progress(100);
      logger.info(`Download job completed: ${bookDetails.title}`);

      return { bookId, filePath };

    } catch (error) {
      logger.error(`Download job failed: ${bookDetails.title}`, error);
      await updateDownloadRecord(job.data.queueId, 'failed', null, error.message);
      throw error;
    }
  });

  // Queue event handlers
  downloadQueue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed:`, result);
  });

  downloadQueue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} failed:`, err.message);
  });

  downloadQueue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} stalled`);
  });

  return downloadQueue;
}

async function addToDownloadQueue(bookUrl, bookDetails, priority = 0) {
  // First, check if book already exists
  const client = await pool.connect();
  
  try {
    // Check by title and author
    const checkQuery = `
      SELECT id, file_path FROM books 
      WHERE title = $1 AND author = $2
      LIMIT 1
    `;
    const existing = await client.query(checkQuery, [bookDetails.title, bookDetails.author]);
    
    if (existing.rows.length > 0) {
      logger.info(`Book already exists: ${bookDetails.title}`);
      return { 
        status: 'exists', 
        bookId: existing.rows[0].id,
        filePath: existing.rows[0].file_path 
      };
    }

    // Add to download queue table
    const queueQuery = `
      INSERT INTO download_queue (url, title, status)
      VALUES ($1, $2, 'queued')
      RETURNING id
    `;
    const queueResult = await client.query(queueQuery, [bookUrl, bookDetails.title]);
    const queueId = queueResult.rows[0].id;

    // Add to Bull queue
    const job = await downloadQueue.add({
      bookUrl,
      bookDetails,
      queueId
    }, {
      priority,
      delay: 0
    });

    logger.info(`Added to download queue: ${bookDetails.title} (Job ID: ${job.id})`);
    
    return { 
      status: 'queued', 
      jobId: job.id,
      queueId 
    };

  } finally {
    client.release();
  }
}

async function updateDownloadRecord(queueId, status, bookId = null, errorMessage = null) {
  const client = await pool.connect();
  
  try {
    const query = `
      UPDATE download_queue 
      SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;
    await client.query(query, [status, errorMessage, queueId]);

  } finally {
    client.release();
  }
}

async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    downloadQueue.getWaitingCount(),
    downloadQueue.getActiveCount(),
    downloadQueue.getCompletedCount(),
    downloadQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active + completed + failed
  };
}

async function getQueueJobs(status = 'waiting', limit = 20) {
  let jobs;
  
  switch (status) {
    case 'waiting':
      jobs = await downloadQueue.getWaiting(0, limit);
      break;
    case 'active':
      jobs = await downloadQueue.getActive(0, limit);
      break;
    case 'completed':
      jobs = await downloadQueue.getCompleted(0, limit);
      break;
    case 'failed':
      jobs = await downloadQueue.getFailed(0, limit);
      break;
    default:
      jobs = await downloadQueue.getJobs(['waiting', 'active'], 0, limit);
  }

  return jobs.map(job => ({
    id: job.id,
    data: job.data,
    progress: job.progress(),
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn
  }));
}

async function cleanupQueue() {
  await downloadQueue.clean(86400000); // 24 hours
  await downloadQueue.clean(86400000, 'failed');
  logger.info('Queue cleanup completed');
}

module.exports = {
  initializeQueue,
  addToDownloadQueue,
  getQueueStats,
  getQueueJobs,
  cleanupQueue,
  getScraper: () => scraper,
  getDownloadManager: () => downloadManager
};