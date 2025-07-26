import express from 'express';
import { Location } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Get all locations
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const locations = await Location.findAll();
    res.status(200).json({
      success: true,
      data: locations
    });
  } catch (error) {
    logger.error('Error fetching locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch locations'
    });
  }
});

// Get location by ID
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: location
    });
  } catch (error) {
    logger.error(`Error fetching location ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location'
    });
  }
});

// Create new location (admin only)
router.post('/', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const { province_name, lat, lon } = req.body;
    
    // Validate required fields
    if (!province_name || !lat || !lon) {
      return res.status(400).json({
        success: false,
        message: 'Province name, latitude, and longitude are required'
      });
    }
    
    // Check if province already exists
    const existingLocation = await Location.findOne({
      where: { province_name }
    });
    
    if (existingLocation) {
      return res.status(400).json({
        success: false,
        message: 'Province already exists'
      });
    }
    
    const location = await Location.create({
      province_name,
      lat,
      lon
    });
    
    res.status(201).json({
      success: true,
      data: location,
      message: 'Location created successfully'
    });
  } catch (error) {
    logger.error('Error creating location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create location'
    });
  }
});

// Update location (admin only)
router.put('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const { province_name, lat, lon } = req.body;
    const location = await Location.findByPk(req.params.id);
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }
    
    // Update fields
    if (province_name) location.province_name = province_name;
    if (lat) location.lat = lat;
    if (lon) location.lon = lon;
    
    await location.save();
    
    res.status(200).json({
      success: true,
      data: location,
      message: 'Location updated successfully'
    });
  } catch (error) {
    logger.error(`Error updating location ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
});

// Delete location (admin only)
router.delete('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }
    
    await location.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting location ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete location'
    });
  }
});

export default router;
