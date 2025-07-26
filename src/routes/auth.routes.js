import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Register a new user
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Refresh token
router.post('/refresh-token', authController.refreshToken);

// Get current user profile (requires authentication)
router.get('/profile', authenticateJWT, authController.getProfile);

export default router;
