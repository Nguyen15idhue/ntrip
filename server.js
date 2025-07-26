/**
 * NTRIP Server Professional Edition
 * Main Server Entry Point
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';

// Import internal modules
import { NtripManager } from './src/services/ntrip-manager.js';
import { UserManager } from './src/services/user-manager.js';
import logger from './src/utils/logger.js';
import apiRoutes from './src/routes/index.js';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Create Express application
const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Request logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Parse JSON bodies
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later.' }
});
app.use('/api', apiLimiter);

// API routes
app.use('/api', apiRoutes);

// Serve static files for web interface (when built)
app.use(express.static(path.join(__dirname, 'public')));

// Initialize NTRIP Manager
const ntripManager = new NtripManager();
const userManager = new UserManager();

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`HTTP API server started on port ${PORT}`);

  // Start NTRIP services after HTTP server is running
  ntripManager.startAllServices()
    .then(() => {
      logger.info('All NTRIP services started successfully');
    })
    .catch(error => {
      logger.error('Failed to start NTRIP services:', error);
    });
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await ntripManager.stopAllServices();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await ntripManager.stopAllServices();
  process.exit(0);
});

// Export managers for testing
export { ntripManager, userManager };
