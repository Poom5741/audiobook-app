/**
 * E2E Test: Book Search Functionality
 * Tests search across books, chapters, and metadata
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5001';

describe('E2E: Book Search Functionality', () => {
  let testBookIds = [];

  beforeAll(async () => {
    // Create test books for searching
    const testBooks = [
      {
        title: 'Trading in the Zone',
        author: 'Mark Douglas',
        description: 'Master the market with confidence',
        language: 'en',
        total_chapters: 3
      },
      {
        title: 'JavaScript Patterns',
        author: 'Stoyan Stefanov',
        description: 'Build better applications with coding and design patterns',
        language: 'en',
        total_chapters: 5
      },
      {
        title: 'Clean Code',
        author: 'Robert Martin',
        description: 'A handbook of agile software craftsmanship',
        language: 'en',
        total_chapters: 4
      }
    ];

    for (const book of testBooks) {
      try {
        const response = await axios.post(`${BASE_URL}/api/books`, book);
        testBookIds.push(response.data.id);
      } catch (error) {
        console.warn('Failed to create test book:', error.message);
      }
    }
  });

  test('should search books by title', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { q: 'Trading' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBeGreaterThan(0);
    
    const tradingBook = response.data.find(book => 
      book.title.includes('Trading')
    );
    expect(tradingBook).toBeDefined();
    expect(tradingBook.author).toBe('Mark Douglas');
  });

  test('should search books by author', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { q: 'Robert Martin' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    
    const cleanCodeBook = response.data.find(book => 
      book.author.includes('Robert Martin')
    );
    expect(cleanCodeBook).toBeDefined();
    expect(cleanCodeBook.title).toBe('Clean Code');
  });

  test('should search with case insensitive matching', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { q: 'javascript' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    
    const jsBook = response.data.find(book => 
      book.title.toLowerCase().includes('javascript')
    );
    expect(jsBook).toBeDefined();
  });

  test('should return paginated results', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { 
        q: '',
        limit: 2,
        offset: 0
      }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBeLessThanOrEqual(2);
  });

  test('should filter by language', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { 
        language: 'en'
      }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    
    response.data.forEach(book => {
      expect(book.language).toBe('en');
    });
  });

  test('should search chapters within a book', async () => {
    if (testBookIds.length === 0) {
      return; // Skip if no test books created
    }

    const bookId = testBookIds[0];
    const response = await axios.get(`${BASE_URL}/api/books/${bookId}/chapters/search`, {
      params: { q: 'chapter' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  test('should handle empty search results', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { q: 'nonexistent book title xyz123' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBe(0);
  });

  test('should handle special characters in search', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { q: 'C++ Programming' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
  });

  test('should search by partial matches', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { q: 'Code' }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    
    const matches = response.data.filter(book => 
      book.title.includes('Code') || book.description.includes('code')
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  test('should sort results by relevance', async () => {
    const response = await axios.get(`${BASE_URL}/api/books/search`, {
      params: { 
        q: 'JavaScript',
        sort: 'relevance'
      }
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    
    if (response.data.length > 1) {
      // First result should be most relevant
      const firstResult = response.data[0];
      expect(
        firstResult.title.toLowerCase().includes('javascript') ||
        firstResult.author.toLowerCase().includes('javascript') ||
        firstResult.description.toLowerCase().includes('javascript')
      ).toBe(true);
    }
  });

  afterAll(async () => {
    // Cleanup test books
    for (const bookId of testBookIds) {
      try {
        await axios.delete(`${BASE_URL}/api/books/${bookId}`);
      } catch (error) {
        console.warn('Failed to cleanup test book:', error.message);
      }
    }
  });
});