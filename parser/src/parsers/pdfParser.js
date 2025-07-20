const fs = require('fs-extra');
const pdfParse = require('pdf-parse');
const { logger } = require('../utils/logger');

async function parsePDF(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer, {
      // Options for better text extraction
      max: 0, // Parse all pages
      version: 'v2.0.550'
    });

    logger.debug(`PDF Info: ${data.numpages} pages, ${data.info.Title || 'Untitled'}`);

    // Extract metadata
    const metadata = {
      title: data.info.Title || null,
      author: data.info.Author || null,
      subject: data.info.Subject || null,
      keywords: data.info.Keywords || null,
      creator: data.info.Creator || null,
      producer: data.info.Producer || null,
      creationDate: data.info.CreationDate || null,
      modificationDate: data.info.ModDate || null,
      pages: data.numpages,
      version: data.version
    };

    // Clean up metadata
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === null || metadata[key] === '') {
        delete metadata[key];
      }
    });

    return {
      text: data.text,
      metadata: metadata,
      info: {
        numPages: data.numpages,
        numRender: data.numrender,
        textLength: data.text.length
      }
    };

  } catch (error) {
    logger.error('PDF parsing failed:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

module.exports = { parsePDF };