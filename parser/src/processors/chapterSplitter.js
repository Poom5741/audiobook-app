const natural = require('natural');
const { logger } = require('../utils/logger');

const CHAPTER_PATTERNS = [
  /^(Chapter|CHAPTER|Ch\.|CH\.)?\s*\d+/i,
  /^(Part|PART|Section|SECTION)\s+\d+/i,
  /^(Chapter|CHAPTER)\s+(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)/i,
  /^[IVX]+\.\s+/,  // Roman numerals
  /^(Prologue|Epilogue|Preface|Introduction|Foreword)/i
];

async function splitIntoChapters(data, options = {}) {
  const {
    method = 'both',
    chunkSize = 1500,
    detectChapters = true,
    minChapterWords = 100,
    maxChapterWords = 10000
  } = options;

  let chapters = [];

  // For EPUB, we might already have chapters
  if (data.chapters && data.chapters.length > 0 && method !== 'chunks') {
    chapters = data.chapters.map((ch, idx) => ({
      title: ch.title,
      text: ch.text,
      wordCount: ch.wordCount || ch.text.split(/\s+/).length,
      number: idx + 1,
      startOffset: 0,
      endOffset: ch.text.length,
      source: 'epub'
    }));
    
    logger.info(`Using ${chapters.length} existing EPUB chapters`);
  }

  // For PDF or when we need to detect chapters
  if (chapters.length === 0 && detectChapters && method !== 'chunks') {
    chapters = detectChapterBoundaries(data.text);
    logger.info(`Detected ${chapters.length} chapters from text patterns`);
  }

  // If no chapters detected or method is 'chunks', split by word count
  if (chapters.length === 0 || method === 'chunks') {
    chapters = splitByWordCount(data.text, chunkSize);
    logger.info(`Split into ${chapters.length} chunks of ~${chunkSize} words`);
  }

  // If method is 'both', further split large chapters
  if (method === 'both') {
    chapters = chapters.flatMap((chapter, idx) => {
      if (chapter.wordCount > maxChapterWords) {
        const subChapters = splitByWordCount(chapter.text, chunkSize);
        return subChapters.map((sub, subIdx) => ({
          ...sub,
          title: `${chapter.title} - Part ${subIdx + 1}`,
          parentChapter: idx + 1
        }));
      }
      return chapter;
    });
  }

  // Filter out chapters that are too small
  chapters = chapters.filter(ch => ch.wordCount >= minChapterWords);

  // Renumber chapters
  chapters = chapters.map((ch, idx) => ({
    ...ch,
    number: idx + 1
  }));

  return chapters;
}

function detectChapterBoundaries(text) {
  const lines = text.split('\n');
  const chapters = [];
  let currentChapter = null;
  let currentText = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this line matches a chapter pattern
    let isChapterStart = false;
    let chapterTitle = line;

    for (const pattern of CHAPTER_PATTERNS) {
      if (pattern.test(line)) {
        isChapterStart = true;
        
        // Try to get the next line as part of the title if current line is short
        if (line.length < 30 && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.length > 0 && !CHAPTER_PATTERNS.some(p => p.test(nextLine))) {
            chapterTitle = `${line} ${nextLine}`;
            i++; // Skip the next line
          }
        }
        break;
      }
    }

    if (isChapterStart) {
      // Save previous chapter if exists
      if (currentChapter) {
        const text = currentText.join('\n').trim();
        if (text.length > 0) {
          chapters.push({
            title: currentChapter,
            text: text,
            wordCount: text.split(/\s+/).length,
            startOffset: 0,
            endOffset: text.length
          });
        }
      }

      // Start new chapter
      currentChapter = chapterTitle;
      currentText = [];
    } else if (line.length > 0) {
      currentText.push(line);
    }
  }

  // Save last chapter
  if (currentChapter && currentText.length > 0) {
    const text = currentText.join('\n').trim();
    chapters.push({
      title: currentChapter,
      text: text,
      wordCount: text.split(/\s+/).length,
      startOffset: 0,
      endOffset: text.length
    });
  }

  // If no chapters detected, return empty array
  if (chapters.length === 0) {
    return [];
  }

  return chapters;
}

function splitByWordCount(text, targetWordCount) {
  const sentences = splitIntoSentences(text);
  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).length;

    // Check if adding this sentence would exceed the target
    if (currentWordCount + sentenceWords > targetWordCount * 1.2 && currentChunk.length > 0) {
      // Save current chunk
      const chunkText = currentChunk.join(' ').trim();
      chunks.push({
        title: `Section ${chunks.length + 1}`,
        text: chunkText,
        wordCount: currentWordCount,
        startOffset: 0,
        endOffset: chunkText.length
      });

      // Start new chunk
      currentChunk = [sentence];
      currentWordCount = sentenceWords;
    } else {
      currentChunk.push(sentence);
      currentWordCount += sentenceWords;
    }
  }

  // Save last chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ').trim();
    chunks.push({
      title: `Section ${chunks.length + 1}`,
      text: chunkText,
      wordCount: currentWordCount,
      startOffset: 0,
      endOffset: chunkText.length
    });
  }

  return chunks;
}

function splitIntoSentences(text) {
  // Use natural NLP library for better sentence tokenization
  const tokenizer = new natural.SentenceTokenizer();
  const sentences = tokenizer.tokenize(text);
  
  // Clean up sentences
  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

module.exports = { splitIntoChapters, detectChapterBoundaries, splitByWordCount };