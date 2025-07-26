import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION }
  );
};

// Generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
  );
};

// Register new user
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists with this email.'
      });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password_hash: password,
      role: 'user'
    });

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Registration failed:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Registration failed. Please try again later.'
    });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password.'
      });
    }

    // Validate password
    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password.'
      });
    }

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Login failed:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Login failed. Please try again later.'
    });
  }
};

// Refresh token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refresh token is required.'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    // Find user in database
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid refresh token. User not found.'
      });
    }

    // Generate new tokens
    const token = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully.',
      data: {
        token,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    logger.error('Token refresh failed:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid refresh token.'
    });
  }
};

// Get current user profile
export const getProfile = async (req, res) => {
  try {
    // User is already attached to req by authenticateJWT middleware
    const { id, name, email, role, created_at } = req.user;
    
    return res.status(200).json({
      success: true,
      data: {
        id,
        name,
        email,
        role,
        created_at
      }
    });
  } catch (error) {
    logger.error('Get profile failed:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get profile. Please try again later.'
    });
  }
};
