/**
 * Text Preparation Utilities
 * Cleans and prepares text for AI summarization
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

/**
 * Clean text for better summarization
 * @param {string} text - Raw text input
 * @returns {string} - Cleaned text
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove special characters but keep punctuation
    .replace(/[^\w\s.,!?;:'"()\-–—]/g, '')
    // Fix common OCR/parsing errors
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([.!?])\s*([a-z])/g, '$1 $2')
    // Remove page numbers and headers/footers patterns
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/^(Chapter|CHAPTER)\s+\d+.*$/gm, '')
    // Clean up quotes
    .replace(/[""]([^"""]*?)[""]?/g, '"$1"')
    .replace(/['']([^'']*?)['']?/g, "'$1'")
    .trim();
}

/**
 * Split text into manageable chunks for AI processing
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum size per chunk (characters)
 * @returns {Array<string>} - Array of text chunks
 */
function splitIntoChunks(text, maxChunkSize = 4000) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    // If adding this sentence would exceed the limit
    if (currentChunk.length + sentence.length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // If single sentence is too long, force split
        chunks.push(sentence.substring(0, maxChunkSize));
        currentChunk = sentence.substring(maxChunkSize);
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk.length > 50); // Filter out tiny chunks
}

/**
 * Extract key structural elements from text
 * @param {string} text - Input text
 * @returns {Object} - Extracted elements
 */
function extractStructure(text) {
  const structure = {
    headings: [],
    bulletPoints: [],
    quotes: [],
    numbers: [],
    keyPhrases: []
  };

  // Extract headings (lines that look like titles)
  const lines = text.split('\n');
  structure.headings = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && 
           trimmed.length < 100 && 
           (trimmed.match(/^[A-Z][^.!?]*$/) || 
            trimmed.match(/^\d+\.?\s+[A-Z]/));
  });

  // Extract bullet points and lists
  structure.bulletPoints = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed.match(/^[•·▪▫◦‣⁃-]\s+/) || 
           trimmed.match(/^\d+\.\s+/) ||
           trimmed.match(/^[a-z]\)\s+/);
  });

  // Extract quotes
  structure.quotes = text.match(/"[^"]{20,200}"/g) || [];

  // Extract numbers and statistics
  structure.numbers = text.match(/\d+%|\$\d+|\d+,\d+|\d+\.\d+/g) || [];

  // Extract key phrases (capitalized terms, terms in quotes)
  structure.keyPhrases = [
    ...(text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || []),
    ...(text.match(/"[^"]{3,30}"/g) || [])
  ].filter(phrase => phrase.length > 3);

  return structure;
}

/**
 * Analyze text to determine optimal summarization strategy
 * @param {string} text - Input text
 * @returns {Object} - Analysis results
 */
function analyzeText(text) {
  const wordCount = text.split(/\s+/).length;
  const sentenceCount = text.split(/[.!?]+/).length;
  const avgSentenceLength = wordCount / sentenceCount;
  
  const structure = extractStructure(text);
  
  // Determine content type
  let contentType = 'general';
  if (structure.bulletPoints.length > 5) contentType = 'instructional';
  if (structure.numbers.length > 10) contentType = 'analytical';
  if (structure.quotes.length > 3) contentType = 'narrative';
  if (text.match(/\b(step|method|process|procedure)\b/gi)) contentType = 'howto';
  
  // Calculate complexity
  const complexity = avgSentenceLength > 20 ? 'high' : 
                    avgSentenceLength > 15 ? 'medium' : 'low';
  
  return {
    wordCount,
    sentenceCount,
    avgSentenceLength,
    contentType,
    complexity,
    structure,
    estimatedReadingTime: Math.ceil(wordCount / 200), // minutes
    recommendedSummaryLength: Math.max(100, Math.min(1000, wordCount * 0.1))
  };
}

/**
 * Prepare text for specific summarization styles
 * @param {string} text - Input text
 * @param {string} style - Summarization style ('concise', 'detailed', 'bullets', 'key-points')
 * @returns {Object} - Prepared text and instructions
 */
function prepareForStyle(text, style = 'concise') {
  const analysis = analyzeText(text);
  const cleanedText = cleanText(text);
  
  const styleInstructions = {
    concise: {
      instruction: "Summarize the key points in 2-3 concise paragraphs, focusing on main ideas and practical takeaways.",
      targetLength: Math.min(500, analysis.recommendedSummaryLength),
      preserveStructure: false
    },
    detailed: {
      instruction: "Provide a comprehensive summary that preserves important details, examples, and context while removing redundancy.",
      targetLength: Math.min(1200, analysis.recommendedSummaryLength * 2),
      preserveStructure: true
    },
    bullets: {
      instruction: "Extract the key points as a bulleted list with clear, actionable items.",
      targetLength: Math.min(800, analysis.recommendedSummaryLength * 1.5),
      preserveStructure: false
    },
    'key-points': {
      instruction: "Identify and explain the most important concepts, insights, and takeaways.",
      targetLength: Math.min(600, analysis.recommendedSummaryLength * 1.2),
      preserveStructure: true
    }
  };

  return {
    text: cleanedText,
    analysis,
    style: styleInstructions[style] || styleInstructions.concise,
    chunks: cleanedText.length > 4000 ? splitIntoChunks(cleanedText) : [cleanedText]
  };
}

module.exports = {
  cleanText,
  splitIntoChunks,
  extractStructure,
  analyzeText,
  prepareForStyle
};