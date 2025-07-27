import express from 'express';
import { Station, Location } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import RelayService from '../services/relay.service.js';

const router = express.Router();
const relayService = new RelayService();

// Get all stations
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const stations = await Station.findAll({
      include: [Location]
    });
    
    res.status(200).json({
      success: true,
      data: stations
    });
  } catch (error) {
    logger.error('Error fetching stations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
});

// Get station by ID
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id, {
      include: [Location]
    });
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: station
    });
  } catch (error) {
    logger.error(`Error fetching station ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station'
    });
  }
});

// Create new station - Admin access required
router.post('/', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const {
      name,
      description,
      lat,
      lon,
      location_id,
      source_host,
      source_port,
      source_user,
      source_pass,
      source_mount_point,
      carrier,
      nav_system,
      network,
      country,
      status
    } = req.body;
    
    // Validate required fields
    if (!name || !location_id || !source_host || !source_mount_point || lat === undefined || lon === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, location, latitude, longitude, source host, and source mount point are required'
      });
    }
    
    // Check if station already exists
    const existingStation = await Station.findOne({
      where: { name }
    });
    
    if (existingStation) {
      return res.status(400).json({
        success: false,
        message: 'Station with this name already exists'
      });
    }
    
    // Create station
    const station = await Station.create({
      name,
      description,
      lat,
      lon,
      location_id,
      source_host,
      source_port: source_port || 2101,
      source_user,
      source_pass,
      source_mount_point,
      carrier,
      nav_system,
      network,
      country,
      status: status || 'inactive'
    });
    
    // If station is active, set it up in relay service
    if (station.status === 'active') {
      await relayService.startRelay(station.id);
    }
    
    res.status(201).json({
      success: true,
      data: station,
      message: 'Station created successfully'
    });
  } catch (error) {
    logger.error('Error creating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create station'
    });
  }
});

// Update station (admin only)
router.put('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    const oldStatus = station.status;
    const {
      name,
      description,
      lat,
      lon,
      location_id,
      source_host,
      source_port,
      source_user,
      source_pass,
      source_mount_point,
      carrier,
      nav_system,
      network,
      country,
      status
    } = req.body;
    
    // Update fields
    if (name) station.name = name;
    if (description !== undefined) station.description = description;
    if (lat) station.lat = lat;
    if (lon) station.lon = lon;
    if (location_id) station.location_id = location_id;
    if (source_host) station.source_host = source_host;
    if (source_port) station.source_port = source_port;
    if (source_user !== undefined) station.source_user = source_user;
    if (source_pass !== undefined) station.source_pass = source_pass;
    if (source_mount_point) station.source_mount_point = source_mount_point;
    if (carrier !== undefined) station.carrier = carrier;
    if (nav_system !== undefined) station.nav_system = nav_system;
    if (network !== undefined) station.network = network;
    if (country !== undefined) station.country = country;
    if (status) station.status = status;
    
    await station.save();
    
    // Handle status changes for relay service
    if (oldStatus !== status) {
      if (status === 'active') {
        // Activate station
        await relayService.startRelay(station.id);
      } else if (status === 'inactive') {
        // Deactivate station
        await relayService.stopRelay(station.name);
      }
    } else if (status === 'active') {
      // Restart active station with new configuration
      await relayService.stopRelay(station.name);
      await relayService.startRelay(station.id);
    }
    
    res.status(200).json({
      success: true,
      data: station,
      message: 'Station updated successfully'
    });
  } catch (error) {
    logger.error(`Error updating station ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to update station'
    });
  }
});

// Delete station (admin only)
router.delete('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    // Stop station if active
    if (station.status === 'active') {
      await relayService.stopRelay(station.name);
    }
    
    await station.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Station deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting station ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete station'
    });
  }
});

// Start station (admin only)
router.post('/:id/start', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    // Update status
    station.status = 'active';
    await station.save();
    
    // Set up station in relay service
    const result = await relayService.startRelay(station.id);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to start station'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Station started successfully',
      data: station
    });
  } catch (error) {
    logger.error(`Error starting station ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to start station'
    });
  }
});

// Stop station (admin only)
router.post('/:id/stop', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    // Update status
    station.status = 'inactive';
    await station.save();
    
    // Stop station in relay service
    const result = await relayService.stopRelay(station.name);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to stop station'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Station stopped successfully',
      data: station
    });
  } catch (error) {
    logger.error(`Error stopping station ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop station'
    });
  }
});

// Get station statistics
router.get('/:id/stats', authenticateJWT, async (req, res) => {
  try {
    const station = await Station.findByPk(req.params.id);
    
    if (!station) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    // Get stats from relay service
    const stats = relayService.getStats();
    const stationStats = stats.activeStations.find(s => s.id === parseInt(req.params.id));
    
    res.status(200).json({
      success: true,
      data: stationStats || { 
        id: parseInt(req.params.id),
        name: station.name,
        status: 'inactive'
      }
    });
  } catch (error) {
    logger.error(`Error fetching station stats ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station statistics'
    });
  }
});

export default router;
