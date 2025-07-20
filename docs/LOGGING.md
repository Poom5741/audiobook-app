# Centralized Logging Documentation

## Overview

The audiobook application implements a comprehensive centralized logging system using the ELK Stack (Elasticsearch, Logstash, Kibana) with Filebeat and Fluentd for log aggregation. This system provides real-time monitoring, security event tracking, performance metrics, and audit trails across all microservices.

## Architecture

```
[Services] → [Shared Logger] → [Log Files] → [Filebeat/Fluentd] → [Logstash] → [Elasticsearch] → [Kibana]
```

### Components

1. **Shared Logger** (`shared/logger.js`)
   - Unified logging configuration for all services
   - Multiple logger types: application, audit, metrics
   - Request ID tracking and sanitization

2. **ELK Stack**
   - **Elasticsearch**: Log storage and indexing
   - **Logstash**: Log processing and transformation
   - **Kibana**: Visualization and dashboards

3. **Log Shippers**
   - **Filebeat**: Lightweight log shipper
   - **Fluentd**: Alternative log aggregator

## Quick Start

### Start Logging Infrastructure

```bash
# Start all logging services
./scripts/start-logging.sh

# Stop logging services
./scripts/stop-logging.sh

# Remove containers and volumes
./scripts/stop-logging.sh --remove
```

### Access Points

- **Kibana Dashboard**: http://localhost:5601
- **Elasticsearch**: http://localhost:9200
- **Logstash**: http://localhost:9600

## Service Integration

### Express.js Services

All Express.js services (auth, backend, crawler, parser) use the shared logger:

```javascript
const { 
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors
} = require('../../../shared/logger');

// Initialize loggers
const logger = createLogger('service-name');
const auditLogger = createAuditLogger('service-name');
const metricsLogger = createMetricsLogger('service-name');

// Setup middleware
app.use(addRequestId);
app.use(createExpressLogger('service-name'));

// Setup error handling
logUnhandledErrors('service-name');
```

### Logger Types

#### 1. Application Logger
```javascript
const logger = createLogger('service-name');

logger.info('Operation completed', { userId, requestId });
logger.warn('Resource limit approaching', { usage: '80%' });
logger.error('Database connection failed', { error: error.message });
```

#### 2. Audit Logger
```javascript
const auditLogger = createAuditLogger('service-name');

// User activities
auditLogger.logActivity('login_success', userId, {
  ip: req.ip,
  userAgent: req.get('User-Agent')
});

// Security events
auditLogger.logSecurityEvent('login_failed', 'medium', {
  username,
  ip: req.ip,
  reason: 'invalid_credentials'
});

// Data access
auditLogger.logDataAccess('user_data', 'read', userId, {
  resource: '/api/user/profile'
});
```

#### 3. Metrics Logger
```javascript
const metricsLogger = createMetricsLogger('service-name');

// Performance metrics
metricsLogger.logPerformance('database_query', '45ms', {
  query: 'SELECT_USERS',
  rows: 150
});

// Business metrics
metricsLogger.logBusinessMetric('user_login', 1, {
  userId,
  source: 'web'
});

// Resource usage
metricsLogger.logResourceUsage('memory', '75%', {
  total: '2GB',
  used: '1.5GB'
});
```

## Log Structure

### Standard Fields

All logs include these standard fields:

```json
{
  "@timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info|warn|error|debug",
  "message": "Human readable message",
  "service": "auth-service|backend-service|crawler-service|parser-service",
  "environment": "development|production",
  "application": "audiobook-app"
}
```

### HTTP Request Logs

```json
{
  "method": "POST",
  "url": "/api/auth/login",
  "statusCode": 200,
  "duration": "125ms",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "userId": "user123",
  "requestId": "req-abc123"
}
```

### Security Event Logs

```json
{
  "event": "login_failed",
  "severity": "medium|high|critical",
  "username": "admin",
  "ip": "192.168.1.100",
  "reason": "invalid_credentials"
}
```

### Performance Metrics

```json
{
  "operation": "database_query",
  "duration": 45,
  "duration_ms": 45,
  "is_slow_request": false
}
```

## File Organization

### Log File Structure

```
logs/
├── auth-service-combined.log     # All auth service logs
├── auth-service-error.log        # Auth service errors
├── auth-service-audit.log        # Auth service audit logs
├── auth-service-metrics.log      # Auth service metrics
├── backend-service-combined.log  # All backend service logs
├── backend-service-error.log     # Backend service errors
├── crawler-service-combined.log  # All crawler service logs
├── parser-service-combined.log   # All parser service logs
└── all-services.log              # Aggregated logs from all services
```

### Configuration Files

```
logging/
├── logstash/
│   ├── config/logstash.yml       # Logstash configuration
│   └── pipeline/audiobook.conf   # Log processing pipeline
├── filebeat/
│   └── filebeat.yml              # Filebeat configuration
├── fluentd/
│   └── conf/fluent.conf          # Fluentd configuration
└── kibana/
    └── dashboard-config.json     # Kibana dashboard templates
```

## Environment Variables

### Application Services

```env
# Logging configuration
LOG_LEVEL=info|debug|warn|error
LOGS_DIR=/var/log/audiobook
ENABLE_FILE_LOGGING=true|false

# Request tracking
ENABLE_REQUEST_ID=true
```

### Logging Infrastructure

