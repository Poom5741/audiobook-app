require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const { 
  createLogger,
  createExpressLogger,
  createAuditLogger,
  createMetricsLogger,
  addRequestId,
  logUnhandledErrors
} = require('../shared/logger');
const { connectDB } = require('./db/connection');

// Logger setup
const logger = createLogger('crawler-service');
const auditLogger = createAuditLogger('crawler-service');
const metricsLogger = createMetricsLogger('crawler-service');

// Setup unhandled error logging
logUnhandledErrors('crawler-service');
const searchRoutes = require('./routes/search');
const downloadRoutes = require('./routes/download');
const queueRoutes = require('./routes/queue');
const autoRoutes = require('./routes/auto');
const pipelineRoutes = require('./routes/pipeline');
const { initializeQueue } = require('./services/queueManager');

const app = express();
const PORT = process.env.PORT || 3001;

// Request ID middleware (should be first)
app.use(addRequestId);

// Middleware
app.use(cors());
app.use(createExpressLogger('crawler-service'));
app.use(express.json());
app.use(fileUpload({
  useTempFiles : true,
  tempFileDir : './temp-uploads/'
}));

// Routes
app.use('/api/search', searchRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/downloads', downloadRoutes); // Also support /downloads for compatibility
app.use('/api/queue', queueRoutes);
app.use('/api/auto', autoRoutes);
app.use('/api/pipeline', pipelineRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'crawler' });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize services and start server
async function start() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Database connected');

    // Initialize queue
    await initializeQueue();
    logger.info('Queue system initialized');

    // Start server
    app.listen(PORT, () => {
      logger.info(`Crawler service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start crawler service:', error);
    process.exit(1);
  }
}

start();