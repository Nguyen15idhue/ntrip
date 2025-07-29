import express from 'express';
import { Rover, User, Station } from '../models/index.js';
import { authenticateJWT, isAdmin } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { Op } from 'sequelize';

const router = express.Router();

// Helper function to format rover response
const formatRoverResponse = (roverInstance) => {
    const roverJson = roverInstance.toJSON();
    // Ensure the virtual field is included
    roverJson.is_currently_active = roverInstance.is_currently_active;
    delete roverJson.password_hash;
    return roverJson;
};

// Get all rovers - REFACTORED for proper authorization
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const queryOptions = {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Station, attributes: ['id', 'name'] }
      ]
    };

    // If user is not an admin, only show rovers belonging to them
    if (req.user.role !== 'admin') {
      queryOptions.where = { user_id: req.user.id };
    }

    const rovers = await Rover.findAll(queryOptions);
    
    // Format response to include virtual field
    const formattedRovers = rovers.map(formatRoverResponse);

    res.status(200).json({ success: true, data: formattedRovers });
  } catch (error) {
    logger.error('Error fetching rovers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rovers' });
  }
});

// Create new rover - REFACTORED with date fields
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { username, password, station_id, user_id, description, status, start_date, end_date } = req.body;

    if (!username || !password || !station_id) {
      return res.status(400).json({ success: false, message: 'Username, password, and station_id are required.' });
    }
    
    // Validate date logic
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
        return res.status(400).json({ success: false, message: 'Start date cannot be after end date.' });
    }

    if (await Rover.findOne({ where: { username } })) {
      return res.status(400).json({ success: false, message: 'Rover with this username already exists.' });
    }
    
    let effectiveUserId = req.user.id;
    if (req.user.role === 'admin' && user_id) {
        if (!(await User.findByPk(user_id))) {
            return res.status(400).json({ success: false, message: 'Specified user not found.' });
        }
        effectiveUserId = user_id;
    }

    const rover = await Rover.create({
      username,
      password_hash: password, // Hashed by hook
      station_id,
      user_id: effectiveUserId,
      description,
      status: status || 'active',
      start_date: start_date || null,
      end_date: end_date || null
    });
    
    res.status(201).json({
      success: true,
      data: formatRoverResponse(rover),
      message: 'Rover created successfully.'
    });
  } catch (error) {
    logger.error('Error creating rover:', error);
    res.status(500).json({ success: false, message: 'Failed to create rover.' });
  }
});

// *** NEW: BULK ROVER ACTIONS ***
router.post('/bulk-action', [authenticateJWT, isAdmin], async (req, res) => {
    const { action, roverIds } = req.body;

    if (!action || !['activate', 'deactivate', 'delete'].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid action. Must be 'activate', 'deactivate', or 'delete'." });
    }
    if (!roverIds || !Array.isArray(roverIds) || roverIds.length === 0) {
        return res.status(400).json({ success: false, message: 'roverIds must be a non-empty array.' });
    }

    const results = { succeeded: [], failed: [] };
    const whereClause = { id: { [Op.in]: roverIds } };

    try {
        if (action === 'delete') {
            const numDeleted = await Rover.destroy({ where: whereClause });
            results.succeeded = roverIds; // Assume all specified were targeted
            logger.info(`Bulk deleted ${numDeleted} rovers.`);
        } else {
            const newStatus = action === 'activate' ? 'active' : 'inactive';
            const [numUpdated] = await Rover.update({ status: newStatus }, { where: whereClause });
            results.succeeded = roverIds;
            logger.info(`Bulk updated ${numUpdated} rovers to status '${newStatus}'.`);
        }
        res.status(200).json({ success: true, message: `Bulk action '${action}' completed.`, results });
    } catch (error) {
        logger.error(`Bulk action '${action}' failed:`, error);
        res.status(500).json({ success: false, message: 'An error occurred during the bulk operation.' });
    }
});

// Get rover by ID - REFACTORED for proper authorization
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const rover = await Rover.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Station, attributes: ['id', 'name'] }
      ]
    });
    
    if (!rover) {
      return res.status(404).json({ success: false, message: 'Rover not found.' });
    }

    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    
    res.status(200).json({ success: true, data: formatRoverResponse(rover) });
  } catch (error) {
    logger.error(`Error fetching rover ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to fetch rover.' });
  }
});


// Update rover - REFACTORED with date fields
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const rover = await Rover.findByPk(req.params.id);
    if (!rover) {
      return res.status(404).json({ success: false, message: 'Rover not found.' });
    }

    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const { username, password, station_id, user_id, description, status, start_date, end_date } = req.body;
    
    // Validate date logic
    const finalStartDate = start_date !== undefined ? start_date : rover.start_date;
    const finalEndDate = end_date !== undefined ? end_date : rover.end_date;
    if (finalStartDate && finalEndDate && new Date(finalStartDate) > new Date(finalEndDate)) {
        return res.status(400).json({ success: false, message: 'Start date cannot be after end date.' });
    }

    if (username) rover.username = username;
    if (password) rover.password_hash = password; // Hashed by hook
    if (station_id) rover.station_id = station_id;
    if (description !== undefined) rover.description = description;
    if (status) rover.status = status;
    if (start_date !== undefined) rover.start_date = start_date;
    if (end_date !== undefined) rover.end_date = end_date;
    
    if (req.user.role === 'admin' && user_id) {
      rover.user_id = user_id;
    }
    
    await rover.save();
    
    res.status(200).json({
      success: true,
      data: formatRoverResponse(rover),
      message: 'Rover updated successfully.'
    });
  } catch (error) {
    logger.error(`Error updating rover ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update rover.' });
  }
});

// Delete rover - Authorization checked
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const rover = await Rover.findByPk(req.params.id);
    if (!rover) {
      return res.status(404).json({ success: false, message: 'Rover not found.' });
    }

    if (req.user.role !== 'admin' && rover.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    
    await rover.destroy();
    
    res.status(200).json({ success: true, message: 'Rover deleted successfully.' });
  } catch (error) {
    logger.error(`Error deleting rover ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to delete rover.' });
  }
});

export default router;