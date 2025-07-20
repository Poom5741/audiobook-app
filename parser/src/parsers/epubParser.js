const EPub = require('epub2').EPub;
const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

function parseEPUB(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const epub = new EPub(filePath);
      
      epub.on('error', (error) => {
        logger.error('EPUB parsing error:', error);
        reject(new Error(`Failed to parse EPUB: ${error.message}`));
      });

      epub.on('end', async () => {
        try {
          // Extract metadata
          const metadata = {
            title: epub.metadata.title || null,
            author: epub.metadata.creator || null,
            publisher: epub.metadata.publisher || null,
            language: epub.metadata.language || null,
            description: epub.metadata.description || null,
            isbn: epub.metadata.ISBN || null,
            publishDate: epub.metadata.date || null,
            rights: epub.metadata.rights || null
          };

          // Clean up metadata
          Object.keys(metadata).forEach(key => {
            if (metadata[key] === null || metadata[key] === '') {
              delete metadata[key];
            }
          });

          // Extract chapters with text
          const chapters = [];
          let fullText = '';

          // Get chapter list from TOC
          const toc = epub.toc || [];
          
          // Process each chapter
          for (let i = 0; i < epub.spine.contents.length; i++) {
            const spineItem = epub.spine.contents[i];
            const chapterId = spineItem.id;
            
            try {
              const chapterHtml = await new Promise((resolve, reject) => {
                epub.getChapter(chapterId, (error, text) => {
                  if (error) reject(error);
                  else resolve(text);
                });
              });

              // Parse HTML and extract text
              const $ = cheerio.load(chapterHtml);
              
              // Remove script and style elements
              $('script, style, nav').remove();
              
              // Extract clean text
              const chapterText = $('body').text()
                .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
                .replace(/\n\s*\n/g, '\n\n') // Replace multiple newlines with double newline
                .trim();

              if (chapterText.length > 0) {
                // Find matching TOC entry
                const tocEntry = toc.find(t => t.id === chapterId) || {};
                
                chapters.push({
                  id: chapterId,
                  title: tocEntry.title || `Chapter ${i + 1}`,
                  order: i,
                  text: chapterText,
                  wordCount: chapterText.split(/\s+/).length,
                  href: spineItem.href
                });

                fullText += chapterText + '\n\n';
              }
            } catch (chapterError) {
              logger.warn(`Failed to extract chapter ${chapterId}:`, chapterError.message);
            }
          }

          logger.debug(`EPUB Info: ${chapters.length} chapters, ${metadata.title || 'Untitled'}`);

          resolve({
            text: fullText.trim(),
            chapters: chapters,
            metadata: metadata,
            info: {
              numChapters: chapters.length,
              spine: epub.spine.contents.map(s => ({ id: s.id, href: s.href })),
              toc: toc.map(t => ({ id: t.id, title: t.title, href: t.href })),
              textLength: fullText.length
            }
          });

        } catch (error) {
          reject(error);
        }
      });

      epub.parse();

    } catch (error) {
      reject(new Error(`Failed to initialize EPUB parser: ${error.message}`));
    }
  });
}

module.exports = { parseEPUB };