import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';

// Global admin credentials for basic auth - move to environment variables in production
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Basic Authentication middleware
export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Basic authentication required.' 
    });
  }

  try {
    // Decode base64 credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');
    
    // Simple authentication - match against hardcoded admin credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Find admin user in database to attach to request
      const adminUser = await User.findOne({ where: { role: 'admin' } });
      
      if (adminUser) {
        // Attach admin user to request for backward compatibility
        req.user = adminUser;
        logger.debug(`Basic auth successful for admin: ${username}`);
        return next();
      }
    }
    
    // If hardcoded check fails, try to find a matching user in database
    const user = await User.findOne({ where: { email: username } });
    
    if (user && await user.validatePassword(password)) {
      req.user = user;
      logger.debug(`Basic auth successful for user: ${username}`);
      return next();
    }
    
    // Authentication failed
    logger.warn(`Basic auth failed for: ${username}`);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid username or password.' 
    });
  } catch (error) {
    logger.error('Authentication error:', error);
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
