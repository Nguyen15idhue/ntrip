import { EventEmitter } from 'events';
import { Station, Location } from '../models/index.js';
import { logger } from '../utils/logger.js';
import NtripClient from '../ntrip/ntrip-client.js';
import NtripCaster from '../ntrip/ntrip-caster.js';

class RelayService extends EventEmitter {
  constructor() {
    super();
    // Singleton pattern: The `export default new RelayService()` at the bottom
    // already ensures only one instance is created and shared.
    // The check inside the constructor is therefore redundant but harmless.
    if (RelayService._instance) {
      return RelayService._instance;
    }
    
    // Sửa đổi quan trọng: Tên thuộc tính của bạn là 'clients', không phải 'relays'
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

      if (this.clients.has(station.name)) {
        const { client } = this.clients.get(station.name);
        if (client && client.connected) {
           logger.info(`Relay for station ${station.name} is already running and connected.`);
           return { success: true, message: 'Relay already running.', station };
        }
        logger.info(`Relay for station ${station.name} exists but is not connected. Attempting to restart.`);
        await this.stopRelay(station.name, false);
      }
      
      if (!this.caster) {
        throw new Error('Caster is not initialized.');
      }
      
      this.caster.addStation({
        name: station.name,
        description: station.description,
        lat: parseFloat(station.lat),
        lon: parseFloat(station.lon),
        active: true,
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
        
        intervalId = setInterval(() => {
          if (client.connected) {
            client.sendPosition(position);
          }
        }, 60000);
      });
      
      client.on('disconnected', () => {
        logger.warn(`Relay disconnected from source for station ${station.name}`);
        if(intervalId) clearInterval(intervalId);
      });
      
      client.on('error', (error) => {
        logger.error(`Relay client error for station ${station.name}: ${error.message}`);
      });
      
      this.clients.set(station.name, { client, intervalId, station });
      client.connect();
      
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
      
      if (this.caster) {
        this.caster.removeStation(stationName);
      }
      
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
   * Synchronizes the running relays with the database state.
   */
  async syncWithDatabase() {
    try {
      logger.info('Synchronizing relay service state with database...');
      
      if (this.caster) {
        await this.caster.refreshSourceTable();
      }

      const activeDbStations = await Station.findAll({ where: { status: 'active' } });
      const activeDbStationNames = new Set(activeDbStations.map(s => s.name));
      const runningRelayNames = new Set(this.clients.keys());
      
      for (const station of activeDbStations) {
        if (!runningRelayNames.has(station.name)) {
          logger.info(`[SYNC] Found active station ${station.name} in DB without a running relay. Starting...`);
          await this.startRelay(station.id);
        }
      }
      
      for (const stationName of runningRelayNames) {
        if (!activeDbStationNames.has(stationName)) {
          logger.info(`[SYNC] Found running relay for ${stationName} which is inactive in DB. Stopping...`);
          await this.stopRelay(stationName, false);
        }
      }
      
      logger.info('Relay service synchronized with database.');
      return true;
    } catch (error) {
      logger.error('Error synchronizing with database:', error);
      return false;
    }
  }

  // ===== START: CÁC HÀM ĐÃ SỬA LỖI =====

  /**
   * Lấy trạng thái của một trạm cụ thể.
   * @param {number} stationId - ID của trạm cần lấy trạng thái.
   * @returns {object|null} - Trả về object trạng thái hoặc null nếu không tìm thấy.
   */
  getStationStatus(stationId) {
      // SỬA ĐỔI: Lặp qua `this.clients.values()` thay vì `this.relays`
      const allRelayData = Array.from(this.clients.values());
      
      // SỬA ĐỔI: Tìm kiếm dựa trên `data.station.id`
      const relayData = allRelayData.find(data => data.station.id === stationId);
      
      if (!relayData) {
          return null; // Trạm không hoạt động (không có trong bộ nhớ)
      }

      const { station, client } = relayData;
      
      // Lấy số lượng client (rover) đang kết nối tới mountpoint này từ caster
      const clientsConnected = this.caster.getMountpoint(station.name)?.clients?.size || 0;

      // SỬA ĐỔI: Trả về dữ liệu từ cấu trúc đúng (`station` và `client`)
      return {
          stationId: station.id,
          stationName: station.name,
          status: 'active', // Nếu nó tồn tại trong 'clients' thì nó đang active
          sourceConnected: client.connected, // Trạng thái kết nối đến nguồn
          sourceHost: client.options.host,
          sourceMountpoint: client.options.mountpoint,
          clientsConnected: clientsConnected, // Số lượng rover đang kết nối
          startTime: client.startTime, // Giả sử client có thuộc tính này
      };
  }

  /**
   * Lấy trạng thái tổng quan của toàn bộ dịch vụ.
   * @returns {object} - Trạng thái tổng quan.
   */
  getStatus() {
      // SỬA ĐỔI: Lặp qua `this.clients.values()`
      const activeRelays = Array.from(this.clients.values()).map(relayData => {
          const { station, client } = relayData;
          const clientsConnected = this.caster.getMountpoint(station.name)?.clients?.size || 0;
          return {
              stationId: station.id,
              stationName: station.name,
              sourceConnected: client.connected,
              clientsConnected: clientsConnected,
          };
      });

      return {
          casterStatus: this.caster ? 'running' : 'stopped',
          totalRoversConnected: this.caster ? this.caster.clients.size : 0, // Tổng số rover kết nối đến caster
          totalRelaysRunning: this.clients.size, // Tổng số relay đang chạy
          relays: activeRelays,
      };
  }
  
  // ===== END: CÁC HÀM ĐÃ SỬA LỖI =====

  async shutdown() {
    logger.info('Shutting down NTRIP relay service...');
    
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

// Export một instance duy nhất để đảm bảo toàn bộ ứng dụng dùng chung.
export default new RelayService();