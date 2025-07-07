const Bull = require('bull');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../utils/logger');
const { updateChapterStatus, updateBookStatus, getBookProgress } = require('./database');

let ttsQueue;

async function initializeQueue() {
  // Initialize TTS queue
  ttsQueue = new Bull('tts-generation', {
    redis: process.env.REDIS_URL,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 50,
      removeOnFail: 20
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
      model = 'bark'
    } = job.data;

    try {
      logger.info(`Starting TTS generation for: ${bookTitle} - ${title}`);
      
      // Update progress
      await job.progress(10);

      // Prepare text for TTS
      const cleanedText = text
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s.,!?;:'"()-]/g, '')
        .trim();

      if (cleanedText.length === 0) {
        throw new Error('No valid text content for TTS generation');
      }

      // Call TTS API
      await job.progress(20);
      
      const ttsApiUrl = process.env.TTS_API_URL;
      if (!ttsApiUrl) {
        throw new Error('TTS_API_URL not configured');
      }

      const ttsResponse = await axios.post(`${ttsApiUrl}/tts`, {
        text: cleanedText,
        title: `${bookTitle} - ${title}`,
        voice: voice,
        model: model,
        chapter_id: chapterId,
        book_id: bookId
      }, {
        timeout: 300000, // 5 minutes
        responseType: 'stream'
      });

      await job.progress(50);

      // Create audio file path
      const audioDir = path.join(process.env.AUDIO_PATH || '/audio', bookId);
      await fs.ensureDir(audioDir);

      const audioFileName = `chapter-${chapterNumber.toString().padStart(3, '0')}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);
      const relativeAudioPath = path.join(bookId, audioFileName);

      // Save audio file
      const writeStream = fs.createWriteStream(audioPath);
      
      let totalSize = 0;
      ttsResponse.data.on('data', (chunk) => {
        totalSize += chunk.length;
        // Update progress based on data received (rough estimate)
        const progress = Math.min(50 + (totalSize / 1000000) * 30, 80);
        job.progress(progress);
      });

      await new Promise((resolve, reject) => {
        ttsResponse.data.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        ttsResponse.data.on('error', reject);
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
        wordCount
      };

    } catch (error) {
      logger.error(`TTS generation failed for chapter ${chapterId}:`, error);
      
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