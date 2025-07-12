// Mock secrets loader for auth service tests

module.exports = {
  loadSecret: jest.fn((name) => {
    const secrets = {
      JWT_SECRET: process.env.JWT_SECRET,
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD
    };
    return secrets[name] || 'mock-secret-value';
  }),
  validateSecret: jest.fn(() => true),
  loadServiceSecrets: jest.fn(() => ({
    JWT_SECRET: process.env.JWT_SECRET,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
  })),
  buildDatabaseUrl: jest.fn(() => 'postgresql://test:test@localhost:5432/test'),
  buildRedisUrl: jest.fn(() => 'redis://localhost:6379/1')
};