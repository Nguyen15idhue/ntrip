import { EventEmitter } from 'events';
import { Station } from '../models/index.js'; // Chỉ cần Station ở đây vì Location đã được include ở route
import { logger } from '../utils/logger.js';
import NtripClient from '../ntrip/ntrip-client.js';
import NtripCaster from '../ntrip/ntrip-caster.js';
import net from 'net';

// Hằng số cấu hình thời gian timeout cho dữ liệu RTCM (tính bằng mili-giây)
// Nếu không nhận được dữ liệu trong khoảng thời gian này, coi như nguồn đã offline.
const RTCM_DATA_TIMEOUT_MS = 15000; // 15 giây

class RelayService extends EventEmitter {
  constructor() {
    super();
    if (RelayService._instance) {
      return RelayService._instance;
    }
    
    // Key: station.name, Value: { client, intervalId, station, lastDataTimestamp }
    this.clients = new Map();
    this.caster = null;
    this.initialized = false;
    RelayService._instance = this;
  }

  /**
   * Khởi tạo dịch vụ relay. Chỉ nên được gọi một lần.
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
   * Bắt đầu một relay cho một trạm cụ thể.
   * @param {number} stationId - ID của trạm cần bắt đầu.
   * @returns {Promise<{success: boolean, message: string, station?: object}>}
   */
  async startRelay(stationId) {
    try {
      const station = await Station.findByPk(stationId);
      if (!station) {
        throw new Error(`Station not found with ID: ${stationId}`);
      }

      if (this.clients.has(station.name)) {
        const existingRelay = this.clients.get(station.name);
        if (existingRelay.client && existingRelay.client.connected) {
           logger.info(`Relay for station ${station.name} is already running.`);
           return { success: true, message: 'Relay already running.', station };
        }
        logger.info(`Relay for station ${station.name} exists but is not connected. Restarting.`);
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
      
      // === Cấu trúc trạng thái mới cho mỗi relay ===
      const relayState = {
        client: client,
        intervalId: null,
        station: station,
        lastDataTimestamp: null, // Theo dõi thời điểm nhận dữ liệu cuối cùng
      };
      
      client.on('rtcm', (data) => {
        // Cập nhật timestamp mỗi khi nhận được dữ liệu RTCM
        relayState.lastDataTimestamp = Date.now();
        this.caster.broadcast(station.name, data);
      });
      
      client.on('connected', () => {
        logger.info(`Relay connected to source for station ${station.name}`);
        const position = { lat: parseFloat(station.lat), lon: parseFloat(station.lon), alt: 100 };
        client.sendPosition(position);
        
        relayState.intervalId = setInterval(() => {
          if (client.connected) {
            client.sendPosition(position);
          }
        }, 60000);
      });
      
      client.on('disconnected', () => {
        logger.warn(`Relay disconnected from source for station ${station.name}`);
        relayState.lastDataTimestamp = null; // Reset khi ngắt kết nối
        if(relayState.intervalId) clearInterval(relayState.intervalId);
      });
      
      client.on('error', (error) => {
        logger.error(`Relay client error for station ${station.name}: ${error.message}`);
      });
      
      this.clients.set(station.name, relayState);
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
   * Dừng một relay cho một trạm.
   * @param {string} stationName - Tên của trạm cần dừng.
   * @param {boolean} updateDb - Có cập nhật trạng thái của trạm trong CSDL hay không.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async stopRelay(stationName, updateDb = true) {
    try {
      const relayData = this.clients.get(stationName);

      if (relayData) {
        const { client, intervalId } = relayData;
        if (intervalId) clearInterval(intervalId);
        if (client) {
            client.removeAllListeners();
            client.disconnect();
        }
        this.clients.delete(stationName);
        logger.info(`Stopped relay client for station: ${stationName}`);
      } else {
        logger.warn(`No active relay found for station ${stationName}. Nothing to stop.`);
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
   * Đồng bộ hóa các relay đang chạy với trạng thái trong CSDL.
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
  
  // ====================================================================
  // ===== CÁC HÀM LẤY TRẠNG THÁI (STATUS) ĐÃ CẬP NHẬT LOGIC MỚI =====
  // ====================================================================

  /**
   * Lấy trạng thái kết nối tới nguồn của tất cả các relay đang chạy, dựa trên luồng dữ liệu.
   * @returns {Map<string, boolean>} - Map với key là station.name và value là true (online) hoặc false (offline).
   */
  getAllSourceStatuses() {
    const statuses = new Map();
    const now = Date.now();

    for (const relayData of this.clients.values()) {
      if (relayData.station && relayData.client) {
        const isConnectedTCP = relayData.client.connected;
        const lastDataTimestamp = relayData.lastDataTimestamp;

        // Điều kiện để "online":
        // 1. Phải có kết nối TCP.
        // 2. Phải đã từng nhận được dữ liệu (timestamp không null).
        // 3. Lần nhận dữ liệu cuối cùng phải trong khoảng thời gian timeout cho phép.
        const isDataFlowing = lastDataTimestamp && (now - lastDataTimestamp < RTCM_DATA_TIMEOUT_MS);
        
        const isOnline = isConnectedTCP && isDataFlowing;
        
        statuses.set(relayData.station.name, isOnline);
      }
    }
    return statuses;
  }
  
  /**
   * Lấy trạng thái chi tiết của một trạm cụ thể.
   * @param {number} stationId - ID của trạm cần lấy trạng thái.
   * @returns {object|null} - Trả về object trạng thái hoặc null nếu trạm không hoạt động.
   */
  getStationStatus(stationId) {
      const allRelayData = Array.from(this.clients.values());
      const relayData = allRelayData.find(data => data.station.id === stationId);
      
      if (!relayData) {
          return null;
      }

      const { station, client, lastDataTimestamp } = relayData;
      const clientsConnected = this.caster.getMountpoint(station.name)?.clients?.size || 0;
      const isDataFlowing = lastDataTimestamp && (Date.now() - lastDataTimestamp < RTCM_DATA_TIMEOUT_MS);
      const isOnline = client.connected && isDataFlowing;

      return {
          stationId: station.id,
          stationName: station.name,
          status: 'active',
          sourceConnected: isOnline,
          sourceHost: client.options.host,
          sourceMountpoint: client.options.mountpoint,
          clientsConnected: clientsConnected,
          startTime: client.startTime,
      };
  }

   /**
   * Lấy trạng thái tổng quan của toàn bộ dịch vụ.
   * @returns {object} - Trạng thái tổng quan.
   */
  getStatus() {
      const statuses = this.getAllSourceStatuses(); // Dùng lại hàm đã có logic đúng
      const activeRelays = Array.from(this.clients.values()).map(relayData => {
          const { station } = relayData;
          const clientsConnected = this.caster.getMountpoint(station.name)?.clients?.size || 0;
          return {
              stationId: station.id,
              stationName: station.name,
              sourceConnected: statuses.get(station.name) || false,
              clientsConnected: clientsConnected,
          };
      });

      return {
          casterStatus: this.caster ? 'running' : 'stopped',
          totalRoversConnected: this.caster ? this.caster.clients.size : 0,
          totalRelaysRunning: this.clients.size,
          relays: activeRelays,
      };
  }

  /**
   * Lấy danh sách các kết nối của Rover đang hoạt động.
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

  /**
   * Lấy danh sách mountpoint từ một nguồn NTRIP bên ngoài.
   */
  fetchMountpointsFromSource({ host, port, username, password }) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let responseData = '';

      socket.on('data', (data) => { responseData += data.toString(); });

      socket.on('close', () => {
        try {
          if (!responseData.includes('SOURCETABLE 200 OK')) {
             if (responseData.includes('401 Unauthorized')) {
                return reject(new Error('Unauthorized. Please check your credentials.'));
             }
             return reject(new Error('Failed to get a valid sourcetable. The source might be down or unreachable.'));
          }

          const lines = responseData.split('\r\n');
          const mountpoints = lines
            .filter(line => line.startsWith('STR;'))
            .map(line => {
              const fields = line.split(';');
              return {
                mountpoint: fields[1] || '', identifier: fields[2] || '',
                format: fields[3] || '', formatDetails: fields[4] || '',
                carrier: fields[5] || '', navSystem: fields[6] || '',
                network: fields[7] || '', country: fields[8] || '',
                latitude: parseFloat(fields[9]) || 0, longitude: parseFloat(fields[10]) || 0,
                nmea: fields[12] === '1', solution: fields[13] === '1',
                generator: fields[14] || '', authentication: fields[16] || 'N',
              };
            });
          resolve(mountpoints);
        } catch (parseError) {
          reject(new Error(`Error parsing sourcetable: ${parseError.message}`));
        }
      });
      
      socket.on('error', (err) => reject(new Error(`Connection error: ${err.message}`)));
      socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('Connection timed out.')); });

      socket.connect(port, host, () => {
        let request = `GET / HTTP/1.1\r\nHost: ${host}:${port}\r\nUser-Agent: NodeJS-NTRIP-Client\r\nConnection: close\r\n`;
        if (username && password) {
            request += `Authorization: Basic ${Buffer.from(`${username}:${password}`).toString('base64')}\r\n`;
        }
        request += `\r\n`;
        socket.write(request);
      });
    });
  }

  /**
   * Dọn dẹp và tắt dịch vụ relay.
   */
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
}

// Export một instance duy nhất (singleton) để toàn bộ ứng dụng dùng chung.
export default new RelayService();