import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sequelize from './config/database.js';
import { logger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// FIX: Import the singleton instance of the RelayService
import relayService from './services/relay.service.js';

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

// ======================= CẬP NHẬT Ở ĐÂY =======================
// Middleware
// Cấu hình CORS để chỉ cho phép frontend truy cập
const corsOptions = {
  // Lấy URL của frontend từ biến môi trường để linh hoạt
  // giữa môi trường dev và production.
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
// =============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import stationRoutes from './routes/station.routes.js';
import roverRoutes from './routes/rover.routes.js';
import locationRoutes from './routes/location.routes.js';
import statusRoutes from './routes/status.routes.js';

// Use API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/rovers', roverRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/status', statusRoutes);

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

// Database & server initialization
async function initialize() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    // Initialize NTRIP relay service using the singleton instance
    await relayService.initialize();

    const server = app.listen(PORT, () => {
      logger.info(`API server running on port ${PORT}`);
    });
    
    const shutdown = async () => {
      logger.info('Shutting down...');
      await relayService.shutdown();
      
      server.close(() => {
        logger.info('Express server closed.');
        sequelize.close().then(() => {
          logger.info('Database connection closed.');
          process.exit(0);
        });
      });
      
      setTimeout(() => {
        logger.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

initialize();