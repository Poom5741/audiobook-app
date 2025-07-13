require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { 
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors
} = require('../shared/logger');

// Logger setup
const logger = createLogger('parser-service');
const auditLogger = createAuditLogger('parser-service');
const metricsLogger = createMetricsLogger('parser-service');

// Setup unhandled error logging
logUnhandledErrors('parser-service');
const { detectFileType } = require('./parsers/detector');
const { parsePDF } = require('./parsers/pdfParser');
const { parseEPUB } = require('./parsers/epubParser');
const { cleanText } = require('./processors/textCleaner');
const { splitIntoChapters } = require('./processors/chapterSplitter');
const { generateBookSlug } = require('./utils/fileUtils');
const { saveChaptersToDB, getParsingStats } = require('./services/databaseService');

const app = express();
const PORT = process.env.PORT || 3002;

// Configure multer for file uploads
const upload = multer({
  dest: './temp-uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/epub+zip' ||
        file.originalname.toLowerCase().endsWith('.epub')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and EPUB files are allowed'));
    }
  }
});

// Request ID middleware (should be first)
app.use(addRequestId);

// Middleware
app.use(cors());
app.use(createExpressLogger('parser-service'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'parser' });
});

// Parse uploaded file
app.post('/api/parse/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const options = {
      chunkSize: parseInt(req.body.chunkSize) || 1500,
      splitBy: req.body.splitBy || 'both',
      saveToDb: req.body.saveToDb === 'true'
    };

    const result = await processFile(req.file.path, req.file.originalname, options);
    
    // Clean up temp file
    await fs.remove(req.file.path);

    res.json(result);

  } catch (error) {
    logger.error('Upload parsing failed:', error);
    
    // Clean up temp file on error
    if (req.file) {
      await fs.remove(req.file.path).catch(() => {});
    }
    
    res.status(500).json({ error: 'Parsing failed', message: error.message });
  }
});

// Parse file by path
app.post('/api/parse/file', async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = path.basename(filePath);
    const result = await processFile(filePath, filename, options);

    res.json(result);

  } catch (error) {
    logger.error('File parsing failed:', error);
    res.status(500).json({ error: 'Parsing failed', message: error.message });
  }
});

// Get parsing statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getParsingStats();
    res.json(stats);
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics', message: error.message });
  }
});

// List parsed books
app.get('/api/books', async (req, res) => {
  try {
    const outputDir = './parser/output';
    
    if (!await fs.pathExists(outputDir)) {
      return res.json([]);
    }

    const books = [];
    const directories = await fs.readdir(outputDir, { withFileTypes: true });

    for (const dir of directories) {
      if (dir.isDirectory()) {
        const metadataPath = path.join(outputDir, dir.name, 'metadata.json');
        
        if (await fs.pathExists(metadataPath)) {
          const metadata = await fs.readJson(metadataPath);
          books.push({
            slug: dir.name,
            ...metadata
          });
        }
      }
    }

    res.json(books);

  } catch (error) {
    logger.error('List books error:', error);
    res.status(500).json({ error: 'Failed to list books', message: error.message });
  }
});

// Get book chapters
app.get('/api/books/:slug/chapters', async (req, res) => {
  try {
    const { slug } = req.params;
    const bookDir = path.join('./parser/output', slug);

    if (!await fs.pathExists(bookDir)) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const files = await fs.readdir(bookDir);
    const chapterFiles = files.filter(f => f.startsWith('chapter-') && f.endsWith('.txt'));
    
    const chapters = [];
    
    for (const file of chapterFiles) {
      const chapterPath = path.join(bookDir, file);
      const content = await fs.readFile(chapterPath, 'utf8');
      
      // Parse chapter header
      const lines = content.split('\n');
      const title = lines.find(l => l.startsWith('Title:'))?.replace('Title:', '').trim();
      const words = lines.find(l => l.startsWith('Words:'))?.replace('Words:', '').trim();
      
      const textStart = lines.findIndex(l => l === '---') + 2;
      const text = lines.slice(textStart).join('\n').trim();

      chapters.push({
        file,
        title,
        wordCount: parseInt(words) || 0,
        text: text.substring(0, 200) + '...', // Preview
        fullText: text
      });
    }

    res.json(chapters);

  } catch (error) {
    logger.error('Get chapters error:', error);
    res.status(500).json({ error: 'Failed to get chapters', message: error.message });
  }
});

// Core processing function
async function processFile(filePath, filename, options = {}) {
  const {
    chunkSize = 1500,
    splitBy = 'both',
    saveToDb = false
  } = options;

  logger.info(`Processing: ${filename}`);

  // Detect file type
  const fileType = await detectFileType(filePath);
  logger.info(`Detected file type: ${fileType}`);

  // Extract text
  let extractedData;
  if (fileType === 'pdf') {
    extractedData = await parsePDF(filePath);
  } else if (fileType === 'epub') {
    extractedData = await parseEPUB(filePath);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }

  // Clean text
  const cleanedData = {
    ...extractedData,
    text: cleanText(extractedData.text),
    metadata: extractedData.metadata || {}
  };

  // Generate book slug
  const bookSlug = generateBookSlug(
    cleanedData.metadata.title || path.parse(filename).name,
    cleanedData.metadata.author
  );

  // Split into chapters
  const chapters = await splitIntoChapters(cleanedData, {
    method: splitBy,
    chunkSize: parseInt(chunkSize),
    detectChapters: true
  });

  // Save to output directory
  const outputDir = path.join('./parser/output', bookSlug);
  await fs.ensureDir(outputDir);

  // Save chapters to files
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterFile = path.join(outputDir, `chapter-${i + 1}.txt`);
    
    const content = [
      `Title: ${chapter.title || `Chapter ${i + 1}`}`,
      `Words: ${chapter.wordCount}`,
      `Characters: ${chapter.text.length}`,
      '---',
      '',
      chapter.text
    ].join('\n');

    await fs.writeFile(chapterFile, content, 'utf8');
  }

  // Save metadata
  const metadata = {
    title: cleanedData.metadata.title || path.parse(filename).name,
    author: cleanedData.metadata.author || 'Unknown',
    source: filePath,
    fileType: fileType,
    totalChapters: chapters.length,
    totalWords: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    processedAt: new Date().toISOString(),
    chapters: chapters.map((ch, i) => ({
      number: i + 1,
      title: ch.title || `Chapter ${i + 1}`,
      wordCount: ch.wordCount
    }))
  };

  await fs.writeJson(path.join(outputDir, 'metadata.json'), metadata, { spaces: 2 });

  // Optionally save to database
  let bookId = null;
  if (saveToDb) {
    try {
      bookId = await saveChaptersToDB({
        filePath,
        bookSlug,
        metadata: cleanedData.metadata,
        chapters
      });
    } catch (dbError) {
      logger.error('Database save failed:', dbError.message);
    }
  }

  return {
    success: true,
    bookSlug,
    outputDir,
    metadata,
    chaptersCount: chapters.length,
    bookId
  };
}

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Parser service running on port ${PORT}`);
});