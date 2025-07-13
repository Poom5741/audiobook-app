const request = require('supertest');
const express = require('express');
const {
  securityHeaders,
  securityLogger,
  requestSizeLimit,
  ipAccessControl,
  fileUploadSecurity,
  validateSecurityHeaders,
  getSecurityConfig
} = require('../middleware/security');

describe('Security Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Security Headers', () => {
    test('should apply CSP headers in production', () => {
      process.env.NODE_ENV = 'production';
      
      app.use(securityHeaders());
      app.get('/test', (req, res) => res.json({ status: 'ok' }));

      return request(app)
        .get('/test')
        .expect(200)
        .expect((res) => {
          expect(res.headers['content-security-policy']).toBeDefined();
          expect(res.headers['x-frame-options']).toBe('DENY');
          expect(res.headers['x-content-type-options']).toBe('nosniff');
          expect(res.headers['strict-transport-security']).toBeDefined();
        });
    });

    test('should apply development CSP in development', () => {
      process.env.NODE_ENV = 'development';
      
      app.use(securityHeaders());
      app.get('/test', (req, res) => res.json({ status: 'ok' }));

      return request(app)
        .get('/test')
        .expect(200)
        .expect((res) => {
          expect(res.headers['content-security-policy-report-only']).toBeDefined();
          expect(res.headers['x-frame-options']).toBe('DENY');
        });
    });
  });

  describe('Request Size Limiting', () => {
    let mockReq, mockRes, next;

    beforeEach(() => {
      mockReq = {
        headers: {},
        get: jest.fn((header) => {
          if (header === 'content-length') return mockReq.headers['content-length'];
          if (header === 'content-type') return mockReq.headers['content-type'];
          return undefined;
        }),
        originalUrl: '/test',
        ip: '127.0.0.1',
        requestId: 'test-req-id'
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    test('should reject requests that exceed size limit', () => {
      mockReq.headers['content-length'] = '2048'; // 2KB
      const middleware = requestSizeLimit({ maxBodySize: '1kb' });
      middleware(mockReq, mockRes, next);
      expect(next).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Request size too large',
        maxSize: '1kb'
      });
    });

    test('should allow requests within size limit', () => {
      mockReq.headers['content-length'] = '500'; // 0.5KB
      const middleware = requestSizeLimit({ maxBodySize: '1kb' });
      middleware(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should allow requests with no content-length header', () => {
      const middleware = requestSizeLimit({ maxBodySize: '1kb' });
      middleware(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should reject files exceeding size limit', () => {
      mockReq.headers['content-length'] = String(200 * 1024 * 1024); // 200MB
      mockReq.headers['content-type'] = 'multipart/form-data';
      const middleware = requestSizeLimit({ maxFileSize: '100mb' });
      middleware(mockReq, mockRes, next);
      expect(next).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Request size too large',
        maxSize: '100mb'
      });
    });
  });

  describe('IP Access Control', () => {
    let mockReq, mockRes, next;

    beforeEach(() => {
      mockReq = {
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
        originalUrl: '/test',
        get: jest.fn((header) => {
          if (header === 'User-Agent') return 'test-agent';
          return undefined;
        })
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    test('should allow whitelisted IPs', () => {
      const middleware = ipAccessControl({ whitelist: ['127.0.0.1'], enabled: true });
      middleware(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should block non-whitelisted IPs when whitelist is configured', () => {
      mockReq.ip = '192.168.1.100';
      const middleware = ipAccessControl({ whitelist: ['192.168.1.1'], enabled: true });
      middleware(mockReq, mockRes, next);
      expect(next).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    test('should block blacklisted IPs', () => {
      const middleware = ipAccessControl({ blacklist: ['127.0.0.1'], enabled: true });
      middleware(mockReq, mockRes, next);
      expect(next).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    test('should pass through when disabled', () => {
      const middleware = ipAccessControl({ blacklist: ['127.0.0.1'], enabled: false });
      middleware(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('File Upload Security', () => {
    test('should allow valid file types', async () => {
      const mockFile = {
        name: 'test.pdf',
        size: 1000,
        mimetype: 'application/pdf'
      };

      app.use((req, res, next) => {
        req.files = { file: mockFile };
        next();
      });
      app.use(fileUploadSecurity());
      app.post('/upload', (req, res) => res.json({ status: 'ok' }));

      await request(app)
        .post('/upload')
        .expect(200);
    });

    test('should reject invalid file types', async () => {
      const mockFile = {
        name: 'malicious.exe',
        size: 1000,
        mimetype: 'application/x-executable'
      };

      app.use((req, res, next) => {
        req.files = { file: mockFile };
        next();
      });
      app.use(fileUploadSecurity());
      app.post('/upload', (req, res) => res.json({ status: 'ok' }));

      await request(app)
        .post('/upload')
        .expect(400);
    });

    test('should reject files exceeding size limit', async () => {
      const mockFile = {
        name: 'large.pdf',
        size: 200 * 1024 * 1024, // 200MB
        mimetype: 'application/pdf'
      };

      app.use((req, res, next) => {
        req.files = { file: mockFile };
        next();
      });
      app.use(fileUploadSecurity({ maxFileSize: 100 * 1024 * 1024 })); // 100MB limit
      app.post('/upload', (req, res) => res.json({ status: 'ok' }));

      await request(app)
        .post('/upload')
        .expect(413);
    });
  });

  describe('Security Configuration', () => {
    test('should generate different configs for different environments', () => {
      process.env.NODE_ENV = 'production';
      const prodConfig = getSecurityConfig();
      
      process.env.NODE_ENV = 'development';
      const devConfig = getSecurityConfig();

      expect(prodConfig.isProduction).toBe(true);
      expect(devConfig.isDevelopment).toBe(true);
      expect(prodConfig.csp.reportOnly).toBe(false);
      expect(devConfig.csp.reportOnly).toBe(true);
    });

    test('should include environment-specific CSP directives', () => {
      process.env.NODE_ENV = 'development';
      process.env.API_URL = 'https://api.test.com';
      process.env.TTS_API_URL = 'https://tts.test.com';
      
      const config = getSecurityConfig();
      
      expect(config.csp.directives.connectSrc).toContain('https://api.test.com');
      expect(config.csp.directives.connectSrc).toContain('https://tts.test.com');
      expect(config.csp.directives.connectSrc).toContain('ws:');
      expect(config.csp.directives.imgSrc).toContain('http:');
    });
  });

  describe('Security Logger', () => {
    test('should pass through normal requests', async () => {
      app.use((req, res, next) => {
        req.requestId = 'test-123';
        next();
      });
      app.use(securityLogger);
      app.get('/test', (req, res) => res.json({ status: 'ok' }));

      await request(app)
        .get('/test')
        .expect(200);
    });

    test('should handle suspicious patterns without crashing', async () => {
      app.use((req, res, next) => {
        req.requestId = 'test-123';
        next();
      });
      app.use(securityLogger);
      app.get('/test', (req, res) => res.json({ status: 'ok' }));

      await request(app)
        .get('/test?injection=<script>alert(1)</script>')
        .expect(200);
    });

    test('should handle requests with no requestId', async () => {
      app.use(securityLogger);
      app.get('/test', (req, res) => res.json({ status: 'ok' }));

      await request(app)
        .get('/test')
        .expect(200);
    });
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.API_URL;
    delete process.env.TTS_API_URL;
  });
});