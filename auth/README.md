# Auth Service

## Overview

Production-ready authentication service for the audiobook application with enterprise-grade security features.

## Features

### Security

- **JWT Token Management**: Access/refresh token rotation with 15-minute/7-day expiration
- **Rate Limiting**: Multi-tier protection with suspicious activity detection
- **Secrets Management**: Docker secrets integration with validation
- **SSL/TLS**: Automated certificate management with Let's Encrypt
- **CORS**: Environment-based secure cross-origin configuration

### Testing

- **Unit Tests**: 68% coverage with comprehensive auth flow testing
- **Integration Tests**: 17 API endpoint tests with 51% coverage
- **Mocking**: Advanced test utilities with Redis, winston, bcrypt mocking
- **CI/CD**: GitHub Actions integration with automated testing

### Quality Assurance

- **Pre-commit Hooks**: Automated code formatting and testing
- **Code Quality**: ESLint and Prettier integration
- **Conventional Commits**: Enforced commit message standards
- **Security Scanning**: Automated vulnerability detection

## Quick Start

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Quality checks
npm run quality
```

## Environment Variables

```env
JWT_SECRET=your-jwt-secret-key-minimum-64-characters
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure-admin-password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=audiobook_user
POSTGRES_DB=audiobook_db
REDIS_URL=redis://localhost:6379
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Admin login with credentials
- `POST /api/auth/logout` - Logout and clear tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/verify` - Verify token validity

### User Management

- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change user password
- `POST /api/auth/revoke-all` - Revoke all user sessions

### System

- `GET /api/auth/status` - Service health check

## Production Deployment

The auth service is production-ready with:

- Docker secrets management
- SSL/TLS automation
- Rate limiting protection
- Comprehensive monitoring
- Automated testing pipeline

See deployment documentation for detailed setup instructions.
