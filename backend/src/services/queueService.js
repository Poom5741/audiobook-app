const Bull = require('bull');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const { createLogger, createMetricsLogger } = require('../../../../shared/logger');
const { updateChapterStatus, updateBookStatus, getBookProgress } = require('./database');
const { serviceHelpers, callService } = require('../utils/circuitBreaker');

const logger = createLogger('queue-service');
const metricsLogger = createMetricsLogger('queue-service');

let ttsQueue;

// Enhanced retry configurations for different job types
const retryConfigs = {
  tts: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 10000, // Start with 10 seconds
      settings: {
        factor: 2.5,
        maxDelay: 600000 // Max 10 minutes
      }
    },
    removeOnComplete: 100,
    removeOnFail: 50
  },
  summarization: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
      settings: {
        factor: 2,
        maxDelay: 300000 // Max 5 minutes
      }
    },
    removeOnComplete: 50,
    removeOnFail: 25
  },
  parsing: {
    attempts: 4,
    backoff: {
      type: 'exponential',
      delay: 8000,
      settings: {
        factor: 3,
        maxDelay: 480000 // Max 8 minutes
      }
    },
    removeOnComplete: 75,
    removeOnFail: 30
  },
  download: {
    attempts: 6,
    backoff: {
      type: 'exponential',
      delay: 15000,
      settings: {
        factor: 2,
        maxDelay: 900000 // Max 15 minutes
      }
    },
    removeOnComplete: 50,
    removeOnFail: 40
  }
};

