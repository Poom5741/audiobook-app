#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs-extra');
const { logger } = require('./utils/logger');
const { detectFileType } = require('./parsers/detector');
const { parsePDF } = require('./parsers/pdfParser');
const { parseEPUB } = require('./parsers/epubParser');
const { cleanText } = require('./processors/textCleaner');
const { splitIntoChapters } = require('./processors/chapterSplitter');
const { generateBookSlug } = require('./utils/fileUtils');
const { saveChaptersToDB } = require('./services/databaseService');

program
  .name('audiobook-parser')
  .description('Extract and split text from PDF/EPUB files for TTS processing')
  .version('1.0.0');

program
  .argument('<file>', 'Path to PDF or EPUB file')
  .option('-o, --output <dir>', 'Output directory', './parser/output')
  .option('-c, --chunk-size <words>', 'Words per chunk', '1500')
  .option('-s, --split-by <method>', 'Split method: chapters|chunks|both', 'both')
  .option('--save-db', 'Save chapters to database', false)
  .option('--verbose', 'Verbose logging', false)
  .action(async (filePath, options) => {
    try {
      if (options.verbose) {
        logger.level = 'debug';
      }

      // Validate input file
      if (!await fs.pathExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileInfo = path.parse(filePath);
      logger.info(`Processing: ${fileInfo.base}`);

      // Detect file type
      const fileType = await detectFileType(filePath);
      logger.info(`Detected file type: ${fileType}`);

      // Extract text based on file type
      let extractedData;
      if (fileType === 'pdf') {
        extractedData = await parsePDF(filePath);
      } else if (fileType === 'epub') {
        extractedData = await parseEPUB(filePath);
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      logger.info(`Extracted ${extractedData.pages?.length || extractedData.chapters?.length} sections`);

      // Clean extracted text
      const cleanedData = {
        ...extractedData,
        text: cleanText(extractedData.text),
        metadata: extractedData.metadata || {}
      };

      // Generate book slug
      const bookSlug = generateBookSlug(
        cleanedData.metadata.title || fileInfo.name,
        cleanedData.metadata.author
      );

      // Split into chapters
      const chapters = await splitIntoChapters(cleanedData, {
        method: options.splitBy,
        chunkSize: parseInt(options.chunkSize),
        detectChapters: true
      });

      logger.info(`Split into ${chapters.length} chapters`);

      // Create output directory
      const outputDir = path.join(options.output, bookSlug);
      await fs.ensureDir(outputDir);

      // Save chapters to files
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        const chapterFile = path.join(outputDir, `chapter-${i + 1}.txt`);
        
        // Create chapter header
        const content = [
          `Title: ${chapter.title || `Chapter ${i + 1}`}`,
          `Words: ${chapter.wordCount}`,
          `Characters: ${chapter.text.length}`,
          '---',
          '',
          chapter.text
        ].join('\n');

        await fs.writeFile(chapterFile, content, 'utf8');
        logger.debug(`Saved: ${chapterFile}`);
      }

      // Save metadata
      const metadataFile = path.join(outputDir, 'metadata.json');
      await fs.writeJson(metadataFile, {
        title: cleanedData.metadata.title || fileInfo.name,
        author: cleanedData.metadata.author || 'Unknown',
        source: filePath,
        fileType: fileType,
        totalChapters: chapters.length,
        totalWords: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
        processedAt: new Date().toISOString(),
        chapters: chapters.map((ch, i) => ({
          number: i + 1,
          title: ch.title || `Chapter ${i + 1}`,
          wordCount: ch.wordCount,
          startOffset: ch.startOffset,
          endOffset: ch.endOffset
        }))
      }, { spaces: 2 });

      logger.info(`✅ Successfully parsed ${fileInfo.base}`);
      logger.info(`📁 Output saved to: ${outputDir}`);
      logger.info(`📊 Total chapters: ${chapters.length}`);

      // Optionally save to database
      if (options.saveDb) {
        try {
          await saveChaptersToDB({
            filePath,
            bookSlug,
            metadata: cleanedData.metadata,
            chapters
          });
          logger.info('💾 Saved to database');
        } catch (dbError) {
          logger.error('Database save failed:', dbError.message);
        }
      }

    } catch (error) {
      logger.error('❌ Parsing failed:', error.message);
      process.exit(1);
    }
  });

program.parse();

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});