const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { getScraper, addToDownloadQueue } = require('../services/queueManager');

// In-memory pipeline status storage (in production, use Redis)
const pipelineJobs = new Map();

// Create a complete audiobook pipeline
router.post('/create-audiobook', async (req, res) => {
    try {
        const { searchQuery, format = 'epub,pdf', maxBooks = 1 } = req.body;

        if (!searchQuery) {
            return res.status(400).json({ error: 'searchQuery is required' });
        }

        const jobId = `audiobook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Initialize job tracking
        const job = {
            id: jobId,
            searchQuery,
            status: 'starting',
            progress: 0,
            steps: {
                search: { status: 'pending', message: 'Searching for books...' },
                download: { status: 'pending', message: 'Waiting for download...' },
                parse: { status: 'pending', message: 'Waiting for text extraction...' },
                tts: { status: 'pending', message: 'Waiting for audio generation...' },
                complete: { status: 'pending', message: 'Waiting for completion...' }
            },
            books: [],
            createdAt: new Date(),
            estimatedTime: '5-15 minutes'
        };

        pipelineJobs.set(jobId, job);

        // Start pipeline in background
        processPipeline(jobId, searchQuery, format, maxBooks);

        res.json({
            jobId,
            status: 'started',
            message: `Pipeline started for "${searchQuery}"`,
            trackingUrl: `/api/pipeline/status/${jobId}`,
            estimatedTime: job.estimatedTime
        });

    } catch (error) {
        logger.error('Pipeline creation error:', error);
        res.status(500).json({ error: 'Failed to start pipeline', message: error.message });
    }
});

// Get pipeline status
router.get('/status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = pipelineJobs.get(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);

    } catch (error) {
        logger.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// List all pipeline jobs
router.get('/jobs', async (req, res) => {
    try {
        const jobs = Array.from(pipelineJobs.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 20); // Latest 20 jobs

        res.json({ jobs, count: jobs.length });

    } catch (error) {
        logger.error('Jobs list error:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});

// Cancel a pipeline job
router.delete('/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = pipelineJobs.get(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        job.status = 'cancelled';
        job.progress = 0;
        updateJobStep(jobId, 'complete', 'cancelled', 'Job cancelled by user');

        res.json({ message: 'Job cancelled', jobId });

    } catch (error) {
        logger.error('Job cancellation error:', error);
        res.status(500).json({ error: 'Failed to cancel job' });
    }
});

async function processPipeline(jobId, searchQuery, format, maxBooks) {
    const job = pipelineJobs.get(jobId);
    if (!job) return;

    try {
        // Step 1: Search for books
        updateJobStep(jobId, 'search', 'running', 'Searching for books...');
        job.progress = 10;

        const scraper = getScraper();
        if (!scraper) {
            throw new Error('Scraper service not available');
        }

        const searchResults = await scraper.search(searchQuery, {
            limit: maxBooks * 3, // Search more to have options
            format
        });

        if (!searchResults || searchResults.length === 0) {
            throw new Error(`No books found for "${searchQuery}"`);
        }

        updateJobStep(jobId, 'search', 'completed', `Found ${searchResults.length} books`);
        job.progress = 25;

        // Step 2: Download books
        let downloadedCount = 0;
        const targetBooks = searchResults.slice(0, maxBooks);

        for (const book of targetBooks) {
            if (job.status === 'cancelled') return;

            updateJobStep(jobId, 'download', 'running', `Downloading: ${book.title}`);
            
            try {
                const bookDetails = await scraper.getBookDetails(book.url || book.downloadUrl);
                
                if (bookDetails && bookDetails.title) {
                    const downloadResult = await addToDownloadQueue(
                        book.url || book.downloadUrl, 
                        bookDetails, 
                        2 // High priority for pipeline jobs
                    );

                    if (downloadResult.status === 'queued' || downloadResult.status === 'exists') {
                        job.books.push({
                            title: bookDetails.title,
                            author: bookDetails.author,
                            url: book.url || book.downloadUrl,
                            status: 'downloaded',
                            downloadedAt: new Date()
                        });
                        downloadedCount++;
                        
                        // Start processing this book immediately
                        processBookToPipeline(jobId, bookDetails, downloadedCount, maxBooks);
                    }
                }
            } catch (bookError) {
                logger.warn(`Failed to download book: ${bookError.message}`);
            }
        }

        if (downloadedCount === 0) {
            throw new Error('Failed to download any books');
        }

        updateJobStep(jobId, 'download', 'completed', `Downloaded ${downloadedCount} book(s)`);
        job.progress = 50;

        // Wait for all books to complete processing
        await waitForPipelineCompletion(jobId);

    } catch (error) {
        logger.error(`Pipeline ${jobId} failed:`, error);
        job.status = 'failed';
        job.error = error.message;
        updateJobStep(jobId, job.steps.search.status === 'pending' ? 'search' : 'download', 'failed', error.message);
    }
}

async function processBookToPipeline(jobId, bookDetails, bookIndex, totalBooks) {
    const job = pipelineJobs.get(jobId);
    if (!job || job.status === 'cancelled') return;

    try {
        // Step 3: Parse the book
        updateJobStep(jobId, 'parse', 'running', `Extracting text from: ${bookDetails.title}`);
        
        // Simulate parsing (in reality, call parser service)
        await simulateStep(2000); // 2 second delay
        
        updateJobStep(jobId, 'parse', 'completed', `Text extracted from: ${bookDetails.title}`);
        job.progress = 50 + (bookIndex / totalBooks) * 20; // 50-70%

        // Step 4: Generate TTS
        updateJobStep(jobId, 'tts', 'running', `Generating audio for: ${bookDetails.title}`);
        
        // Call TTS service for each chapter
        const chapters = await generateAudiobook(bookDetails);
        
        // Update book record with audio info
        const bookRecord = job.books.find(b => b.title === bookDetails.title);
        if (bookRecord) {
            bookRecord.audioChapters = chapters;
            bookRecord.status = 'audio_generated';
        }

        updateJobStep(jobId, 'tts', 'completed', `Audio generated: ${chapters.length} chapters`);
        job.progress = 70 + (bookIndex / totalBooks) * 25; // 70-95%

        // Check if all books are processed
        const allBooksProcessed = job.books.every(book => 
            book.status === 'audio_generated' || book.status === 'failed'
        );

        if (allBooksProcessed) {
            updateJobStep(jobId, 'complete', 'completed', 'Audiobook pipeline completed!');
            job.status = 'completed';
            job.progress = 100;
            job.completedAt = new Date();
            
            // Calculate actual duration
            const duration = new Date() - new Date(job.createdAt);
            job.actualDuration = Math.round(duration / 1000 / 60); // minutes
        }

    } catch (error) {
        logger.error(`Book processing failed for ${bookDetails.title}:`, error);
        
        const bookRecord = job.books.find(b => b.title === bookDetails.title);
        if (bookRecord) {
            bookRecord.status = 'failed';
            bookRecord.error = error.message;
        }
    }
}

async function generateAudiobook(bookDetails) {
    try {
        // Simulate chapter breakdown
        const chapters = [
            'Chapter 1: Introduction',
            'Chapter 2: Main Content', 
            'Chapter 3: Advanced Topics',
            'Chapter 4: Conclusion'
        ];

        const audioChapters = [];

        for (let i = 0; i < chapters.length; i++) {
            // Call TTS API
            const response = await fetch('http://tts-api:8000/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `This is ${chapters[i]} of ${bookDetails.title} by ${bookDetails.author}. [Simulated content for demonstration]`,
                    book: bookDetails.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
                    chapter: `chapter-${i + 1}`,
                    speaker: '9017',
                    emotion: 'neutral',
                    speed: 1.0
                })
            });

            if (response.ok) {
                const result = await response.json();
                audioChapters.push({
                    chapter: i + 1,
                    title: chapters[i],
                    audioPath: result.audio_path,
                    duration: result.duration,
                    fileSize: result.file_size
                });
            }

            // Small delay between chapters
            await simulateStep(1000);
        }

        return audioChapters;

    } catch (error) {
        logger.error('TTS generation failed:', error);
        throw new Error('Failed to generate audio');
    }
}

function updateJobStep(jobId, stepName, status, message) {
    const job = pipelineJobs.get(jobId);
    if (job && job.steps[stepName]) {
        job.steps[stepName].status = status;
        job.steps[stepName].message = message;
        job.steps[stepName].updatedAt = new Date();
        
        logger.info(`Pipeline ${jobId} - ${stepName}: ${status} - ${message}`);
    }
}

async function waitForPipelineCompletion(jobId) {
    const job = pipelineJobs.get(jobId);
    if (!job) return;

    return new Promise((resolve) => {
        const checkCompletion = () => {
            const currentJob = pipelineJobs.get(jobId);
            if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') {
                resolve();
                return;
            }
            setTimeout(checkCompletion, 1000); // Check every second
        };
        
        setTimeout(checkCompletion, 1000);
    });
}

function simulateStep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;