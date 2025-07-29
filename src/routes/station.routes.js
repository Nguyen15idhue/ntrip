import express from 'express';
import { Station, Location } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
// FIX: Import the singleton instance, do NOT create a new one.
import relayService from '../services/relay.service.js';
import { Op } from 'sequelize';

const router = express.Router();

// Get all stations
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const stations = await Station.findAll({
      include: [Location]
    });
    res.status(200).json({ success: true, data: stations });
  } catch (error) {
    logger.error('Error fetching stations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stations' });
  }
});

// Create new station
router.post('/', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const { name } = req.body;
    
    const existingStation = await Station.findOne({ where: { name } });
    if (existingStation) {
      return res.status(400).json({ success: false, message: 'Station with this name already exists' });
    }
    
    const station = await Station.create(req.body);
    
    // If the new station is active, start its relay.
    if (station.status === 'active') {
      await relayService.startRelay(station.id);
    }
    
    // The caster will pick up the new station on its next sync or can be refreshed here if immediate visibility is needed
    await relayService.syncWithDatabase();
    
    res.status(201).json({ success: true, data: station, message: 'Station created successfully' });
  } catch (error) {
    logger.error('Error creating station:', error);
    res.status(500).json({ success: false, message: 'Failed to create station' });
  }
});

// *** NEW: BULK ACTIONS ROUTE ***
router.post('/bulk-action', [authenticateJWT, isAdmin], async (req, res) => {
    const { action, stationIds } = req.body;

    // --- Input Validation ---
    if (!action || !['start', 'stop', 'delete'].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid or missing 'action'. Must be one of: start, stop, delete." });
    }
    if (!stationIds || !Array.isArray(stationIds) || stationIds.length === 0) {
        return res.status(400).json({ success: false, message: "Missing or invalid 'stationIds'. Must be a non-empty array of station IDs." });
    }

    const results = {
        succeeded: [],
        failed: []
    };

    const stations = await Station.findAll({ where: { id: { [Op.in]: stationIds } } });
    const stationMap = new Map(stations.map(s => [s.id, s]));

    for (const id of stationIds) {
        try {
            const station = stationMap.get(id);
            if (!station) {
                throw new Error('Station not found.');
            }

            switch (action) {
                case 'start':
                    await relayService.startRelay(station.id);
                    break;
                case 'stop':
                    await relayService.stopRelay(station.name);
                    break;
                case 'delete':
                    // First stop relay without updating DB, then destroy the record
                    await relayService.stopRelay(station.name, false); 
                    await station.destroy();
                    break;
            }
            results.succeeded.push(id);
        } catch (error) {
            logger.error(`Bulk action '${action}' failed for station ID ${id}:`, error);
            results.failed.push({ id, error: error.message });
        }
    }
    
    // Sync the entire service state after all actions are done
    await relayService.syncWithDatabase();

    res.status(200).json({
        success: true,
        message: `Bulk action '${action}' processed.`,
        results
    });
});


// Get station by ID
router.get('/:id', authenticateJWT, async (req, res) => {
    try {
        const station = await Station.findByPk(req.params.id, {
            include: [Location]
        });
        if (!station) {
            return res.status(404).json({ success: false, message: 'Station not found' });
        }
        res.status(200).json({ success: true, data: station });
    } catch (error) {
        logger.error(`Error fetching station ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Failed to fetch station' });
    }
});


// Update station
router.put('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }
    
    const oldStatus = station.status;
    const oldName = station.name;

    await station.update(req.body);
    
    const newStatus = station.status;
    const newName = station.name;
    
    // Logic to handle relay state changes
    if (oldName !== newName) {
        // If name changed, we must stop the old one.
        await relayService.stopRelay(oldName, false);
        // If the station is still active with the new name, start it.
        if(newStatus === 'active') {
            await relayService.startRelay(station.id);
        }
    } else if (oldStatus !== newStatus) {
      // If name is the same, but status changed
      if (newStatus === 'active') {
        await relayService.startRelay(station.id);
      } else {
        await relayService.stopRelay(station.name);
      }
    } else if (newStatus === 'active') {
      // If status is still active and config might have changed (e.g., source host), restart.
      logger.info(`Restarting station ${station.name} due to configuration update.`);
      await relayService.stopRelay(station.name, false);
      await relayService.startRelay(station.id);
    }

    await relayService.syncWithDatabase();

    res.status(200).json({ success: true, data: station, message: 'Station updated successfully' });
  } catch (error) {
    logger.error(`Error updating station ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update station' });
  }
});

// Delete station
router.delete('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }
    
    await relayService.stopRelay(station.name, false);
    await station.destroy();
    await relayService.syncWithDatabase();
    
    res.status(200).json({ success: true, message: 'Station deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting station ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to delete station' });
  }
});

// Start station
router.post('/:id/start', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const result = await relayService.startRelay(req.params.id);
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }
    res.status(200).json({ success: true, message: 'Station start command issued.', data: result.station });
  } catch (error) {
    logger.error(`API Error starting station ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: `Failed to start station: ${error.message}` });
  }
});

// Stop station
router.post('/:id/stop', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }

    const result = await relayService.stopRelay(station.name);
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }
    
    res.status(200).json({ success: true, message: 'Station stop command issued.' });
  } catch (error) {
    logger.error(`API Error stopping station ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: `Failed to stop station: ${error.message}` });
  }
});

// Get station statistics
router.get('/:id/stats', authenticateJWT, async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Station not found' });
    }
    
    const serviceStatus = relayService.getStatus();
    const stationStats = serviceStatus.relays.find(s => s.stationId === parseInt(req.params.id));
    
    if (stationStats) {
      res.status(200).json({ success: true, data: stationStats });
    } else {
      res.status(200).json({
        success: true,
        data: { stationId: station.id, stationName: station.name, connected: false, status: 'inactive' }
      });
    }
  } catch (error) {
    logger.error(`Error fetching station stats ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to fetch station statistics' });
  }
});

export default router;