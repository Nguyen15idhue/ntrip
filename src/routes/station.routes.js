import express from 'express';
import { Station, Location } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
// Import singleton instance đã được sửa
import relayService from '../services/relay.service.js';
import { Op } from 'sequelize';

const router = express.Router();

// Get all stations
router.get('/', authenticateJWT, async (req, res) => {
  try {
    // Bước 1: Lấy tất cả các trạm từ cơ sở dữ liệu
    const stations = await Station.findAll({
      include: [Location]
    });

    // Bước 2: Lấy trạng thái kết nối nguồn thực tế từ RelayService
    const sourceStatuses = relayService.getAllSourceStatuses();

    // Bước 3: Kết hợp dữ liệu từ DB với trạng thái thực tế
    const stationsWithRealtimeStatus = stations.map(station => {
      // Chuyển đổi đối tượng Sequelize thành một object JSON thuần túy để thêm thuộc tính mới
      const stationJson = station.toJSON();
      
      // Kiểm tra trạng thái từ map. Nếu trạm có trong map và giá trị là true, thì là 'online'.
      // Nếu không có trong map (tức là relay không chạy cho trạm này) hoặc giá trị là false, thì là 'offline'.
      const isOnline = sourceStatuses.get(stationJson.name) || false;
      
      // Thêm trường `source_status` vào đối tượng
      stationJson.source_status = isOnline ? 'online' : 'offline';
      
      return stationJson;
    });

    res.status(200).json({ success: true, data: stationsWithRealtimeStatus });
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
    
    if (station.status === 'active') {
      await relayService.startRelay(station.id);
    }
    
    await relayService.syncWithDatabase();
    
    res.status(201).json({ success: true, data: station, message: 'Station created successfully' });
  } catch (error) {
    logger.error('Error creating station:', error);
    res.status(500).json({ success: false, message: 'Failed to create station' });
  }
});

// Bulk actions route
router.post('/bulk-action', [authenticateJWT, isAdmin], async (req, res) => {
    const { action, stationIds } = req.body;

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
    
    if (oldName !== newName) {
        await relayService.stopRelay(oldName, false);
        if(newStatus === 'active') {
            await relayService.startRelay(station.id);
        }
    } else if (oldStatus !== newStatus) {
      if (newStatus === 'active') {
        await relayService.startRelay(station.id);
      } else {
        await relayService.stopRelay(station.name);
      }
    } else if (newStatus === 'active') {
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
    const stationId = parseInt(req.params.id, 10);
    if (isNaN(stationId)) {
      return res.status(400).json({ success: false, message: 'Invalid Station ID' });
    }
    
    // Logic này bây giờ sẽ hoạt động chính xác vì hàm trong service đã được sửa
    const stationStats = relayService.getStationStatus(stationId);
    
    if (stationStats) {
      // Nếu tìm thấy trong relay service (tức là đang active)
      res.status(200).json({ success: true, data: stationStats });
    } else {
      // Nếu không, trạm này đang không hoạt động (inactive)
      const station = await Station.findByPk(stationId);
      if (!station) {
        return res.status(404).json({ success: false, message: 'Station not found' });
      }
      res.status(200).json({
        success: true,
        data: { 
          stationId: station.id, 
          stationName: station.name, 
          status: 'inactive', 
          sourceConnected: false, 
          clientsConnected: 0 
        }
      });
    }
  } catch (error) {
    logger.error(`Error fetching station stats ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to fetch station statistics' });
  }
});

export default router;