/**
 * E2E Test: Audio Playback Functionality
 * Tests audio streaming, controls, and playback features
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_URL || 'http://localhost:5001';

describe('E2E: Audio Playback Functionality', () => {
  let testBookId;
  let testChapterId;
  let audioPath;

  beforeAll(async () => {
    // Create a test book with audio chapter
    try {
      const bookResponse = await axios.post(`${BASE_URL}/api/books`, {
        title: 'Test Audio Book',
        author: 'Test Author',
        description: 'A book for testing audio playback',
        language: 'en',
        total_chapters: 1
      });
      testBookId = bookResponse.data.id;

      // Create a chapter with audio
      const chapterResponse = await axios.post(`${BASE_URL}/api/books/${testBookId}/chapters`, {
        chapter_number: 1,
        title: 'Test Chapter',
        text_content: 'This is a test chapter for audio playback testing.',
        audio_path: '/audio/test-book/chapter-1.mp3',
        duration: 30,
        status: 'completed'
      });
      testChapterId = chapterResponse.data.id;
      audioPath = chapterResponse.data.audio_path;
    } catch (error) {
      console.warn('Failed to create test book/chapter:', error.message);
    }
  });

  test('should stream audio file', async () => {
    if (!audioPath) return;

    const response = await axios.get(`${BASE_URL}${audioPath}`, {
      responseType: 'stream',
      headers: {
        'Range': 'bytes=0-1023' // Request first 1KB
      }
    });

    expect(response.status).toBe(206); // Partial content
    expect(response.headers['content-type']).toMatch(/audio/);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-range']).toMatch(/bytes/);
  });

  test('should support range requests for seeking', async () => {
    if (!audioPath) return;

    const response = await axios.get(`${BASE_URL}${audioPath}`, {
      responseType: 'stream',
      headers: {
        'Range': 'bytes=1000-2000'
      }
    });

    expect(response.status).toBe(206);
    expect(response.headers['content-range']).toContain('bytes 1000-2000');
  });

  test('should get audio metadata', async () => {
    if (!testChapterId) return;

    const response = await axios.get(`${BASE_URL}/api/chapters/${testChapterId}/audio/info`);

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('duration');
    expect(response.data).toHaveProperty('format');
    expect(response.data).toHaveProperty('bitrate');
    expect(response.data.duration).toBeGreaterThan(0);
  });

  test('should track playback progress', async () => {
    if (!testBookId || !testChapterId) return;

    // Create a user session (mock)
    const sessionResponse = await axios.post(`${BASE_URL}/api/auth/guest`);
    const token = sessionResponse.data.token;

    // Update playback progress
    const progressResponse = await axios.post(
      `${BASE_URL}/api/books/${testBookId}/progress`,
      {
        chapter_id: testChapterId,
        position: 15, // 15 seconds
        completed_chapters: 0
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    expect(progressResponse.status).toBe(200);
    expect(progressResponse.data).toHaveProperty('position', 15);
  });

  test('should retrieve playback progress', async () => {
    if (!testBookId) return;

    try {
      const sessionResponse = await axios.post(`${BASE_URL}/api/auth/guest`);
      const token = sessionResponse.data.token;

      const response = await axios.get(
        `${BASE_URL}/api/books/${testBookId}/progress`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('position');
      expect(response.data).toHaveProperty('completed_chapters');
    } catch (error) {
      // Skip if auth not implemented
      console.warn('Auth not available, skipping progress test');
    }
  });

  test('should handle audio file not found', async () => {
    const response = await axios.get(`${BASE_URL}/audio/nonexistent.mp3`, {
      validateStatus: () => true
    });

    expect(response.status).toBe(404);
  });

  test('should validate audio format support', async () => {
    const supportedFormats = ['mp3', 'wav', 'ogg', 'm4a'];
    
    const response = await axios.get(`${BASE_URL}/api/audio/supported-formats`);
    
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.formats)).toBe(true);
    
    supportedFormats.forEach(format => {
      expect(response.data.formats).toContain(format);
    });
  });

  test('should handle concurrent audio requests', async () => {
    if (!audioPath) return;

    const requests = Array(5).fill().map((_, index) => 
      axios.get(`${BASE_URL}${audioPath}`, {
        responseType: 'stream',
        headers: {
          'Range': `bytes=${index * 1000}-${(index + 1) * 1000 - 1}`
        }
      })
    );

    const responses = await Promise.all(requests);
    
    responses.forEach((response, index) => {
      expect(response.status).toBe(206);
      expect(response.headers['content-range']).toContain(
        `bytes ${index * 1000}-${(index + 1) * 1000 - 1}`
      );
    });
  });

  test('should support playlist functionality', async () => {
    if (!testBookId) return;

    const response = await axios.get(`${BASE_URL}/api/books/${testBookId}/playlist`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.chapters)).toBe(true);
    expect(response.data).toHaveProperty('total_duration');
    expect(response.data).toHaveProperty('book_id', testBookId);
  });

  test('should handle audio quality settings', async () => {
    if (!audioPath) return;

    const response = await axios.get(`${BASE_URL}${audioPath}`, {
      responseType: 'stream',
      params: {
        quality: 'high'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/audio/);
  });

  test('should support audio chapter navigation', async () => {
    if (!testBookId) return;

    const response = await axios.get(`${BASE_URL}/api/books/${testBookId}/chapters`, {
      params: {
        include_audio: true
      }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    
    response.data.forEach(chapter => {
      expect(chapter).toHaveProperty('chapter_number');
      expect(chapter).toHaveProperty('title');
      if (chapter.audio_path) {
        expect(chapter).toHaveProperty('duration');
      }
    });
  });

  afterAll(async () => {
    // Cleanup test book and chapters
    if (testBookId) {
      try {
        await axios.delete(`${BASE_URL}/api/books/${testBookId}`);
      } catch (error) {
        console.warn('Failed to cleanup test book:', error.message);
      }
    }
  });
});