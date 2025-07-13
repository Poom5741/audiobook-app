# Security and Performance Refactoring for Audiobook App
# Generated: 2025-07-13

## CRITICAL SECURITY FIXES

### 1. Environment Variables (.env.insecure.backup)
# ISSUE: Hardcoded credentials exposed in backup file
# FIX: Remove insecure backup, use secure credential management

# Before (INSECURE):
# POSTGRES_PASSWORD=audiobook123
# JWT_SECRET=your-secret-key-here

# After (SECURE):
import os
from cryptography.fernet import Fernet

class SecureConfig:
    @staticmethod
    def get_db_password():
        # Use environment variable with fallback to AWS Secrets Manager
        return os.environ.get('POSTGRES_PASSWORD') or fetch_from_secrets_manager('db_password')
    
    @staticmethod
    def get_jwt_secret():
        # Generate secure JWT secret if not exists
        secret = os.environ.get('JWT_SECRET')
        if not secret or secret == 'your-secret-key-here':
            secret = Fernet.generate_key().decode()
            # Store in secure location
        return secret

### 2. TTS API Input Validation (tts-api/app.py)
# ISSUE: Text field accepts up to 50,000 chars without sanitization
# FIX: Add input validation and rate limiting

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
import bleach

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

class SecureTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)  # Reduced from 50000
    book: str = Field(..., min_length=1, max_length=200)
    chapter: str = Field(..., min_length=1, max_length=50)
    
    @validator('text')
    def sanitize_text(cls, v):
        # Remove potential script injections
        return bleach.clean(v, tags=[], strip=True)
    
    @validator('book', 'chapter')
    def validate_identifiers(cls, v):
        # Only allow alphanumeric and hyphens
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('Invalid identifier format')
        return v

@app.post("/generate-tts")
@limiter.limit("5/minute")  # Rate limit
async def generate_tts(request: Request, tts_request: SecureTTSRequest):
    # Process with validated input
    pass

### 3. File Path Traversal Protection
# ISSUE: No validation on book/chapter paths
# FIX: Sanitize paths to prevent directory traversal

import re
from pathlib import Path

def secure_path(base_dir: str, *parts: str) -> Path:
    """Create secure path preventing directory traversal"""
    # Sanitize each part
    safe_parts = []
    for part in parts:
        # Remove any path separators and parent directory references
        safe_part = re.sub(r'[/\\]|\.\.', '', part)
        safe_parts.append(safe_part)
    
    # Construct path and ensure it's within base directory
    full_path = Path(base_dir).joinpath(*safe_parts).resolve()
    base_path = Path(base_dir).resolve()
    
    if not str(full_path).startswith(str(base_path)):
        raise ValueError("Path traversal attempt detected")
    
    return full_path

### 4. Database Connection Security
# ISSUE: Plain text connection string
# FIX: Use SSL and connection pooling

from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

def create_secure_db_engine():
    db_url = os.environ.get('DATABASE_URL')
    if db_url and 'sslmode' not in db_url:
        db_url += '?sslmode=require'
    
    return create_engine(
        db_url,
        poolclass=QueuePool,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,  # Verify connections
        pool_recycle=3600    # Recycle connections after 1 hour
    )

### 5. Docker Security Improvements
# ISSUE: Services running as root
# FIX: Add non-root user to Dockerfiles

# Dockerfile additions:
"""
# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -u 1001 -S appuser -G appuser

# Change ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser
"""

### 6. Shared Module Dependencies Fix
# ISSUE: Winston dependency missing in containers
# FIX: Update Docker build process

# docker-compose.yml update:
"""
services:
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
      args:
        - INSTALL_SHARED_DEPS=true
    volumes:
      - ./shared:/app/shared:ro  # Read-only mount
"""

## PERFORMANCE OPTIMIZATIONS

### 1. TTS Caching Layer
# Add Redis caching for repeated text

import hashlib
import redis
import pickle

class TTSCache:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)
        self.ttl = 86400  # 24 hours
    
    def get_cache_key(self, text: str, speaker: str, emotion: str) -> str:
        content = f"{text}:{speaker}:{emotion}"
        return f"tts:{hashlib.sha256(content.encode()).hexdigest()}"
    
    async def get_cached(self, key: str) -> Optional[bytes]:
        try:
            return self.redis.get(key)
        except Exception:
            return None
    
    async def cache_result(self, key: str, audio_data: bytes):
        try:
            self.redis.setex(key, self.ttl, audio_data)
        except Exception:
            pass  # Don't fail on cache errors

### 2. Async Processing Pipeline
# Convert synchronous operations to async

async def process_tts_async(text: str, output_path: Path):
    # Use asyncio for concurrent processing
    loop = asyncio.get_event_loop()
    
    # Run CPU-intensive tasks in thread pool
    audio_data = await loop.run_in_executor(
        None, 
        tts_engine.generate_speech,
        text
    )
    
    # Async file write
    await aiofiles.write(output_path, audio_data)
    
    return audio_data

### 3. Database Query Optimization
# Add indexes and optimize queries

"""
-- Add indexes for common queries
CREATE INDEX idx_books_status ON books(status);
CREATE INDEX idx_chapters_book_id ON chapters(book_id);
CREATE INDEX idx_audio_files_chapter_id ON audio_files(chapter_id);

-- Composite index for common join
CREATE INDEX idx_chapters_book_status ON chapters(book_id, status);
"""

## DEPLOYMENT SECURITY

### 1. Environment-specific configs
# Use separate configs for dev/prod

class Config:
    def __init__(self, env: str = 'development'):
        self.env = env
        self.debug = env == 'development'
        self.ssl_required = env == 'production'
        self.cors_origins = ['http://localhost:3000'] if env == 'development' else ['https://audiobook.app']

### 2. Secure Headers Middleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from secure import SecureHeaders

secure_headers = SecureHeaders()

@app.middleware("http")
async def set_secure_headers(request, call_next):
    response = await call_next(request)
    secure_headers.framework.fastapi(response)
    return response

# Add trusted host validation
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "audiobook.app"]
)

## MONITORING & LOGGING

### 1. Structured Logging
import structlog

logger = structlog.get_logger()

# Log security events
logger.info("tts_request", 
    user_id=user_id,
    book=book,
    chapter=chapter,
    text_length=len(text),
    ip=request.client.host
)

### 2. Health Checks
@app.get("/health")
async def health_check():
    checks = {
        "api": "healthy",
        "database": await check_db_health(),
        "redis": await check_redis_health(),
        "disk_space": check_disk_space()
    }
    
    status = all(v == "healthy" for v in checks.values())
    return JSONResponse(
        content={"status": "healthy" if status else "degraded", "checks": checks},
        status_code=200 if status else 503
    )

## IMMEDIATE ACTIONS REQUIRED:
1. Delete .env.insecure.backup immediately
2. Rotate all credentials (database passwords, JWT secrets)
3. Update all services to use secure configurations
4. Apply rate limiting to all public endpoints
5. Enable SSL/TLS for all connections
6. Run security audit: `docker run --rm -v $(pwd):/src aquasec/trivy fs /src`