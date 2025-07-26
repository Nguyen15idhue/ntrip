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
    if (this.initialized) return;
    
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
      
      // Load and start active stations from database
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
      
      // Add station to caster
      this.caster.addStation({
        name: station.name,
        description: station.description,
        lat: parseFloat(station.lat),
        lon: parseFloat(station.lon),
        identifier: `VNM_${station.name}`,
        country: 'VNM',
        nmea: true
      });
      
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
      // Check if client exists
      if (!this.clients.has(stationName)) {
        logger.info(`No relay running for station: ${stationName}`);
        return { success: false, message: 'No relay running for this station' };
      }
      
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
      
      // Remove from caster
      this.caster.removeStation(stationName);
      
      logger.info(`Stopped relay for station: ${stationName}`);
      return { success: true, message: 'Relay stopped' };
    } catch (error) {
      logger.error(`Error stopping relay for station ${stationName}:`, error);
      return { success: false, message: error.message };
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
      const activeStations = await Station.findAll({
        where: { status: 'active' }
      });
      
      logger.info(`Found ${activeStations.length} active stations`);
      
      for (const station of activeStations) {
        logger.info(`Starting relay for station: ${station.name}`);
        await this.startRelay(station.id);
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
