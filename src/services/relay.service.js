import { EventEmitter } from 'events';
import { Station, Location } from '../models/index.js';
import { logger } from '../utils/logger.js';
import NtripClient from '../ntrip/ntrip-client.js';
import NtripCaster from '../ntrip/ntrip-caster.js';

class RelayService extends EventEmitter {
  constructor() {
    super();
    // Ngăn chặn việc tạo nhiều instance nếu đã có
    if (RelayService._instance) {
      return RelayService._instance;
    }
    
    this.clients = new Map(); // Key: station.name, Value: { client, intervalId, station }
    this.caster = null;
    this.initialized = false;
    RelayService._instance = this;
  }

  /**
   * Initialize the relay service. This should only be called once.
   */
  async initialize() {
    if (this.initialized) {
      logger.info('NTRIP relay service already initialized.');
      return;
    }
    
    try {
      logger.info('Initializing NTRIP relay service...');

      this.caster = new NtripCaster({
        host: process.env.NTRIP_CASTER_HOST || '0.0.0.0',
        port: parseInt(process.env.NTRIP_CASTER_PORT || '9001'),
        operator: process.env.NTRIP_CASTER_OPERATOR || 'NTRIP Relay Service'
      });
      
      this.caster.start();
      
      this.caster.on('error', (error) => logger.error('NTRIP caster error:', error));
      
      // Load stations and sync state with DB
      await this.syncWithDatabase();
      
      this.initialized = true;
      logger.info('NTRIP relay service initialized successfully.');
      logger.info(`NTRIP caster running at ${this.caster.options.host}:${this.caster.options.port}`);
    } catch (error) {
      logger.error('Failed to initialize NTRIP relay service:', error);
      throw error;
    }
  }