```env
# Elasticsearch
ES_JAVA_OPTS=-Xms512m -Xmx512m

# Logstash
LS_JAVA_OPTS=-Xmx256m -Xms256m

# Environment
NODE_ENV=development|production
```

## Security Features

### Sensitive Data Sanitization

The logger automatically sanitizes sensitive fields:

```javascript
// These fields are automatically redacted
const sensitiveFields = [
  'password', 'token', 'secret', 'key', 'authorization', 
  'jwt', 'cookie', 'session', 'credentials', 'auth'
];

// Input
logger.info('User data', { username: 'admin', password: 'secret123' });

// Output
{ "username": "admin", "password": "[REDACTED]" }
```

### Request ID Tracking

Every request gets a unique ID for correlation:

```javascript
// Automatically added to all logs within request context
{
  "requestId": "1642248600000-xyz123abc",
  "userId": "user123",
  "ip": "192.168.1.100"
}
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Error Rate**: Percentage of error-level logs
2. **Response Time**: API response time distribution
3. **Failed Logins**: Authentication failure rate
4. **Service Health**: Service availability and uptime
5. **Resource Usage**: Memory, CPU, disk usage

### Kibana Dashboards

1. **Application Overview**: General health and metrics
2. **Security Dashboard**: Authentication events and threats
3. **Performance Dashboard**: Response times and slow queries
4. **Error Analysis**: Error trends and investigation
5. **Audit Trail**: User activity and data access

### Sample Queries

#### Find Failed Login Attempts
```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "event": "login_failed" } },
        { "range": { "@timestamp": { "gte": "now-1h" } } }
      ]
    }
  }
}
```

#### Slow API Requests
```json
{
  "query": {
    "bool": {
      "must": [
        { "range": { "duration_ms": { "gte": 1000 } } },
        { "exists": { "field": "url" } }
      ]
    }
  }
}
```

#### Error Trends
```json
{
  "query": {
    "bool": {
      "must": [
        { "term": { "level": "error" } },
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "errors_over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "interval": "1h"
      }
    }
  }
}
```

## Best Practices

### Development

1. Use appropriate log levels:
   - `debug`: Detailed information for debugging
   - `info`: General information about operations
   - `warn`: Warning conditions that should be monitored
   - `error`: Error conditions that need immediate attention

2. Include relevant context in log messages:
   ```javascript
   // Good
   logger.info('User profile updated', { 
     userId, 
     changes: ['email', 'name'],
     requestId 
   });
   
   // Bad
   logger.info('Profile updated');
   ```

3. Use structured logging with consistent field names:
   ```javascript
   // Consistent field naming
   logger.info('Database query executed', {
     operation: 'SELECT',
     table: 'users',
     duration_ms: 45,
     rows_returned: 150
   });
   ```

### Production

1. Set appropriate log levels (info or warn in production)
2. Monitor log volume and implement log rotation
3. Set up alerts for critical errors and security events
4. Regularly review and archive old logs
5. Ensure log storage has sufficient capacity

### Security

1. Never log sensitive information (passwords, tokens, etc.)
2. Use audit logging for all security-relevant events
3. Monitor for suspicious patterns in logs
4. Implement log integrity measures
5. Restrict access to log files and dashboards

## Troubleshooting

### Common Issues

1. **Elasticsearch not starting**
   - Check available memory (requires at least 1GB)
   - Verify disk space availability
   - Check for port conflicts

2. **Logs not appearing in Kibana**
   - Verify log files are being created
   - Check Filebeat/Fluentd configuration
   - Ensure index patterns are set up correctly

3. **High log volume**
   - Adjust log levels in production
   - Implement log sampling for high-frequency events
   - Set up log rotation and archival

### Debugging Commands

```bash
# Check log file creation
ls -la logs/

# View live logs
tail -f logs/auth-service-combined.log

# Check Elasticsearch health
curl http://localhost:9200/_cluster/health

# View Elasticsearch indices
curl http://localhost:9200/_cat/indices

# Check Logstash status
curl http://localhost:9600/_node/stats

# View Docker container logs
docker-compose -f docker-compose.logging.yml logs -f elasticsearch
```

## Performance Considerations

### Log Volume Management

1. **File Rotation**: Configure automatic log rotation
   - Max file size: 10MB per log file
   - Keep 10 historical files
   - Compress old files

2. **Index Management**: 
   - Daily indices for time-based data
   - Automatic index deletion after 30 days
   - Index templates for consistent mapping

3. **Resource Allocation**:
   - Elasticsearch: 512MB-1GB heap
   - Logstash: 256MB heap
   - Monitor disk usage regularly

## Integration with CI/CD

The logging system integrates with GitHub Actions for:

1. **Log Analysis**: Automated log parsing in CI pipeline
2. **Error Detection**: Fail builds on critical errors
3. **Performance Testing**: Monitor response times
4. **Security Scanning**: Detect security events in logs

## Support and Maintenance

### Regular Tasks

1. **Weekly**:
   - Review error trends
   - Check log volume and storage
   - Verify backup procedures

2. **Monthly**:
   - Update dashboard configurations
   - Review and tune alerting rules
   - Archive old log data

3. **Quarterly**:
   - Update ELK stack components
   - Review and update log retention policies
   - Conduct log security audit

### Contact Information

For logging-related issues:
- Check the troubleshooting section first
- Review GitHub Issues for known problems
- Create new issue with detailed error information