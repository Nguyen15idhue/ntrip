// File: src/routes/util.routes.js

import express from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import relayService from '../services/relay.service.js';

const router = express.Router();

/**
 * @swagger
 * /utils/fetch-mountpoints:
 *   get:
 *     summary: Fetch mountpoints from an external NTRIP source
 *     tags: [Utilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: host
 *         schema:
 *           type: string
 *         required: true
 *         description: The hostname or IP address of the NTRIP source.
 *       - in: query
 *         name: port
 *         schema:
 *           type: integer
 *         required: true
 *         description: The port number of the NTRIP source.
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional username for sources that require authentication.
 *       - in: query
 *         name: password
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional password for sources that require authentication.
 *     responses:
 *       '200':
 *         description: A list of mountpoints from the source.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       '400':
 *         description: Bad Request - Missing host or port.
 *       '500':
 *         description: Internal Server Error - Failed to connect or parse the sourcetable.
 */
router.get('/fetch-mountpoints', authenticateJWT, async (req, res) => {
  const { host, port, username, password } = req.query;

  if (!host || !port) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required query parameters: host and port.' 
    });
  }

  try {
    const mountpoints = await relayService.fetchMountpointsFromSource({ 
        host, 
        port: parseInt(port, 10),
        username,
        password
    });
    res.status(200).json({ success: true, data: mountpoints });
  } catch (error) {
    logger.error(`Failed to fetch mountpoints from ${host}:${port}. Error: ${error.message}`);
    // Phản hồi lỗi cụ thể hơn
    if (error.message.includes('Unauthorized')) {
        return res.status(401).json({ success: false, message: error.message });
    }
    if (error.message.includes('Connection error') || error.message.includes('timed out')) {
        return res.status(502).json({ success: false, message: `Bad Gateway: Could not connect to the source. ${error.message}` });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;