const { createCircuitBreaker, callService, healthCheck, getCircuitBreakerStats, serviceHelpers } = require('../utils/circuitBreaker');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock shared logger
jest.mock('../../shared/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  createMetricsLogger: jest.fn(() => ({
    logPerformance: jest.fn(),
    logBusinessMetric: jest.fn(),
    logResourceUsage: jest.fn()
  }))
}));

describe('Circuit Breaker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset circuit breakers
    const CircuitBreaker = require('opossum');
    if (CircuitBreaker.prototype.state) {
      CircuitBreaker.prototype.state = 'CLOSED';
    }
  });

  describe('createCircuitBreaker', () => {
    it('should create a circuit breaker with default config', () => {
      const breaker = createCircuitBreaker('auth');
      expect(breaker).toBeDefined();
      expect(breaker.options.timeout).toBe(3000);
    });

    it('should create a circuit breaker with custom config', () => {
      const breaker = createCircuitBreaker('auth', { timeout: 5000 });
      expect(breaker.options.timeout).toBe(5000);
    });

    it('should throw error for unknown service', () => {
      expect(() => {
        createCircuitBreaker('unknown-service');
      }).toThrow('No circuit breaker configuration found for service: unknown-service');
    });
  });

  describe('callService', () => {
    it('should successfully call service', async () => {
      const mockResponse = {
        data: { message: 'success' },
        status: 200,
        headers: {}
      };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const result = await callService('auth', {
        url: 'http://localhost:8002/health',
        method: 'GET'
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ message: 'success' });
    });

    it('should handle service failure with retry', async () => {
      const mockError = {
        response: { status: 500 },
        message: 'Service unavailable'
      };
      mockedAxios.mockRejectedValue(mockError);

      await expect(callService('auth', {
        url: 'http://localhost:8002/health',
        method: 'GET'
      }, { retries: 1 })).rejects.toThrow();
    });

    it('should not retry client errors (4xx)', async () => {
      const mockError = {
        response: { status: 404 },
        message: 'Not found'
      };
      mockedAxios.mockRejectedValue(mockError);

      await expect(callService('auth', {
        url: 'http://localhost:8002/not-found',
        method: 'GET'
      }, { retries: 3 })).rejects.toThrow();

      // Should only be called once (no retries for 4xx)
      expect(mockedAxios).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status for successful check', async () => {
      const mockResponse = {
        data: { status: 'ok' },
        status: 200,
        headers: {}
      };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const result = await healthCheck('auth', 'http://localhost:8002/health');

      expect(result.service).toBe('auth');
      expect(result.status).toBe('healthy');
      expect(result.statusCode).toBe(200);
    });

    it('should return unhealthy status for failed check', async () => {
      const mockError = {
        response: { status: 503 },
        message: 'Service unavailable'
      };
      mockedAxios.mockRejectedValue(mockError);

      const result = await healthCheck('auth', 'http://localhost:8002/health');

      expect(result.service).toBe('auth');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Service unavailable');
    });
  });

  describe('getCircuitBreakerStats', () => {
    it('should return empty stats initially', () => {
      const stats = getCircuitBreakerStats();
      expect(stats).toEqual({});
    });

    it('should return stats after creating circuit breakers', () => {
      createCircuitBreaker('auth');
      createCircuitBreaker('parser');

      const stats = getCircuitBreakerStats();
      expect(Object.keys(stats)).toContain('auth');
      expect(Object.keys(stats)).toContain('parser');
    });
  });

  describe('serviceHelpers', () => {
    describe('auth', () => {
      beforeEach(() => {
        process.env.AUTH_SERVICE_URL = 'http://localhost:8002';
      });

      it('should validate token', async () => {
        const mockResponse = {
          data: { valid: true, user: { id: '123' } },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.auth.validateToken('test-token');

        expect(result.data.valid).toBe(true);
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:8002/api/auth/verify',
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token'
            })
          })
        );
      });

      it('should refresh token', async () => {
        const mockResponse = {
          data: { accessToken: 'new-token' },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.auth.refreshToken('refresh-token');

        expect(result.data.accessToken).toBe('new-token');
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:8002/api/auth/refresh',
            method: 'POST',
            data: { refreshToken: 'refresh-token' }
          })
        );
      });
    });

    describe('tts', () => {
      beforeEach(() => {
        process.env.TTS_SERVICE_URL = 'http://localhost:8000';
      });

      it('should generate audio', async () => {
        const mockResponse = {
          data: { audio_file: 'test.mp3' },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.tts.generateAudio('Hello world', { voice: 'default' });

        expect(result.data.audio_file).toBe('test.mp3');
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:8000/synthesize',
            method: 'POST',
            data: { text: 'Hello world', voice: 'default' },
            timeout: 120000
          })
        );
      });

      it('should get voices', async () => {
        const mockResponse = {
          data: { voices: ['default', 'male', 'female'] },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.tts.getVoices();

        expect(result.data.voices).toEqual(['default', 'male', 'female']);
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:8000/voices',
            method: 'GET'
          })
        );
      });
    });

    describe('parser', () => {
      beforeEach(() => {
        process.env.PARSER_SERVICE_URL = 'http://localhost:3002';
      });

      it('should parse book', async () => {
        const mockResponse = {
          data: { jobId: '123', status: 'queued' },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const bookData = { title: 'Test Book', content: 'Test content' };
        const result = await serviceHelpers.parser.parseBook(bookData);

        expect(result.data.jobId).toBe('123');
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:3002/api/parse/upload',
            method: 'POST',
            data: bookData,
            timeout: 30000
          })
        );
      });

      it('should get parsing status', async () => {
        const mockResponse = {
          data: { jobId: '123', status: 'completed', progress: 100 },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.parser.getParsingStatus('123');

        expect(result.data.status).toBe('completed');
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:3002/api/parse/status/123',
            method: 'GET'
          })
        );
      });
    });

    describe('crawler', () => {
      beforeEach(() => {
        process.env.CRAWLER_SERVICE_URL = 'http://localhost:3001';
      });

      it('should search books', async () => {
        const mockResponse = {
          data: { books: [{ title: 'Test Book', url: 'http://example.com' }] },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.crawler.searchBooks('test query');

        expect(result.data.books).toHaveLength(1);
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:3001/api/search',
            method: 'POST',
            data: { query: 'test query' },
            timeout: 20000
          })
        );
      });

      it('should download book', async () => {
        const mockResponse = {
          data: { status: 'downloading', jobId: '456' },
          status: 200,
          headers: {}
        };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const result = await serviceHelpers.crawler.downloadBook('http://example.com/book');

        expect(result.data.jobId).toBe('456');
        expect(mockedAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:3001/api/download',
            method: 'POST',
            data: { url: 'http://example.com/book' },
            timeout: 60000
          })
        );
      });
    });
  });
});