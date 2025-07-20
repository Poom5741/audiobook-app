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
} = require('shared/logger');
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
app.get('/health', async (req, res) => {
  let overallStatus = 'ok';
  const healthDetails = {
    service: 'crawler',
    timestamp: new Date().toISOString(),
    database: { status: 'unknown' },
    queue: { status: 'unknown' },
  };

  // Check database connection
  try {
    const dbStatus = await connectDB(); // Assuming connectDB returns status or throws error
    healthDetails.database = { status: 'connected' };
  } catch (error) {
    healthDetails.database = { status: 'disconnected', error: error.message };
    overallStatus = 'degraded';
  }

  // Check queue status (assuming initializeQueue makes it available globally or returns an instance)
  try {
    // This is a placeholder. In a real scenario, you'd have a way to query queue health.
    // For Bull, you might check active/waiting job counts or connection status.
    const queueManager = require('./services/queueManager');
    const queueStats = await queueManager.getQueueStats(); // Assuming this function exists
    healthDetails.queue = { status: 'initialized', stats: queueStats };
  } catch (error) {
    healthDetails.queue = { status: 'uninitialized', error: error.message };
    overallStatus = 'degraded';
  }

  res.status(overallStatus === 'ok' ? 200 : 503).json({
    status: overallStatus,
    ...healthDetails,
  });
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