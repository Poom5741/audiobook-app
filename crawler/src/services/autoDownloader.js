const { logger } = require('../utils/logger');
const { getScraper, addToDownloadQueue } = require('./queueManager');

class AutoDownloader {
    constructor() {
        this.isRunning = false;
        this.interval = null;
        this.config = {
            // Auto-download configuration
            enabled: process.env.AUTO_DOWNLOAD_ENABLED === 'true',
            interval: parseInt(process.env.AUTO_DOWNLOAD_INTERVAL || '3600000'), // 1 hour default
            maxPerSession: parseInt(process.env.AUTO_DOWNLOAD_MAX_PER_SESSION || '3'),
            searchQueries: [
                'science fiction',
                'fantasy',
                'mystery',
                'programming',
                'history',
                'philosophy'
            ],
            formats: ['epub', 'pdf'],
            languages: ['en']
        };
    }

    start() {
        if (!this.config.enabled) {
            logger.info('Auto-downloader is disabled');
            return;
        }

        if (this.isRunning) {
            logger.warn('Auto-downloader is already running');
            return;
        }

        this.isRunning = true;
        logger.info(`Starting auto-downloader (interval: ${this.config.interval}ms)`);

        // Run immediately on start
        this.downloadSession();

        // Schedule periodic downloads
        this.interval = setInterval(() => {
            this.downloadSession();
        }, this.config.interval);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        logger.info('Auto-downloader stopped');
    }

    async downloadSession() {
        try {
            logger.info('Starting auto-download session');
            
            const scraper = getScraper();
            if (!scraper) {
                logger.error('Scraper not available for auto-download');
                return;
            }

            let downloadCount = 0;
            const maxDownloads = this.config.maxPerSession;

            // Randomly select search queries
            const shuffledQueries = this.shuffleArray([...this.config.searchQueries]);
            
            for (const query of shuffledQueries) {
                if (downloadCount >= maxDownloads) break;

                try {
                    logger.info(`Auto-searching for: ${query}`);
                    
                    const results = await scraper.search(query, {
                        limit: 3,
                        language: this.config.languages[0],
                        format: this.config.formats.join(',')
                    });

                    if (!results || results.length === 0) {
                        logger.info(`No results found for: ${query}`);
                        continue;
                    }

                    // Try to download the first available book
                    for (const book of results) {
                        if (downloadCount >= maxDownloads) break;

                        try {
                            const bookDetails = await scraper.getBookDetails(book.url || book.downloadUrl);
                            
                            if (bookDetails && bookDetails.title) {
                                const result = await addToDownloadQueue(
                                    book.url || book.downloadUrl, 
                                    bookDetails, 
                                    0 // Low priority for auto-downloads
                                );

                                if (result.status === 'queued' || result.status === 'exists') {
                                    logger.info(`Auto-queued: ${bookDetails.title} by ${bookDetails.author}`);
                                    downloadCount++;
                                    
                                    // Add delay between downloads
                                    await this.delay(5000);
                                    break; // Move to next query
                                }
                            }
                        } catch (bookError) {
                            logger.warn(`Failed to process book from ${query}: ${bookError.message}`);
                        }
                    }
                } catch (queryError) {
                    logger.warn(`Failed to search for ${query}: ${queryError.message}`);
                }

                // Add delay between queries
                await this.delay(2000);
            }

            logger.info(`Auto-download session completed. Downloaded: ${downloadCount}/${maxDownloads}`);

        } catch (error) {
            logger.error('Auto-download session failed:', error);
        }
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus() {
        return {
            running: this.isRunning,
            enabled: this.config.enabled,
            interval: this.config.interval,
            maxPerSession: this.config.maxPerSession,
            searchQueries: this.config.searchQueries.length
        };
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Auto-downloader config updated');
        
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }
}

module.exports = { AutoDownloader };