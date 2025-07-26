import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sequelize from './config/database.js';
import { logger, stream } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import stationRoutes from './routes/station.routes.js';
import roverRoutes from './routes/rover.routes.js';
import locationRoutes from './routes/location.routes.js';

// Use API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/rovers', roverRoutes);
app.use('/api/locations', locationRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to NTRIP Relay API',
    version: '1.0.0',
    status: 'running'
  });
});

// Start server
const PORT = process.env.PORT || 3000;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Initialize NTRIP relay service
import RelayService from './services/relay.service.js';

// Database & server initialization
async function initialize() {
  try {
    // Connect to database
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info(`API server running on port ${PORT}`);
    });

    // Initialize NTRIP relay service
    const relayService = new RelayService();
    await relayService.initialize();
    
    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');
      
      // Stop the relay service first
      await relayService.shutdown();
      
      // Close the express server
      server.close(() => {
        logger.info('Express server closed');
        
        // Close database connection
        sequelize.close().then(() => {
          logger.info('Database connection closed');
          process.exit(0);
        });
      });
      
      // Force exit if graceful shutdown fails
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
}

initialize();
