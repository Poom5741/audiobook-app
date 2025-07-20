const puppeteer = require('puppeteer');
const { logger } = require('../utils/logger');

class Scraper {
  constructor() {
    this.browser = null;
    this.baseUrl = process.env.CRAWLER_BASE_URL || 'https://annas-archive.org';
  }

  async initialize() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        logger.warn('Error closing existing browser instance:', e);
      }
    }
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        dumpio: true
      });
      logger.info('Browser initialized');
    } catch (error) {
      logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async ensureBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      logger.warn('Browser not connected or not initialized. Attempting to re-initialize.');
      await this.initialize();
    }
  }

  async search(query, options = {}) {
    const { limit = 10, language = 'en', format = '' } = options;
    
    await this.ensureBrowser();
    const page = await this.browser.newPage();
    
    try {
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // Navigate to search page
      const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (e) {
        logger.error('Error navigating to page:', e);
        throw e;
      }

      // Wait for results
      await page.waitForSelector('a[href*="/md5/"]', { timeout: 30000 });

      // Extract book data
      const books = await page.evaluate((limit) => {
        const results = [];
        const items = document.querySelectorAll('a[href*="/md5/"]');
        
        for (let i = 0; i < Math.min(items.length, limit); i++) {
          const item = items[i];
          const titleEl = item.querySelector('h3');
          const authorEl = item.querySelector('.text-sm.text-gray-500');
          const detailsEl = item.querySelector('.text-xs.text-gray-400');
          const linkEl = item.querySelector('a');
          
          if (titleEl && linkEl) {
            results.push({
              title: titleEl.textContent.trim(),
              author: authorEl ? authorEl.textContent.trim() : 'Unknown',
              details: detailsEl ? detailsEl.textContent.trim() : '',
              link: linkEl.href,
              md5: linkEl.href.match(/md5\/([a-f0-9]+)/)?.[1] || ''
            });
          }
        }
        
        return results;
      }, limit);

      logger.info(`Found ${books.length} books for query: ${query}`);
      return books;

    } catch (error) {
      logger.error('Search failed:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async getBookDetails(bookUrl) {
    await this.ensureBrowser();
    const page = await this.browser.newPage();
    
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      await page.goto(bookUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Extract book details and download links
      const bookDetails = await page.evaluate(() => {
        const details = {
          title: '',
          author: '',
          isbn: '',
          language: '',
          fileSize: '',
          fileType: '',
          description: '',
          downloadLinks: []
        };

        // Extract title
        const titleEl = document.querySelector('h1');
        if (titleEl) details.title = titleEl.textContent.trim();

        // Extract metadata
        const metadataRows = document.querySelectorAll('tr');
        metadataRows.forEach(row => {
          const label = row.querySelector('td')?.textContent.trim().toLowerCase();
          const value = row.querySelector('td:last-child')?.textContent.trim();
          
          if (label && value) {
            if (label.includes('author')) details.author = value;
            else if (label.includes('isbn')) details.isbn = value;
            else if (label.includes('language')) details.language = value;
            else if (label.includes('filesize')) details.fileSize = value;
            else if (label.includes('extension')) details.fileType = value;
          }
        });

        // Extract description
        const descEl = document.querySelector('.js-md5-description');
        if (descEl) details.description = descEl.textContent.trim();

        // Extract download links
        const downloadSections = document.querySelectorAll('.js-download-link');
        downloadSections.forEach(section => {
          const link = section.querySelector('a');
          if (link) {
            details.downloadLinks.push({
              url: link.href,
              text: link.textContent.trim(),
              source: link.href.includes('libgen') ? 'libgen' : 
                     link.href.includes('ipfs') ? 'ipfs' : 'other'
            });
          }
        });

        return details;
      });

      logger.info(`Extracted details for: ${bookDetails.title}`);
      return bookDetails;

    } catch (error) {
      logger.error('Failed to get book details:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async getDirectDownloadLink(downloadPageUrl) {
    await this.ensureBrowser();
    const page = await this.browser.newPage();
    
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      await page.goto(downloadPageUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Handle different download sources
      let directLink = null;

      // LibGen download
      if (downloadPageUrl.includes('libgen')) {
        await page.waitForSelector('a[href*="get.php"]', { timeout: 5000 });
        directLink = await page.evaluate(() => {
          const link = document.querySelector('a[href*="get.php"]');
          return link ? link.href : null;
        });
      }
      // IPFS download
      else if (downloadPageUrl.includes('ipfs')) {
        directLink = await page.evaluate(() => {
          const link = document.querySelector('a[href*="cloudflare-ipfs.com"]');
          return link ? link.href : null;
        });
      }

      return directLink;

    } catch (error) {
      logger.error('Failed to get direct download link:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}

module.exports = Scraper;