  /**
   * Start a relay for a specific station. Idempotent.
   * @param {number} stationId - The ID of the station to start.
   * @returns {Promise<{success: boolean, message: string, station?: object}>}
   */
  async startRelay(stationId) {
    try {
      const station = await Station.findByPk(stationId);
      if (!station) {
        throw new Error(`Station not found with ID: ${stationId}`);
      }

      // Idempotency check: If relay is already running for this station, do nothing.
      if (this.clients.has(station.name)) {
        const { client } = this.clients.get(station.name);
        if (client && client.connected) {
           logger.info(`Relay for station ${station.name} is already running and connected.`);
           return { success: true, message: 'Relay already running.', station };
        }
        // If client exists but not connected, we should stop it first before restarting.
        logger.info(`Relay for station ${station.name} exists but is not connected. Attempting to restart.`);
        await this.stopRelay(station.name, false); // false to not update DB status
      }
      
      if (!this.caster) {
        throw new Error('Caster is not initialized.');
      }
      
      // Add or update station info in the caster.
      this.caster.addStation({
        name: station.name,
        description: station.description,
        lat: parseFloat(station.lat),
        lon: parseFloat(station.lon),
        active: true, // Mark as active for sourcetable
        status: true
      });
      
      const client = new NtripClient({
        host: station.source_host,
        port: station.source_port,
        mountpoint: station.source_mount_point,
        username: station.source_user,
        password: station.source_pass,
      });

      let intervalId = null;
      
      client.on('rtcm', (data) => {
        this.caster.broadcast(station.name, data);
      });
      
      client.on('connected', () => {
        logger.info(`Relay connected to source for station ${station.name}`);
        const position = { lat: parseFloat(station.lat), lon: parseFloat(station.lon), alt: 100 };
        client.sendPosition(position);
        
        // Periodically send position to keep connection alive
        intervalId = setInterval(() => {
          if (client.connected) {
            client.sendPosition(position);
          }
        }, 60000);
      });
      
      client.on('disconnected', () => {
        logger.warn(`Relay disconnected from source for station ${station.name}`);
        // Cleanup interval when disconnected to prevent orphaned timers
        if(intervalId) clearInterval(intervalId);
      });
      
      client.on('error', (error) => {
        logger.error(`Relay client error for station ${station.name}: ${error.message}`);
      });
      
      // Store client and interval immediately
      this.clients.set(station.name, { client, intervalId, station });

      // Start the connection
      client.connect();
      
      // Update DB status
      if (station.status !== 'active') {
        station.status = 'active';
        await station.save();
      }
      
      logger.info(`Started relay for station: ${station.name}`);
      return { success: true, message: 'Relay started successfully.', station };
    } catch (error) {
      logger.error(`Error starting relay for station ID ${stationId}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Stop a relay for a station. Idempotent.
   * @param {string} stationName - The name (mountpoint) of the station to stop.
   * @param {boolean} updateDb - Whether to update the station's status in the database.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async stopRelay(stationName, updateDb = true) {
    try {
      const relayData = this.clients.get(stationName);

      // Idempotency check: If no relay is running, consider it a success.
      if (!relayData) {
        logger.warn(`No active relay found for station ${stationName}. Nothing to stop.`);
      } else {
        const { client, intervalId } = relayData;
        
        if (intervalId) clearInterval(intervalId);
        
        if (client) {
            client.removeAllListeners();
            client.disconnect();
        }
        
        this.clients.delete(stationName);
        logger.info(`Stopped relay client for station: ${stationName}`);
      }
      
      // Always try to remove from caster to ensure clean state
      if (this.caster) {
        this.caster.removeStation(stationName);
      }
      
      // Update DB status if requested
      if (updateDb) {
        const station = await Station.findOne({ where: { name: stationName } });
        if (station && station.status !== 'inactive') {
          station.status = 'inactive';
          await station.save();
          logger.info(`Updated station ${stationName} status to inactive in DB.`);
        }
      }
      
      return { success: true, message: 'Relay stopped successfully.' };
    } catch (error) {
      logger.error(`Error stopping relay for station ${stationName}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Synchronizes the running relays with the database state. This is the single source of truth for state management.
   */
  async syncWithDatabase() {
    try {
      logger.info('Synchronizing relay service state with database...');
      
      // First, tell the caster to refresh its own list from the DB.
      if (this.caster) {
        await this.caster.refreshSourceTable();
      }

      const activeDbStations = await Station.findAll({ where: { status: 'active' } });
      const activeDbStationNames = new Set(activeDbStations.map(s => s.name));
      const runningRelayNames = new Set(this.clients.keys());
      
      // Start relays for stations that are active in DB but not running in memory.
      for (const station of activeDbStations) {
        if (!runningRelayNames.has(station.name)) {
          logger.info(`[SYNC] Found active station ${station.name} in DB without a running relay. Starting...`);
          await this.startRelay(station.id);
        }
      }
      
      // Stop relays that are running in memory but are inactive in DB.
      for (const stationName of runningRelayNames) {
        if (!activeDbStationNames.has(stationName)) {
          logger.info(`[SYNC] Found running relay for ${stationName} which is inactive in DB. Stopping...`);
          await this.stopRelay(stationName, false); // Don't need to update DB, it's already inactive.
        }
      }
      
      logger.info('Relay service synchronized with database.');
      return true;
    } catch (error) {
      logger.error('Error synchronizing with database:', error);
      return false;
    }
  }

  /**
   * Get overall status of the service.
   */
  getStatus() {
    const status = {
      caster: this.caster ? this.caster.getStats() : { running: false },
      relays: []
    };
    
    for (const [stationName, { client, station }] of this.clients.entries()) {
      status.relays.push({
        stationId: station.id,
        stationName,
        connected: client.connected,
        stats: client.getStats()
      });
    }
    
    return status;
  }

  /**
   * Gracefully shut down the relay service.
   */
  async shutdown() {
    logger.info('Shutting down NTRIP relay service...');
    
    // Stop all client connections
    const stationNames = Array.from(this.clients.keys());
    for (const stationName of stationNames) {
      await this.stopRelay(stationName, false);
    }
    
    this.clients.clear();
    
    if (this.caster) {
      this.caster.stop();
    }
    
    logger.info('NTRIP relay service shut down successfully.');
  }
  // Thêm hàm này vào trong class RelayService

  /**
   * Get a list of currently active connections with their real-time status.
   * @returns {Array<object>} A list of active connections.
   */
  getActiveConnections() {
    if (!this.caster || !this.caster.clients) {
      return [];
    }

    const connections = [];
    for (const client of this.caster.clients.values()) {
      connections.push({
        sessionId: client.id,
        roverId: client.rover.id,
        roverUsername: client.rover.username,
        mountpoint: client.mountpoint,
        ipAddress: client.ip,
        connectedAt: client.connectedAt,
        gnssStatus: client.gnssStatus,
        lastPosition: client.lastPosition,
        lastPositionUpdate: client.lastPositionUpdate
      });
    }
    return connections;
  }
}

// Export a single instance for the entire application
export default new RelayService();