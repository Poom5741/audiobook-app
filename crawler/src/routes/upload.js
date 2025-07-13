const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { processUploadPipeline } = require('../services/pipelineManager');

module.exports = router;