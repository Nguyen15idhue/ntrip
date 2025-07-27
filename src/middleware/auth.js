import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';

// JWT Authentication middleware
export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Bearer token required.' 
    });
  }

  try {
    // Get token from header
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by ID from token payload
    const user = await User.findByPk(decoded.id);
    
    if (!user) {
      logger.warn(`JWT auth failed: User not found for id ${decoded.id}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. User not found.'
      });
    }
    
    // Attach user to request for use in controllers
    req.user = user;
    logger.debug(`JWT auth successful for user: ${user.email}`);
    return next();
  } catch (error) {
    logger.error('JWT authentication error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed.' 
    });
  }
};

// Check if user is admin
export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Admin role required.' 
    });
  }
  next();
};
