import express from 'express';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import relayService from '../services/relay.service.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @route GET /api/status/connections
 * @description Get a list of all currently active rover connections and their real-time status.
 * @access Private (Admin only)
 */
router.get('/connections', [authenticateJWT, isAdmin], (req, res) => {
  try {
    const activeConnections = relayService.getActiveConnections();
    res.status(200).json({
      success: true,
      data: activeConnections
    });
  } catch (error) {
    logger.error('Failed to get active connections status:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching connection status.'
    });
  }
});

export default router;