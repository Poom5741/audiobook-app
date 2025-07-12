#!/bin/bash

# Script to generate secure secrets for production deployment
# This script creates Docker secrets for sensitive configuration

set -euo pipefail

echo "🔐 Generating secure secrets for audiobook-app..."

# Function to generate secure random strings
generate_secret() {
    openssl rand -base64 48 | tr -d "=+/" | cut -c1-64
}

# Generate secrets
JWT_SECRET=$(generate_secret)
POSTGRES_PASSWORD=$(generate_secret)
REDIS_PASSWORD=$(generate_secret)
ADMIN_PASSWORD=$(generate_secret)

# Create secrets directory if it doesn't exist
mkdir -p secrets

# Write secrets to files (for Docker secrets)
echo "$JWT_SECRET" > secrets/jwt_secret
echo "$POSTGRES_PASSWORD" > secrets/postgres_password
echo "$REDIS_PASSWORD" > secrets/redis_password
echo "$ADMIN_PASSWORD" > secrets/admin_password

# Create .env.production template
cat > .env.production.template << EOF
# Production Environment Variables Template
# Copy this to .env.production and fill in the values
# NEVER commit .env.production to version control

# Database Configuration
POSTGRES_USER=audiobook_user
POSTGRES_DB=audiobook_db
# POSTGRES_PASSWORD is loaded from Docker secret

# Redis Configuration
# REDIS_PASSWORD is loaded from Docker secret

# JWT Configuration
# JWT_SECRET is loaded from Docker secret
JWT_EXPIRY=7d
JWT_REFRESH_EXPIRY=30d

# Admin Configuration
ADMIN_USERNAME=admin
# ADMIN_PASSWORD is loaded from Docker secret

# External APIs (add your keys here)
OPENAI_API_KEY=your-openai-api-key-here

# Service URLs (internal Docker network)
AUTH_SERVICE_URL=http://auth:3001
BACKEND_SERVICE_URL=http://backend:3000
TTS_SERVICE_URL=http://tts-api:8000
PARSER_SERVICE_URL=http://parser:3003
SUMMARIZER_SERVICE_URL=http://summarizer:3004

# Frontend Configuration
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_AUTH_URL=https://auth.your-domain.com

# SSL/TLS Configuration
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem

# Monitoring
SENTRY_DSN=your-sentry-dsn-here
EOF

# Create docker-compose secrets configuration
cat > docker-compose.secrets.yml << 'EOF'
version: '3.8'

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret
  postgres_password:
    file: ./secrets/postgres_password
  redis_password:
    file: ./secrets/redis_password
  admin_password:
    file: ./secrets/admin_password

services:
  auth:
    secrets:
      - jwt_secret
      - postgres_password
      - admin_password
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
      ADMIN_PASSWORD_FILE: /run/secrets/admin_password

  backend:
    secrets:
      - jwt_secret
      - postgres_password
      - redis_password
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
      REDIS_PASSWORD_FILE: /run/secrets/redis_password

  frontend:
    secrets:
      - jwt_secret
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret

  postgres:
    secrets:
      - postgres_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password

  redis:
    secrets:
      - redis_password
    command: redis-server --requirepass-file /run/secrets/redis_password
EOF

echo "✅ Secrets generated successfully!"
echo ""
echo "📝 Generated files:"
echo "  - secrets/jwt_secret"
echo "  - secrets/postgres_password"
echo "  - secrets/redis_password"
echo "  - secrets/admin_password"
echo "  - .env.production.template"
echo "  - docker-compose.secrets.yml"
echo ""
echo "⚠️  IMPORTANT:"
echo "  1. Add 'secrets/' to .gitignore"
echo "  2. Copy .env.production.template to .env.production and fill in external API keys"
echo "  3. Use docker-compose.secrets.yml overlay for production deployment"
echo "  4. Keep secrets directory secure and never commit it"
echo ""
echo "🚀 To use in production:"
echo "  docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.secrets.yml up -d"