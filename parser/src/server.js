require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { 
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors
} = require('../shared/logger');

// Logger setup
const logger = createLogger('parser-service');
const auditLogger = createAuditLogger('parser-service');
const metricsLogger = createMetricsLogger('parser-service');

// Setup unhandled error logging
logUnhandledErrors('parser-service');
const app = express();
const PORT = process.env.PORT || 3002;

// Request ID middleware (should be first)
app.use(addRequestId);

// Middleware
app.use(cors());
app.use(createExpressLogger('parser-service'));
app.use(express.json());

// Import and use routes
const parserRoutes = require('./routes');
app.use('/api', parserRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'parser' });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Parser service running on port ${PORT}`);
});