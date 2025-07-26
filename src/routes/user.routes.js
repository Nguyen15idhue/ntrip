import express from 'express';
import { User, Rover } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// Get all users (admin only)
router.get('/', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password_hash'] }
    });
    
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get user by ID (admin or self only)
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check authorization (admin can view any user, regular users can only view themselves)
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this user'
      });
    }
    
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error(`Error fetching user ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

// Create user (admin only)
router.post('/', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email }
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Create user
    const user = await User.create({
      name,
      email,
      password_hash: password,  // Will be hashed by model hook
      role: role || 'user'
    });
    
    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password_hash;
    
    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User created successfully'
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// Update user (admin or self only)
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check authorization (admin can update any user, regular users can only update themselves)
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this user'
      });
    }
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const { name, email, password, role } = req.body;
    
    // Update fields if provided
    if (name) {
      user.name = name;
    }
    
    if (email) {
      // Check if email is unique
      const existingUser = await User.findOne({
        where: { email }
      });
      
      if (existingUser && existingUser.id !== parseInt(userId)) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
      
      user.email = email;
    }
    
    if (password) {
      user.password_hash = password;  // Will be hashed by model hook
    }
    
    // Only admin can change role
    if (role && req.user.role === 'admin') {
      user.role = role;
    }
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password_hash;
    
    res.status(200).json({
      success: true,
      data: userResponse,
      message: 'User updated successfully'
    });
  } catch (error) {
    logger.error(`Error updating user ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Delete user (admin only)
router.delete('/:id', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user has rovers
    const roverCount = await Rover.count({
      where: { user_id: userId }
    });
    
    if (roverCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'User has associated rovers. Please delete or reassign them first.'
      });
    }
    
    await user.destroy();
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting user ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Get user's rovers
router.get('/:id/rovers', authenticateJWT, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check authorization (admin can view any user's rovers, regular users can only view their own)
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this user\'s rovers'
      });
    }
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const rovers = await Rover.findAll({
      where: { user_id: userId },
      include: { model: Station, attributes: ['id', 'name', 'description'] }
    });
    
    res.status(200).json({
      success: true,
      data: rovers
    });
  } catch (error) {
    logger.error(`Error fetching rovers for user ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user\'s rovers'
    });
  }
});

// Reset user password (admin only)
router.post('/:id/reset-password', [authenticateJWT, isAdmin], async (req, res) => {
  try {
    const userId = req.params.id;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update password
    user.password_hash = password;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'User password reset successfully'
    });
  } catch (error) {
    logger.error(`Error resetting password for user ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset user password'
    });
  }
});

export default router;
