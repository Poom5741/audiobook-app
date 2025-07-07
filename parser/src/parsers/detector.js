const fs = require('fs-extra');
const fileType = require('file-type');
const { logger } = require('../utils/logger');

async function detectFileType(filePath) {
  try {
    // First try to detect by file extension
    const extension = filePath.toLowerCase().split('.').pop();
    if (extension === 'pdf') return 'pdf';
    if (extension === 'epub') return 'epub';

    // Use magic bytes detection as fallback
    const type = await fileType.fromFile(filePath);
    
    if (type) {
      if (type.mime === 'application/pdf') return 'pdf';
      if (type.mime === 'application/epub+zip') return 'epub';
    }

    // Final fallback - check file content
    const buffer = await fs.readFile(filePath, { encoding: null, flag: 'r' });
    const header = buffer.toString('utf8', 0, 100);
    
    if (header.includes('%PDF')) return 'pdf';
    if (buffer.toString('hex', 0, 4) === '504b0304') {
      // ZIP magic bytes - could be EPUB
      // Check for mimetype file characteristic of EPUB
      if (buffer.includes('application/epub+zip')) return 'epub';
    }

    throw new Error('Unable to determine file type');
  } catch (error) {
    logger.error('File type detection failed:', error);
    throw error;
  }
}

module.exports = { detectFileType };