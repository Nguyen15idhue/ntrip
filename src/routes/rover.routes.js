import express from 'express';
import { Rover, User, Station } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// Get all rovers (admin sees all, users see only their rovers)
router.get('/', authenticateJWT, async (req, res) => {
  try {
    let rovers;
    
    // Admins see all rovers, regular users see only their rovers
    if (req.user.role === 'admin') {
      rovers = await Rover.findAll({
        include: [
          { model: User, attributes: ['id', 'name', 'email'] },
          { model: Station, attributes: ['id', 'name', 'description'] }
        ]
      });
    } else {
      rovers = await Rover.findAll({
        where: { user_id: req.user.id },
        include: [
          { model: User, attributes: ['id', 'name', 'email'] },
          { model: Station, attributes: ['id', 'name', 'description'] }
        ]
      });
    }
    
    res.status(200).json({
      success: true,
      data: rovers
    });
  } catch (error) {
    logger.error('Error fetching rovers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rovers'
    });
  }
});

// Get rover by ID
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const roverId = req.params.id;
    
    // Find the rover
    const rover = await Rover.findByPk(roverId, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Station, attributes: ['id', 'name', 'description'] }
      ]
    });
    
    if (!rover) {
      return res.status(404).json({
        success: false,
        message: 'Rover not found'
      });
    }
    
    // Check if user is authorized to view this rover
    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this rover'
      });
    }
    
    res.status(200).json({
      success: true,
      data: rover
    });
  } catch (error) {
    logger.error(`Error fetching rover ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rover'
    });
  }
});

// Create new rover
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const {
      username,
      password,
      station_id,
      user_id,
      description,
      status
    } = req.body;
    
    // Validate required fields
    if (!username || !password || !station_id) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, and station_id are required'
      });
    }
    
    // Check if rover username already exists
    const existingRover = await Rover.findOne({
      where: { username }
    });
    
    if (existingRover) {
      return res.status(400).json({
        success: false,
        message: 'Rover with this username already exists'
      });
    }
    
    // Check if station exists
    const station = await Station.findByPk(station_id);
    if (!station) {
      return res.status(400).json({
        success: false,
        message: 'Station not found'
      });
    }
    
    // Determine user_id (admin can create for other users, regular users create for themselves)
    let effectiveUserId = req.user.id;
    if (req.user.role === 'admin' && user_id) {
      // Admin can specify user_id
      const user = await User.findByPk(user_id);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Specified user not found'
        });
      }
      effectiveUserId = user_id;
    }
    
    // Create rover
    const rover = await Rover.create({
      username,
      password_hash: password,  // Will be hashed by the model hook
      station_id,
      user_id: effectiveUserId,
      description,
      status: status || 'active'
    });
    
    // Remove password from response
    const roverResponse = rover.toJSON();
    delete roverResponse.password_hash;
    
    res.status(201).json({
      success: true,
      data: roverResponse,
      message: 'Rover created successfully'
    });
  } catch (error) {
    logger.error('Error creating rover:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create rover'
    });
  }
});

// Update rover
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const roverId = req.params.id;
    
    // Find the rover
    const rover = await Rover.findByPk(roverId);
    
    if (!rover) {
      return res.status(404).json({
        success: false,
        message: 'Rover not found'
      });
    }
    
    // Check if user is authorized to update this rover
    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this rover'
      });
    }
    
    const {
      username,
      password,
      station_id,
      user_id,
      description,
      status
    } = req.body;
    
    // Update fields if provided
    if (username) {
      // Check if username is unique
      const existingRover = await Rover.findOne({
        where: { username }
      });
      
      if (existingRover && existingRover.id !== parseInt(roverId)) {
        return res.status(400).json({
          success: false,
          message: 'Rover with this username already exists'
        });
      }
      
      rover.username = username;
    }
    
    if (password) {
      rover.password_hash = password;  // Will be hashed by model hook
    }
    
    if (station_id) {
      // Check if station exists
      const station = await Station.findByPk(station_id);
      if (!station) {
        return res.status(400).json({
          success: false,
          message: 'Station not found'
        });
      }
      
      rover.station_id = station_id;
    }
    
    // Admin can change user_id
    if (req.user.role === 'admin' && user_id) {
      const user = await User.findByPk(user_id);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Specified user not found'
        });
      }
      
      rover.user_id = user_id;
    }
    
    if (description !== undefined) {
      rover.description = description;
    }
    
    if (status) {
      rover.status = status;
    }
    
    await rover.save();
    
    // Remove password from response
    const roverResponse = rover.toJSON();
    delete roverResponse.password_hash;
    
    res.status(200).json({
      success: true,
      data: roverResponse,
      message: 'Rover updated successfully'
    });
  } catch (error) {
    logger.error(`Error updating rover ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rover'
    });
  }
});

// Delete rover
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const roverId = req.params.id;
    
    // Find the rover
    const rover = await Rover.findByPk(roverId);
    
    if (!rover) {
      return res.status(404).json({
        success: false,
        message: 'Rover not found'
      });
    }
    
    // Check if user is authorized to delete this rover
    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this rover'
      });
    }
    
    await rover.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Rover deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting rover ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete rover'
    });
  }
});

// Reset rover password
router.post('/:id/reset-password', authenticateJWT, async (req, res) => {
  try {
    const roverId = req.params.id;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }
    
    // Find the rover
    const rover = await Rover.findByPk(roverId);
    
    if (!rover) {
      return res.status(404).json({
        success: false,
        message: 'Rover not found'
      });
    }
    
    // Check if user is authorized to reset password for this rover
    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reset password for this rover'
      });
    }
    
    // Update password
    rover.password_hash = password;
    await rover.save();
    
    res.status(200).json({
      success: true,
      message: 'Rover password reset successfully'
    });
  } catch (error) {
    logger.error(`Error resetting password for rover ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset rover password'
    });
  }
});

export default router;
