# GEMINI-1: DOCKER CONFIGURATION TASK

## AI AGENT ASSIGNMENT
```yaml
AGENT_ID: GEMINI-1
TASK_ID: 11_DOCKER_DEPLOYMENT
PRIORITY: CRITICAL
MODE: AUTONOMOUS_FIX
```

## IMMEDIATE TASK: Fix Docker Compose Configuration

### CURRENT ISSUES
- Services failing to start in correct order
- Missing health checks causing dependency failures
- Environment variables not properly configured
- No data persistence volumes

### REQUIRED FIXES

#### 1. docker-compose.yml Updates
```yaml
IMPLEMENT:
  - Add depends_on with condition: service_healthy
  - Create health checks for postgres, redis, backend
  - Fix environment variable references
  - Add restart policies
  - Configure proper networks
  - Add volume mappings for persistence
```

#### 2. Service Dependencies Order
```
postgres/redis → backend → parser/crawler/tts-api → frontend → nginx
```

#### 3. Health Check Examples
```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U audiobook"]
    interval: 10s
    timeout: 5s
    retries: 5

backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

#### 4. Volume Persistence
```yaml
volumes:
  postgres_data:
  redis_data:
  books_storage:
  audio_storage:
  uploads_temp:
```

## ACTION REQUIRED
1. Read current docker-compose.yml
2. Implement ALL fixes listed above
3. Create docker-compose.override.yml for development
4. Update .env.example with all required variables
5. Test configuration syntax

BEGIN IMMEDIATE IMPLEMENTATION