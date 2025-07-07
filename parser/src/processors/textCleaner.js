const { logger } = require('../utils/logger');

function cleanText(text) {
  if (!text) return '';

  let cleaned = text;

  // Remove null bytes and other control characters
  cleaned = cleaned.replace(/\0/g, '');
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Fix common encoding issues
  cleaned = cleaned.replace(/â€™/g, "'");
  cleaned = cleaned.replace(/â€"/g, "—");
  cleaned = cleaned.replace(/â€œ/g, '"');
  cleaned = cleaned.replace(/â€/g, '"');
  cleaned = cleaned.replace(/â€¦/g, '...');
  cleaned = cleaned.replace(/Ã¢ÂÂ/g, "'");
  cleaned = cleaned.replace(/Ã¢ÂÂ/g, "-");

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');
  cleaned = cleaned.replace(/\t/g, ' ');
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Fix line breaks within sentences
  cleaned = cleaned.replace(/([a-z,])\n([a-z])/g, '$1 $2');

  // Remove page numbers and headers/footers (common patterns)
  cleaned = cleaned.replace(/^\d+\s*$/gm, '');
  cleaned = cleaned.replace(/^Page \d+.*$/gim, '');
  cleaned = cleaned.replace(/^\s*\d+\s*\|\s*$/gm, '');

  // Remove URLs and email addresses (optional - for cleaner TTS)
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[URL]');
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');

  // Fix quotes and apostrophes
  cleaned = cleaned.replace(/['']/g, "'");
  cleaned = cleaned.replace(/[""]/g, '"');

  // Remove references like [1], [2], etc. (optional)
  cleaned = cleaned.replace(/\[\d+\]/g, '');

  // Normalize ellipsis
  cleaned = cleaned.replace(/\.{3,}/g, '...');

  // Trim lines
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

  // Remove empty lines at start and end
  cleaned = cleaned.trim();

  const originalLength = text.length;
  const cleanedLength = cleaned.length;
  const reduction = ((originalLength - cleanedLength) / originalLength * 100).toFixed(1);
  
  logger.debug(`Text cleaned: ${originalLength} → ${cleanedLength} chars (${reduction}% reduction)`);

  return cleaned;
}

function normalizeForTTS(text) {
  if (!text) return '';

  let normalized = text;

  // Expand common abbreviations
  normalized = normalized.replace(/\bDr\./g, 'Doctor');
  normalized = normalized.replace(/\bMr\./g, 'Mister');
  normalized = normalized.replace(/\bMrs\./g, 'Missus');
  normalized = normalized.replace(/\bMs\./g, 'Miss');
  normalized = normalized.replace(/\betc\./g, 'et cetera');
  normalized = normalized.replace(/\bi\.e\./g, 'that is');
  normalized = normalized.replace(/\be\.g\./g, 'for example');

  // Replace symbols with words
  normalized = normalized.replace(/&/g, ' and ');
  normalized = normalized.replace(/%/g, ' percent');
  normalized = normalized.replace(/\$/g, ' dollars ');
  normalized = normalized.replace(/€/g, ' euros ');
  normalized = normalized.replace(/£/g, ' pounds ');

  // Remove or replace problematic characters for TTS
  normalized = normalized.replace(/[•·▪▫◦‣⁃]/g, '');
  normalized = normalized.replace(/[←→↑↓]/g, '');
  normalized = normalized.replace(/[©®™]/g, '');

  return normalized;
}

module.exports = { cleanText, normalizeForTTS };