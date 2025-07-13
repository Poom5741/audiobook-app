const fs = require('fs-extra');
const path = require('path');

async function parseTXT(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const filename = path.basename(filePath);
    
    // Basic metadata extraction (can be enhanced)
    const metadata = {
      title: filename.replace('.txt', ''),
      author: 'Unknown',
      // Add more metadata extraction if needed
    };

    return {
      text,
      metadata,
    };
  } catch (error) {
    console.error('Error parsing TXT file:', error);
    throw error;
  }
}

module.exports = { parseTXT };