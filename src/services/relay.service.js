import { EventEmitter } from 'events';
import { Station, Location } from '../models/index.js';
import { logger } from '../utils/logger.js';
import NtripClient from '../ntrip/ntrip-client.js';
import NtripCaster from '../ntrip/ntrip-caster.js';

class RelayService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.caster = null;
    this.initialized = false;
  }

  /**
   * Initialize the relay service
   */
  async initialize() {
    if (this.initialized) {
      logger.info('NTRIP relay service already initialized');
      return;
    }
    
    try {
      logger.info('Initializing NTRIP relay service...');

      // Start NTRIP caster
      this.caster = new NtripCaster({
        host: process.env.NTRIP_CASTER_HOST || '0.0.0.0',
        port: parseInt(process.env.NTRIP_CASTER_PORT || '9001'),
        operator: process.env.NTRIP_CASTER_OPERATOR || 'NTRIP Relay Service'
      });
      
      this.caster.start();
      
      // Set up event handlers
      this.caster.on('clientConnected', this._onClientConnected.bind(this));
      this.caster.on('clientDisconnected', this._onClientDisconnected.bind(this));
      this.caster.on('error', (error) => {
        logger.error('NTRIP caster error:', error);
      });
      
      // First refresh source table to ensure caster has all stations
      await this.caster.refreshSourceTable();
      
      // Then load and start active stations from database
      await this._loadActiveStations();
      
      this.initialized = true;
      logger.info('NTRIP relay service initialized successfully');
      
      // Log caster info
      logger.info(`NTRIP caster running at ${process.env.NTRIP_CASTER_HOST || 'localhost'}:${process.env.NTRIP_CASTER_PORT || '9001'}`);
    } catch (error) {
      logger.error('Error initializing NTRIP relay service:', error);
      throw error;
    }
  }
  
  /**
   * Refresh source table from database
   * This updates the caster's station list with the latest information
   * and ensures relays are running for all active stations
   */
  async refreshSourceTable() {
    if (!this.caster) {
      logger.warn('Cannot refresh source table: caster not initialized');
      return false;
    }
    
    try {
      // First refresh the source table in the caster
      await this.caster.refreshSourceTable();
      logger.info('Source table refreshed in caster');
      
      // Then ensure all active stations have relays running
      const activeStations = await Station.findAll({
        where: { status: 'active' }
      });
      
      // Track current active relays
      const currentRelays = new Set(this.clients.keys());
      const databaseStations = new Set(activeStations.map(s => s.name));
      
      // Start relays for stations that don't have one running
      for (const station of activeStations) {
        try {
          if (!this.clients.has(station.name)) {
            logger.info(`Starting missing relay for station: ${station.name}`);
            await this.startRelay(station.id);
          }
        } catch (stationError) {
          logger.error(`Error starting relay for station ${station.name}:`, stationError);
          // Continue with other stations even if one fails
        }
      }
      
      // Stop relays for stations that are no longer active
      for (const stationName of currentRelays) {
        try {
          if (!databaseStations.has(stationName)) {
            logger.info(`Stopping relay for inactive station: ${stationName}`);
            await this.stopRelay(stationName);
          }
        } catch (stationError) {
          logger.error(`Error stopping relay for station ${stationName}:`, stationError);
          // Continue with other stations even if one fails
        }
      }
      
      logger.info('Source table and relays refreshed successfully');
      return true;
    } catch (error) {
      logger.error('Error refreshing source table:', error);
      return false;
    }
  }

  /**
   * Start a client connection to a source caster for a station
   * @param {Station} station - Station model instance
   */
  async startRelay(stationId) {
    try {
      // Find station in database
      const station = await Station.findByPk(stationId, {
        include: [{ model: Location }]
      });
      
      if (!station) {
        throw new Error(`Station not found with ID: ${stationId}`);
      }
      
      // Update station status to active
      if (station.status !== 'active') {
        station.status = 'active';
        await station.save();
      }
      
      // Check if client already exists
      if (this.clients.has(station.name)) {
        logger.info(`Relay already running for station: ${station.name}`);
        return { success: true, message: 'Relay already running', station };
      }
      
      // Check if caster is initialized
      if (!this.caster) {
        logger.error(`Cannot start relay for station ${station.name}: caster not initialized`);
        return { success: false, message: 'Caster not initialized', station };
      }
      
      // Add station to caster - skip if already exists
      try {
        // Check if station already exists in caster
        if (!this.caster.stations.has(station.name)) {
          this.caster.addStation({
            name: station.name,
            description: station.description,
            lat: parseFloat(station.lat),
            lon: parseFloat(station.lon),
            identifier: `VNM_${station.name}`,
            country: 'VNM',
            nmea: true
          });
        } else {
          logger.info(`Station ${station.name} already exists in caster, skipping add`);
        }
      } catch (stationError) {
        logger.warn(`Could not add station to caster: ${stationError.message}`);
        // Continue even if we can't add the station - it might already exist
      }
      
      // Create NTRIP client to source caster
      const client = new NtripClient({
        host: station.source_host,
        port: station.source_port,
        mountpoint: station.source_mount_point,
        username: station.source_user,
        password: station.source_pass,
        maxReconnectAttempts: 20,
        reconnectInterval: 5000
      });
      
      // Handle RTCM data from source
      client.on('rtcm', (data) => {
        // Pass the raw data buffer directly to broadcast without any modification
        const sentTo = this.caster.broadcast(station.name, data);
        if (sentTo > 0) {
          logger.debug(`Broadcasted ${data.length} bytes to ${sentTo} clients on ${station.name}`);
        }
      });
      
      // Handle connection events
      client.on('connected', () => {
        logger.info(`Connected to source caster for station ${station.name}`);
        
        // Send NMEA position from station's location
        const position = {
          lat: parseFloat(station.lat),
          lon: parseFloat(station.lon),
          alt: 100 // Default altitude
        };
        
        client.sendPosition(position);
        
        // Send position update periodically
        const intervalId = setInterval(() => {
          if (client.connected) {
            client.sendPosition(position);
          }
        }, 60000); // every minute
        
        // Store interval ID for cleanup
        this.clients.set(station.name, { client, intervalId, station });
      });
      
      client.on('disconnected', () => {
        logger.warn(`Disconnected from source caster for station ${station.name}`);
      });
      
      client.on('error', (error) => {
        logger.error(`Error in NTRIP client for station ${station.name}:`, error);
      });
      
      // Connect to source caster
      client.connect();
      
      logger.info(`Started relay for station: ${station.name}`);
      return { success: true, message: 'Relay started', station };
    } catch (error) {
      logger.error(`Error starting relay for station ID ${stationId}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Stop a relay for a station
   * @param {string} stationName - Station mount point name
   */
  async stopRelay(stationName) {
    try {
      let clientFound = false;
      
      // Check if client exists in our map
      if (this.clients.has(stationName)) {
        clientFound = true;
        const { client, intervalId } = this.clients.get(stationName);
        
        // Disconnect client
        if (client) {
          client.removeAllListeners();
          client.disconnect();
        }
        
        // Clear interval
        if (intervalId) {
          clearInterval(intervalId);
        }
        
        // Remove from clients map
        this.clients.delete(stationName);
        logger.info(`Stopped relay client for station: ${stationName}`);
      } else {
        logger.info(`No relay client found in map for station: ${stationName}`);
      }
      
      // Always attempt to remove from caster regardless of client existence
      if (this.caster && this.caster.stations.has(stationName)) {
        this.caster.removeStation(stationName);
        logger.info(`Removed station from caster: ${stationName}`);
        clientFound = true;
      } else {
        logger.info(`Station ${stationName} not found in caster`);
      }
      
      // Search for any orphaned client by station name (for recovery)
      for (const [name, data] of this.clients.entries()) {
        if (data.station && data.station.name === stationName) {
          if (data.client) {
            data.client.removeAllListeners();
            data.client.disconnect();
          }
          if (data.intervalId) {
            clearInterval(data.intervalId);
          }
          this.clients.delete(name);
          logger.info(`Stopped orphaned relay client for station: ${stationName} (mapped as ${name})`);
          clientFound = true;
        }
      }
      
      if (!clientFound) {
        logger.warn(`No relay or station found for: ${stationName}`);
        return { success: false, message: 'No relay or station found for this station' };
      }
      
      logger.info(`Successfully stopped relay for station: ${stationName}`);
      return { success: true, message: 'Relay stopped' };
    } catch (error) {
      logger.error(`Error stopping relay for station ${stationName}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Synchronize relay service state with database
   * This ensures that relay clients match active stations in database
   */
  async syncWithDatabase() {
    try {
      logger.info('Synchronizing relay service state with database');
      
      // Get all active stations from database
      const activeStations = await Station.findAll({
        where: { status: 'active' }
      });
      
      // Get current clients
      const currentStationNames = new Set(this.clients.keys());
      const dbStationNames = new Set(activeStations.map(s => s.name));
      
      logger.info(`Found ${activeStations.length} active stations in database and ${currentStationNames.size} active relays in memory`);
      
      // Start relays for stations in database but not in memory
      for (const station of activeStations) {
        if (!this.clients.has(station.name)) {
          logger.info(`Starting missing relay for station: ${station.name}`);
          try {
            await this.startRelay(station.id);
          } catch (startError) {
            logger.error(`Error starting relay for ${station.name}:`, startError);
          }
        }
      }
      
      // Stop relays for stations in memory but not active in database
      for (const stationName of currentStationNames) {
        if (!dbStationNames.has(stationName)) {
          logger.info(`Stopping relay for inactive station: ${stationName}`);
          try {
            await this.stopRelay(stationName);
          } catch (stopError) {
            logger.error(`Error stopping relay for ${stationName}:`, stopError);
          }
        }
      }
      
      // Refresh source table
      await this.refreshSourceTable();
      
      logger.info('Relay service synchronized with database');
      return true;
    } catch (error) {
      logger.error('Error synchronizing with database:', error);
      return false;
    }
  }

  /**
   * Get status of all relays
   */
  getStatus() {
    const status = {
      caster: this.caster ? this.caster.getStats() : { running: false },
      relays: []
    };
    
    for (const [stationName, { client, station }] of this.clients.entries()) {
      status.relays.push({
        station: stationName,
        description: station.description,
        sourceHost: station.source_host,
        sourceMountpoint: station.source_mount_point,
        connected: client.connected,
        lastDataReceived: client.lastDataReceived,
        clientStats: client.getStats()
      });
    }
    
    return status;
  }

  /**
   * Shutdown the relay service
   */
  async shutdown() {
    logger.info('Shutting down NTRIP relay service...');
    
    // Stop all client connections
    for (const [stationName, { client, intervalId }] of this.clients.entries()) {
      clearInterval(intervalId);
      client.removeAllListeners();
      client.disconnect();
      logger.info(`Disconnected client for station: ${stationName}`);
    }
    
    this.clients.clear();
    
    // Stop caster
    if (this.caster) {
      this.caster.removeAllListeners();
      this.caster.stop();
    }
    
    logger.info('NTRIP relay service shut down successfully');
  }

  /**
   * Load active stations from database and start relays
   * @private
   */
  async _loadActiveStations() {
    try {
      // Clear existing clients to prevent duplicates
      for (const [stationName, { client, intervalId }] of this.clients.entries()) {
        try {
          logger.info(`Cleaning up existing relay for station: ${stationName}`);
          if (client) {
            client.removeAllListeners();
            client.disconnect();
          }
          if (intervalId) {
            clearInterval(intervalId);
          }
        } catch (cleanupError) {
          logger.warn(`Error cleaning up station ${stationName}:`, cleanupError);
        }
      }
      
      // Clear client map
      this.clients.clear();
      
      // Get active stations from database
      const activeStations = await Station.findAll({
        where: { status: 'active' }
      });
      
      logger.info(`Found ${activeStations.length} active stations`);
      
      // Start relays for all active stations
      for (const station of activeStations) {
        try {
          logger.info(`Starting relay for station: ${station.name}`);
          await this.startRelay(station.id);
        } catch (stationError) {
          logger.error(`Error starting relay for station ${station.name}:`, stationError);
          // Continue with other stations even if one fails
        }
      }
    } catch (error) {
      logger.error('Error loading active stations:', error);
    }
  }

  /**
   * Handle client connected event
   * @private
   */
  _onClientConnected(event) {
    logger.info(`Rover ${event.username} connected to station ${event.mountpoint} from ${event.ip}`);
  }

  /**
   * Handle client disconnected event
   * @private
   */
  _onClientDisconnected(event) {
    logger.info(`Rover disconnected from station ${event.mountpoint}`);
  }
}

export default RelayService;
