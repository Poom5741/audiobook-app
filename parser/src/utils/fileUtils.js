const slug = require('slug');
const path = require('path');

function generateBookSlug(title, author) {
  let slugText = '';
  
  if (author) {
    slugText = `${author} - ${title}`;
  } else {
    slugText = title;
  }
  
  return slug(slugText, {
    lower: true,
    remove: /[*+~.()'"!:@]/g,
    replacement: '-'
  });
}

function sanitizeFileName(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getBookInfo(filePath) {
  const parsed = path.parse(filePath);
  return {
    filename: parsed.name,
    extension: parsed.ext.toLowerCase(),
    directory: parsed.dir,
    fullPath: filePath
  };
}

function calculateReadingTime(wordCount, wordsPerMinute = 200) {
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

module.exports = {
  generateBookSlug,
  sanitizeFileName,
  getBookInfo,
  calculateReadingTime,
  formatFileSize
};