/**
 * E2E Test: File Upload to Audio Pipeline
 * Tests complete flow: Upload ’ Parse ’ TTS ’ Audio Generation
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5001';
const PARSER_URL = process.env.PARSER_URL || 'http://localhost:3002';
const TTS_URL = process.env.TTS_URL || 'http://localhost:8000';

describe('E2E: File Upload to Audio Pipeline', () => {
  let uploadedBookId;
  let chapterIds = [];

  const testFile = path.join(__dirname, 'test-samples', 'sample-book.txt');
  
  beforeAll(async () => {
    // Create test file if it doesn't exist
    if (!fs.existsSync(testFile)) {
      const testContent = `Chapter 1: The Beginning
This is the first chapter of our test book. It contains some sample text that will be converted to audio.

Chapter 2: The Middle  
This is the second chapter with more content for testing the audio conversion pipeline.

Chapter 3: The End
This is the final chapter that concludes our test book.`;
      
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, testContent);
    }
  });

  test('should upload and parse file successfully', async () => {
    const form = new FormData();
    form.append('file', fs.createReadStream(testFile));
    form.append('chunkSize', '1000');
    form.append('splitBy', 'chapter');
    form.append('saveToDb', 'true');

    const response = await axios.post(`${PARSER_URL}/parse/upload`, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('bookId');
    expect(response.data).toHaveProperty('chapters');
    expect(response.data.chapters.length).toBeGreaterThan(0);

    uploadedBookId = response.data.bookId;
    chapterIds = response.data.chapters.map(ch => ch.id);
  });

  test('should retrieve book from backend API', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/${uploadedBookId}`);
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('id', uploadedBookId);
    expect(response.data).toHaveProperty('title');
    expect(response.data).toHaveProperty('status');
  });

  test('should queue chapters for TTS processing', async () => {
    for (const chapterId of chapterIds) {
      const response = await axios.post(`${BASE_URL}/api/tts/queue`, {
        chapterId,
        priority: 1
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('jobId');
    }
  });

  test('should process TTS jobs and generate audio', async () => {
    // Wait for TTS processing (with timeout)
    const maxWaitTime = 60000; // 1 minute
    const pollInterval = 2000; // 2 seconds
    let waitTime = 0;

    while (waitTime < maxWaitTime) {
      const response = await axios.get(`${BASE_URL}/api/books/${uploadedBookId}/progress`);
      
      if (response.data.completedChapters > 0) {
        expect(response.data.completedChapters).toBeGreaterThan(0);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waitTime += pollInterval;
    }

    expect(waitTime).toBeLessThan(maxWaitTime);
  });

  test('should serve generated audio files', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/${uploadedBookId}/chapters`);
    
    expect(response.status).toBe(200);
    expect(response.data.length).toBeGreaterThan(0);

    // Test first chapter audio
    const chapter = response.data.find(ch => ch.audio_path);
    expect(chapter).toBeDefined();

    const audioResponse = await axios.get(`${BASE_URL}${chapter.audio_path}`, {
      responseType: 'stream'
    });
    
    expect(audioResponse.status).toBe(200);
    expect(audioResponse.headers['content-type']).toMatch(/audio/);
  });

  afterAll(async () => {
    // Cleanup test files
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
    
    // Cleanup uploaded books (optional)
    if (uploadedBookId) {
      try {
        await axios.delete(`${BASE_URL}/api/books/${uploadedBookId}`);
      } catch (error) {
        console.warn('Failed to cleanup test book:', error.message);
      }
    }
  });
});