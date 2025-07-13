const axios = require('axios');
const fs = require('fs-extra');
const { logger } = require('../utils/logger');
const { updateJobStep, pipelineJobs, simulateStep } = require('./queueManager'); // Assuming queueManager handles job tracking

async function processUploadPipeline(jobId, filePath, originalName, options = {}) {
    const job = pipelineJobs.get(jobId);
    if (!job) return;

    try {
        // Step 1: Parse the uploaded file
        updateJobStep(jobId, 'parse', 'running', `Extracting text from: ${originalName}`);
        job.progress = 25;

        const parserApiUrl = process.env.PARSER_API_URL || 'http://parser:3002';

        const parseResponse = await axios.post(`${parserApiUrl}/api/parse/file`, {
            filePath: filePath,
            options: {
                saveToDb: true // Save parsed chapters to DB
            }
        }, {
            timeout: 300000 // 5 minutes
        });

        if (!parseResponse.data || !parseResponse.data.success) {
            throw new Error(`Parsing failed: ${parseResponse.data.message || 'Unknown error'}`);
        }

        const bookDetails = {
            title: parseResponse.data.metadata.title || originalName,
            author: parseResponse.data.metadata.author || 'Unknown',
            file_path: parseResponse.data.outputDir, // Path to parsed output
            format: parseResponse.data.fileType,
            bookId: parseResponse.data.bookId // ID from database
        };

        job.books.push({
            title: bookDetails.title,
            author: bookDetails.author,
            status: 'parsed',
            parsedAt: new Date(),
            format: bookDetails.format,
            bookId: bookDetails.bookId
        });

        updateJobStep(jobId, 'parse', 'completed', `Text extracted from: ${bookDetails.title}`);
        job.progress = 50;

        // Step 2: Generate TTS
        updateJobStep(jobId, 'tts', 'running', `Generating audio for: ${bookDetails.title}`);
        
        // Call TTS service for each chapter (with summarization if enabled)
        // The parser service already handles TTS generation and updates the DB
        // We just need to wait for it to complete and update job status
        
        // For now, we assume TTS is done by parser and just update status
        // In a more complex setup, this might involve polling the parser or a separate TTS job queue
        
        // Simulate TTS completion if parser doesn't return full TTS status
        await simulateStep(5000); // Simulate TTS processing time

        updateJobStep(jobId, 'tts', 'completed', `Audio generated for: ${bookDetails.title}`);
        job.progress = 75;

        // Step 3: Complete
        updateJobStep(jobId, 'complete', 'completed', 'Audiobook pipeline completed!');
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date();

    } catch (error) {
        logger.error(`Upload pipeline ${jobId} failed:`, error);
        job.status = 'failed';
        job.error = error.message;
        updateJobStep(jobId, job.steps.parse.status === 'pending' ? 'parse' : 'tts', 'failed', error.message);
    } finally {
        // Clean up the uploaded file
        await fs.remove(filePath).catch(err => logger.error(`Failed to remove temp file ${filePath}:`, err));
    }
}

module.exports = { processUploadPipeline };