async function initializeQueue() {
  // Initialize TTS queue with enhanced retry configuration
  ttsQueue = new Bull('tts-generation', {
    redis: process.env.REDIS_URL,
    defaultJobOptions: {
      ...retryConfigs.tts,
      // Add job timeout
      timeout: 600000, // 10 minutes timeout per job
      // Add job TTL
      ttl: 3600000, // Jobs expire after 1 hour if not processed
      // Add delay for failed jobs
      delay: 0
    },
    settings: {
      stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
      maxStalledCount: 1, // Max number of times a job can stall before failing
      retryProcessDelay: 5000 // Delay before retrying failed job processing
    }
  });

  // Process TTS jobs
  ttsQueue.process(2, async (job) => {
    const { 
      chapterId, 
      bookId, 
      text, 
      title, 
      chapterNumber,
      bookTitle,
      author,
      voice = 'default',
      model = 'bark',
      summarize = false,
      summarizeOptions = {}
    } = job.data;

    try {
      logger.info(`Starting TTS generation for: ${bookTitle} - ${title}`);
      
      // Update progress
      await job.progress(10);

      let processedText = text;
      
      // Summarize text if enabled using circuit breaker
      if (summarize) {
        logger.info(`Summarizing text for chapter: ${title}`);
        
        try {
          const summarizerApiUrl = process.env.SUMMARIZER_API_URL || 'http://localhost:8001';
          
          // Use circuit breaker for summarization service
          const summarizeResponse = await callService('summarizer', {
            url: `${summarizerApiUrl}/api/summarize`,
            method: 'POST',
            data: {
              text: text,
              style: summarizeOptions.style || 'concise',
              maxLength: summarizeOptions.maxLength || 500,
              contentType: summarizeOptions.contentType || 'narrative'
            },
            timeout: 60000
          }, { retries: 2 }); // Fewer retries for summarization
          
          if (summarizeResponse.data && summarizeResponse.data.summary) {
            processedText = summarizeResponse.data.summary;
            logger.info(`Text summarized: ${text.length} → ${processedText.length} chars (${summarizeResponse.data.compressionRatio}% compression)`);
            
            // Log summarization metrics
            metricsLogger.logBusinessMetric('text_summarization', 1, {
              originalLength: text.length,
              summaryLength: processedText.length,
              compressionRatio: summarizeResponse.data.compressionRatio,
              chapterId,
              bookId
            });
          } else {
            logger.warn('Summarization response was empty, using original text');
          }
        } catch (summaryError) {
          logger.error('Summarization failed via circuit breaker, using original text', {
            error: summaryError.message,
            statusCode: summaryError.statusCode,
            chapterId,
            attempt: job.attemptsMade
          });
          
          // Continue with original text if summarization fails
          metricsLogger.logBusinessMetric('summarization_failure', 1, {
            error: summaryError.message,
            chapterId,
            bookId,
            attempt: job.attemptsMade
          });
        }
      }

      await job.progress(20);

      // Prepare text for TTS
      const cleanedText = processedText
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s.,!?;:'"()-]/g, '')
        .trim();

      if (cleanedText.length === 0) {
        throw new Error('No valid text content for TTS generation');
      }

      // Call TTS API using circuit breaker
      await job.progress(30);
      
      const ttsApiUrl = process.env.TTS_API_URL;
      if (!ttsApiUrl) {
        throw new Error('TTS_API_URL not configured');
      }

      // Use circuit breaker for TTS service
      const ttsResponse = await callService('tts', {
        url: `${ttsApiUrl}/tts`,
        method: 'POST',
        data: {
          text: cleanedText,
          title: `${bookTitle} - ${title}`,
          voice: voice,
          model: model,
          chapter_id: chapterId,
          book_id: bookId
        },
        timeout: 300000, // 5 minutes
        responseType: 'stream'
      }, { retries: 1 }); // Limited retries for TTS due to long processing time

      await job.progress(60);

      // Create audio file path
      const audioDir = path.join(process.env.AUDIO_PATH || '/audio', bookId);
      await fs.ensureDir(audioDir);

      const audioFileName = `chapter-${chapterNumber.toString().padStart(3, '0')}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);
      const relativeAudioPath = path.join(bookId, audioFileName);

      // Save audio file
      const writeStream = fs.createWriteStream(audioPath);
      
      let totalSize = 0;
      
      // Handle stream response from circuit breaker
      const responseStream = ttsResponse.data instanceof require('stream').Readable ? 
        ttsResponse.data : 
        require('stream').Readable.from(Buffer.from(ttsResponse.data));
      
      responseStream.on('data', (chunk) => {
        totalSize += chunk.length;
        // Update progress based on data received (rough estimate)
        const progress = Math.min(60 + (totalSize / 1000000) * 20, 80);
        job.progress(progress);
      });

      await new Promise((resolve, reject) => {
        responseStream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        responseStream.on('error', reject);
      });

      // Log TTS generation metrics
      metricsLogger.logBusinessMetric('tts_generation_success', 1, {
        chapterId,
        bookId,
        textLength: cleanedText.length,
        voice,
        model,
        duration: ttsResponse.duration || 0
      });

      await job.progress(90);

      // Verify file was created and has content
      const stats = await fs.stat(audioPath);
      if (stats.size === 0) {
        await fs.remove(audioPath);
        throw new Error('Generated audio file is empty');
      }

      // Estimate duration based on text length (rough: 200 words per minute)
      const wordCount = cleanedText.split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount / 200 * 60); // seconds

      // Update database
      await updateChapterStatus(chapterId, 'completed', relativeAudioPath);

      await job.progress(95);

      // Check if entire book is complete
      const bookProgress = await getBookProgress(bookId);
      if (bookProgress.processingChapters === 0 && bookProgress.completedChapters > 0) {
        await updateBookStatus(bookId, 'ready');
        logger.info(`Book completed: ${bookTitle}`);
      }

      await job.progress(100);

      logger.info(`TTS generation completed: ${audioPath}`);
      
      return {
        chapterId,
        audioPath: relativeAudioPath,
        fileSize: stats.size,
        duration: estimatedDuration,
        wordCount,
        summarized: summarize,
        originalTextLength: text.length,
        processedTextLength: processedText.length
      };

    } catch (error) {
      logger.error(`TTS generation failed for chapter ${chapterId}:`, {
        error: error.message,
        statusCode: error.statusCode,
        chapterId,
        bookId,
        attempt: job.attemptsMade,
        service: error.service || 'unknown'
      });
      
      // Log failure metrics with circuit breaker context
      metricsLogger.logBusinessMetric('tts_generation_failure', 1, {
        error: error.message,
        statusCode: error.statusCode,
        chapterId,
        bookId,
        attempt: job.attemptsMade,
        service: error.service || 'tts'
      });
      
      // Update chapter status to failed
      await updateChapterStatus(chapterId, 'failed');
      
      throw error;
    }
  });

  // Queue event handlers
  ttsQueue.on('completed', (job, result) => {
    logger.info(`TTS job ${job.id} completed:`, {
      chapterId: result.chapterId,
      audioPath: result.audioPath,
      fileSize: result.fileSize
    });
  });

  ttsQueue.on('failed', (job, err) => {
    logger.error(`TTS job ${job.id} failed:`, {
      error: err.message,
      chapterId: job.data.chapterId,
      title: job.data.title
    });
  });

  ttsQueue.on('stalled', (job) => {
    logger.warn(`TTS job ${job.id} stalled:`, {
      chapterId: job.data.chapterId,
      title: job.data.title
    });
  });

  ttsQueue.on('progress', (job, progress) => {
    logger.debug(`TTS job ${job.id} progress: ${progress}%`);
  });

  logger.info('TTS queue initialized');
}

async function addTTSJob(jobData, priority = 0) {
  if (!ttsQueue) {
    throw new Error('TTS queue not initialized');
  }

  const job = await ttsQueue.add(jobData, {
    priority: -priority, // Bull uses negative values for higher priority
    delay: 0,
    jobId: `tts-${jobData.chapterId}-${Date.now()}`
  });

  logger.debug(`Added TTS job ${job.id} for chapter ${jobData.chapterId}`);
  return job;
}

async function getTTSQueueStats() {
  if (!ttsQueue) {
    throw new Error('TTS queue not initialized');
  }

  const [waiting, active, completed, failed] = await Promise.all([
    ttsQueue.getWaitingCount(),
    ttsQueue.getActiveCount(),
    ttsQueue.getCompletedCount(),
    ttsQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active + completed + failed
  };
}

async function getTTSJobs(status = 'active', limit = 20) {
  if (!ttsQueue) {
    throw new Error('TTS queue not initialized');
  }

  let jobs;
  
  switch (status) {
    case 'waiting':
      jobs = await ttsQueue.getWaiting(0, limit);
      break;
    case 'active':
      jobs = await ttsQueue.getActive(0, limit);
      break;
    case 'completed':
      jobs = await ttsQueue.getCompleted(0, limit);
      break;
    case 'failed':
      jobs = await ttsQueue.getFailed(0, limit);
      break;
    default:
      jobs = await ttsQueue.getJobs(['waiting', 'active'], 0, limit);
  }

  return jobs.map(job => ({
    id: job.id,
    data: job.data,
    progress: job.progress(),
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    delay: job.delay
  }));
}

async function cancelTTSJob(jobId) {
  if (!ttsQueue) {
    throw new Error('TTS queue not initialized');
  }

  const job = await ttsQueue.getJob(jobId);
  
  if (!job) {
    throw new Error('Job not found');
  }

  await job.remove();
  
  // Reset chapter status
  if (job.data.chapterId) {
    await updateChapterStatus(job.data.chapterId, 'parsed');
  }

  logger.info(`Cancelled TTS job: ${jobId}`);
  return true;
}

async function cleanupQueue() {
  if (!ttsQueue) {
    return;
  }

  // Clean old completed and failed jobs
  await ttsQueue.clean(24 * 60 * 60 * 1000); // 24 hours
  await ttsQueue.clean(24 * 60 * 60 * 1000, 'failed');
  
  logger.info('TTS queue cleanup completed');
}

// Get queue instance (for route handlers)
function getTTSQueue() {
  return ttsQueue;
}

module.exports = {
  initializeQueue,
  addTTSJob,
  getTTSQueueStats,
  getTTSJobs,
  cancelTTSJob,
  cleanupQueue,
  getTTSQueue
};