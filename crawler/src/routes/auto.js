const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

let autoDownloader = null;

// Initialize auto-downloader (lazy loading)
function getAutoDownloader() {
    if (!autoDownloader) {
        const { AutoDownloader } = require('../services/autoDownloader');
        autoDownloader = new AutoDownloader();
    }
    return autoDownloader;
}

// Start auto-downloader
router.post('/start', async (req, res) => {
    try {
        const downloader = getAutoDownloader();
        downloader.start();
        
        res.json({
            message: 'Auto-downloader started',
            status: downloader.getStatus()
        });
    } catch (error) {
        logger.error('Failed to start auto-downloader:', error);
        res.status(500).json({ error: 'Failed to start auto-downloader' });
    }
});

// Stop auto-downloader
router.post('/stop', async (req, res) => {
    try {
        const downloader = getAutoDownloader();
        downloader.stop();
        
        res.json({
            message: 'Auto-downloader stopped',
            status: downloader.getStatus()
        });
    } catch (error) {
        logger.error('Failed to stop auto-downloader:', error);
        res.status(500).json({ error: 'Failed to stop auto-downloader' });
    }
});

// Get auto-downloader status
router.get('/status', async (req, res) => {
    try {
        const downloader = getAutoDownloader();
        res.json(downloader.getStatus());
    } catch (error) {
        logger.error('Failed to get auto-downloader status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Update auto-downloader configuration
router.put('/config', async (req, res) => {
    try {
        const downloader = getAutoDownloader();
        const { enabled, interval, maxPerSession, searchQueries } = req.body;
        
        const newConfig = {};
        if (typeof enabled === 'boolean') newConfig.enabled = enabled;
        if (typeof interval === 'number' && interval > 0) newConfig.interval = interval;
        if (typeof maxPerSession === 'number' && maxPerSession > 0) newConfig.maxPerSession = maxPerSession;
        if (Array.isArray(searchQueries)) newConfig.searchQueries = searchQueries;
        
        downloader.updateConfig(newConfig);
        
        res.json({
            message: 'Configuration updated',
            status: downloader.getStatus()
        });
    } catch (error) {
        logger.error('Failed to update auto-downloader config:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
    }
});

// Trigger manual download session
router.post('/download-now', async (req, res) => {
    try {
        const downloader = getAutoDownloader();
        
        // Run download session in background
        downloader.downloadSession().catch(error => {
            logger.error('Manual download session failed:', error);
        });
        
        res.json({
            message: 'Download session started',
            status: 'running'
        });
    } catch (error) {
        logger.error('Failed to start manual download session:', error);
        res.status(500).json({ error: 'Failed to start download session' });
    }
});

module.exports = router;