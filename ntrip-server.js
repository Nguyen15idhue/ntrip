import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read configuration
const configPath = path.join(__dirname, 'ntrip-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Create a simple in-memory store
const store = {
  users: new Map(),
  stations: new Map(),
  connections: new Map(),
  clients: new Map()
};

// Initialize store with users from config
config.users.forEach(user => {
  store.users.set(user.username.toLowerCase(), {
    username: user.username,
    password: user.password,
    name: user.name,
    type: user.type
  });
});

/**
 * Simple logger
 */
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  debug: (message) => console.log(`[DEBUG] ${message}`),
  warn: (message) => console.log(`[WARN] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error || '')
};

/**
 * Simple authentication function
 * @param {string} authHeader - Authorization header
 * @returns {Object|null} User object or null if authentication fails
 */
function authenticate(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }
  
  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    const user = store.users.get(username.toLowerCase());
    
    if (user && user.password === password) {
      return user;
    }
  } catch (error) {
    logger.error('Authentication error', error);
  }
  
  return null;
}

/**
 * NTRIP Client Service
 * Connects to an NTRIP caster as a client to receive RTCM data
 */
class NtripClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      ...config.ntripClient,
      ...options
    };
    
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = this.options.maxReconnectAttempts || 10;
    this.reconnectInterval = this.options.reconnectInterval || 5000;
    this.lastDataReceived = null;
    this.lastPosition = null;
    this.rtcmData = Buffer.alloc(0);
    
    // Raw data logging for first minute
    this.rawDataLog = Buffer.alloc(0);
    this.logStartTime = null;
    this.logDuration = 60000; // 1 minute in milliseconds
    this.isLogging = false;
    this.logFilePath = path.join(__dirname, `rtcm_raw_data_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  }

  // ... (Các hàm connect, disconnect, sendPosition, _handle... giữ nguyên như cũ)
  connect() {
    if (this.socket) {
      this.disconnect();
    }

    logger.info(`Connecting to NTRIP caster: ${this.options.host}:${this.options.port}`);
    
    this.socket = new net.Socket();
    
    this.socket.on('connect', () => this._handleConnect());
    this.socket.on('data', (data) => this._handleData(data));
    this.socket.on('error', (error) => this._handleError(error));
    this.socket.on('close', () => this._handleClose());
    this.socket.on('timeout', () => this._handleTimeout());
    
    this.socket.connect({
      host: this.options.host,
      port: this.options.port
    });
    
    this.socket.setTimeout(this.options.timeout || 30000);
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.destroy();
        this.socket = null;
        this.connected = false;
        logger.info('Disconnected from NTRIP caster');
        this.emit('disconnected');
      } catch (error) {
        logger.error('Error disconnecting from NTRIP caster', error);
      }
    }
  }

  sendPosition(position) {
    if (!this.connected || !this.socket) {
      logger.warn('Cannot send position: Not connected to NTRIP caster');
      return false;
    }

    this.lastPosition = position;
    const nmea = this._formatNmeaGGA(position);
    
    try {
      this.socket.write(nmea);
      logger.debug(`Sent NMEA position to NTRIP caster: ${nmea.trim()}`);
      return true;
    } catch (error) {
      logger.error('Error sending position to NTRIP caster', error);
      return false;
    }
  }
  
  _handleConnect() {
    logger.info('Connected to NTRIP caster');
    const requestHeader = this._createRequestHeader();
    this.socket.write(requestHeader);
    this.reconnectAttempts = 0;
  }

  _handleData(data) {
    // Log raw data for first minute
    this._logRawData(data);
    
    if (!this.connected) {
      const response = data.toString();
      if (response.includes('ICY 200 OK')) {
        this.connected = true;
        logger.info('NTRIP caster authentication successful');
        this.emit('connected');
        
        // Start logging raw data
        this._startRawDataLogging();
        
        const headerEndIndex = response.indexOf('\r\n\r\n');
        if (headerEndIndex !== -1) {
          const rtcmData = data.subarray(headerEndIndex + 4);
          if (rtcmData.length > 0) {
            this._processRtcmData(rtcmData);
          }
        }
      } else if (response.includes('HTTP/1.1 401 Unauthorized')) {
        logger.error('NTRIP caster authentication failed');
        this.emit('error', new Error('Authentication failed'));
        this.disconnect();
      } else {
        logger.error(`Unexpected response from NTRIP caster: ${response}`);
        this.emit('error', new Error('Unexpected response'));
        this.disconnect();
      }
    } else {
      this._processRtcmData(data);
    }
  }

  _processRtcmData(data) {
    this.lastDataReceived = new Date();
    this.rtcmData = Buffer.concat([this.rtcmData, data]);
    let index = 0;
    while (index < this.rtcmData.length) {
      if (this.rtcmData[index] === 0xD3) {
        if (index + 3 > this.rtcmData.length) {
          break;
        }
        const len = ((this.rtcmData[index + 1] & 0x03) << 8) | this.rtcmData[index + 2];
        const messageLength = len + 6;
        if (index + messageLength <= this.rtcmData.length) {
          const rtcmMessage = this.rtcmData.subarray(index, index + messageLength);
          this.emit('rtcm', rtcmMessage);
          index += messageLength;
        } else {
          break;
        }
      } else {
        index++;
      }
    }
    if (index > 0) {
      this.rtcmData = this.rtcmData.subarray(index);
    }
  }

  _handleError(error) {
    logger.error('NTRIP client error', error);
    this.emit('error', error);
  }

  _handleClose() {
    this.connected = false;
    logger.info('Connection to NTRIP caster closed');
    this.emit('disconnected');
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Reconnecting to NTRIP caster (attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts})...`);
      setTimeout(() => { this.connect(); }, this.reconnectInterval);
    } else {
      logger.error('Max reconnect attempts reached');
      this.emit('error', new Error('Max reconnect attempts reached'));
    }
  }

  _handleTimeout() {
    logger.warn('NTRIP connection timeout');
    this.disconnect();
  }

  /**
   * Create the NTRIP request header
   * @returns {string} NTRIP request header
   */
  _createRequestHeader() {
    let auth = '';
    if (this.options.username && this.options.password) {
      const credentials = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64');
      auth = `Authorization: Basic ${credentials}\r\n`;
    }
    
    // **SỬA ĐỔI: Đã xóa 'Connection: close\r\n'**
    return (
      `GET /${this.options.mountpoint} HTTP/1.1\r\n` +
      `Host: ${this.options.host}:${this.options.port}\r\n` +
      `User-Agent: NTRIP NodeJS Client/1.0\r\n` +
      `Accept: */*\r\n` +
      auth +
      '\r\n'
    );
  }

  // ... (hàm _formatNmeaGGA giữ nguyên)
  _formatNmeaGGA(position) {
    const { lat, lon, alt } = position;
    const now = new Date();
    const hours = now.getUTCHours().toString().padStart(2, '0');
    const minutes = now.getUTCMinutes().toString().padStart(2, '0');
    const seconds = now.getUTCSeconds().toString().padStart(2, '0');
    const time = `${hours}${minutes}${seconds}.00`;
    const latDeg = Math.floor(Math.abs(lat));
    const latMin = (Math.abs(lat) - latDeg) * 60;
    const latStr = `${latDeg.toString().padStart(2, '0')}${latMin.toFixed(5).padStart(8, '0')}`;
    const latHem = lat >= 0 ? 'N' : 'S';
    const lonDeg = Math.floor(Math.abs(lon));
    const lonMin = (Math.abs(lon) - lonDeg) * 60;
    const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(5).padStart(8, '0')}`;
    const lonHem = lon >= 0 ? 'E' : 'W';
    const gga = [
      '$GPGGA', time, latStr, latHem, lonStr, lonHem, '4', '10', '1.0', alt.toFixed(2), 'M', '0.0', 'M', '', ''
    ].join(',');
    let checksum = 0;
    for (let i = 1; i < gga.length; i++) {
      checksum ^= gga.charCodeAt(i);
    }
    const checksumHex = checksum.toString(16).toUpperCase().padStart(2, '0');
    return `${gga}*${checksumHex}\r\n`;
  }

  /**
   * Start logging raw data for analysis
   */
  _startRawDataLogging() {
    if (this.isLogging) return;
    
    this.isLogging = true;
    this.logStartTime = new Date();
    this.rawDataLog = Buffer.alloc(0);
    
    logger.info(`Started logging raw RTCM data to: ${this.logFilePath}`);
    
    // Stop logging after specified duration
    setTimeout(() => {
      this._stopRawDataLogging();
    }, this.logDuration);
  }

  /**
   * Log raw data during the logging period
   */
  _logRawData(data) {
    if (!this.isLogging || !this.logStartTime) return;
    
    const elapsed = new Date() - this.logStartTime;
    if (elapsed <= this.logDuration) {
      this.rawDataLog = Buffer.concat([this.rawDataLog, data]);
    }
  }

  /**
   * Stop logging and save to file
   */
  _stopRawDataLogging() {
    if (!this.isLogging) return;
    
    this.isLogging = false;
    const logEndTime = new Date();
    const duration = logEndTime - this.logStartTime;
    
    try {
      // Create log content with metadata
      const metadata = `# RTCM Raw Data Log\n` +
                      `# Source: ${this.options.host}:${this.options.port}/${this.options.mountpoint}\n` +
                      `# Start Time: ${this.logStartTime.toISOString()}\n` +
                      `# End Time: ${logEndTime.toISOString()}\n` +
                      `# Duration: ${duration}ms (${(duration/1000).toFixed(2)}s)\n` +
                      `# Total Bytes: ${this.rawDataLog.length}\n` +
                      `# Data Format: Raw binary RTCM messages\n` +
                      `# ================================================\n\n`;
      
      // Convert binary data to hex string for readability
      const hexData = this.rawDataLog.toString('hex');
      
      // Format hex data with line breaks every 32 bytes (64 hex chars)
      const formattedHex = hexData.match(/.{1,64}/g).join('\n');
      
      // Also include binary analysis
      let analysis = '\n\n# RTCM Message Analysis:\n';
      analysis += this._analyzeRTCMMessages(this.rawDataLog);
      
      const fullContent = metadata + 'HEX DATA:\n' + formattedHex + analysis;
      
      // Save to file
      fs.writeFileSync(this.logFilePath, fullContent, 'utf8');
      
      logger.info(`Raw data logging completed:`);
      logger.info(`  File: ${this.logFilePath}`);
      logger.info(`  Duration: ${(duration/1000).toFixed(2)} seconds`);
      logger.info(`  Total bytes: ${this.rawDataLog.length}`);
      logger.info(`  Data rate: ${(this.rawDataLog.length / (duration/1000)).toFixed(2)} bytes/sec`);
      
    } catch (error) {
      logger.error('Error saving raw data log:', error);
    }
  }

  /**
   * Analyze RTCM messages in the raw data
   */
  _analyzeRTCMMessages(buffer) {
    let analysis = '';
    let index = 0;
    let messageCount = 0;
    const messageTypes = new Map();
    
    while (index < buffer.length) {
      if (buffer[index] === 0xD3) {
        if (index + 6 > buffer.length) break;
        
        // Parse RTCM header
        const byte1 = buffer[index + 1];
        const byte2 = buffer[index + 2];
        const length = ((byte1 & 0x03) << 8) | byte2;
        const messageLength = length + 6;
        
        if (index + messageLength <= buffer.length) {
          // Parse message type
          const byte3 = buffer[index + 3];
          const byte4 = buffer[index + 4];
          const messageType = (byte3 << 4) | (byte4 >> 4);
          
          // Parse station ID
          const byte5 = buffer[index + 5];
          const stationId = ((byte4 & 0x0F) << 8) | byte5;
          
          messageCount++;
          
          if (!messageTypes.has(messageType)) {
            messageTypes.set(messageType, { count: 0, lengths: [], stationIds: new Set() });
          }
          
          const typeInfo = messageTypes.get(messageType);
          typeInfo.count++;
          typeInfo.lengths.push(length);
          typeInfo.stationIds.add(stationId);
          
          index += messageLength;
        } else {
          break;
        }
      } else {
        index++;
      }
    }
    
    analysis += `# Total RTCM messages found: ${messageCount}\n`;
    analysis += `# Message types breakdown:\n`;
    
    for (const [type, info] of messageTypes.entries()) {
      const avgLength = info.lengths.reduce((a, b) => a + b, 0) / info.lengths.length;
      analysis += `#   Type ${type}: ${info.count} messages, avg length: ${avgLength.toFixed(1)} bytes, stations: [${Array.from(info.stationIds).join(', ')}]\n`;
    }
    
    return analysis;
  }
}

/**
 * NTRIP Caster Service (PHIÊN BẢN SỬA ĐỔI)
 * Acts as an NTRIP caster to broadcast RTCM data to clients
 */
class NtripCaster extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...config.ntripCaster, ...options };
    this.server = null;
    this.clients = new Map();
    this.stations = new Map();
    this.running = false;
  }

  start() {
    if (this.running) {
      logger.info('NTRIP caster already running');
      return;
    }

    // Create TCP server for raw socket connections
    this.server = net.createServer((socket) => {
      this._handleRawConnection(socket);
    });

    this.server.listen(this.options.port, this.options.host, () => {
      this.running = true;
      logger.info(`NTRIP caster started on ${this.options.host}:${this.options.port}`);
      this.emit('started');
    });

    this.server.on('error', (error) => {
      logger.error('NTRIP caster error', error);
      this.emit('error', error);
    });
  }

  stop() {
    if (!this.running || !this.server) return;
    for (const client of this.clients.values()) {
      client.socket.destroy();
    }
    this.clients.clear();
    this.stations.clear();
    this.server.close(() => {
      this.running = false;
      logger.info('NTRIP caster stopped');
      this.emit('stopped');
    });
  }

  addStation(station) {
    if (this.stations.has(station.mountpoint)) {
      throw new Error(`Station with mountpoint ${station.mountpoint} already exists`);
    }
    this.stations.set(station.mountpoint, { ...station, clients: new Set() });
    store.stations.set(station.mountpoint, station);
    logger.info(`Added virtual station: ${station.name} (${station.mountpoint})`);
    this.emit('stationAdded', station);
    return station;
  }

  removeStation(mountpoint) {
    const station = this.stations.get(mountpoint);
    if (!station) return false;
    for (const clientId of station.clients) {
      const client = this.clients.get(clientId);
      if (client) client.socket.destroy();
    }
    this.stations.delete(mountpoint);
    store.stations.delete(mountpoint);
    logger.info(`Removed virtual station: ${station.name} (${mountpoint})`);
    this.emit('stationRemoved', station);
    return true;
  }

  broadcast(mountpoint, data) {
    const station = this.stations.get(mountpoint);
    if (!station) return 0;

    let successCount = 0;
    for (const clientId of station.clients) {
      const client = this.clients.get(clientId);
      if (client && client.socket) {
        try {
          // Check if it's a writable stream (socket or response)
          if (client.socket.writable !== false && !client.socket.destroyed) {
            client.socket.write(data);
            successCount++;
          } else {
            logger.warn(`Client ${clientId} socket not writable, removing`);
            this._removeClient(clientId);
          }
        } catch (error) {
          logger.error(`Error sending data to client ${clientId}: ${error.message}`);
          this._removeClient(clientId);
        }
      } else if (client) {
        logger.warn(`Client ${clientId} socket missing, removing`);
        this._removeClient(clientId);
      }
    }
    return successCount;
  }

  getSourcetable() {
    // Generate NTRIP standard sourcetable
    let table = '';
    
    // Add stream entries (STR records) - Thông tin các trạm CORS
    for (const [mountpoint, station] of this.stations.entries()) {
      const str = [
        'STR',                                                    // Record type
        mountpoint,                                               // Mountpoint name
        station.identifier || mountpoint,                         // Source identifier
        station.format || 'RTCM 3.2',                            // Data format
        station.formatDetails || '1004(1),1005(60),1007(60),1012(1),1230(5)', // Format details (message types with rates)
        station.carrier || '2',                                   // Carrier phase (1=L1, 2=L1+L2)
        station.navSystem || 'GPS+GLO+GAL+BDS',                  // Navigation system
        station.network || 'VRS',                                // Network type (VRS, RTK, etc.)
        station.country || 'VNM',                                // Country code (ISO 3166)
        station.latitude.toFixed(4),                             // Latitude (degrees, 4 decimal places)
        station.longitude.toFixed(4),                            // Longitude (degrees, 4 decimal places)
        station.nmea ? '1' : '0',                                // NMEA required (0=no, 1=yes)
        station.solution || '1',                                 // Solution type (0=single, 1=network)
        station.generator || 'NTRIP/2.0',                        // Generator/software
        station.compression || 'none',                           // Compression (none, gzip)
        station.authentication ? 'B' : 'N',                     // Authentication (N=none, B=basic, D=digest)
        station.fee ? 'Y' : 'N',                                // Fee (Y=yes, N=no)
        station.bitrate || '2400'                               // Bitrate (bits per second)
      ].join(';');
      table += str + '\r\n';
    }
    
    // Add additional CORS stations for demonstration
    const corsStations = [
      {
        mountpoint: 'HNI_CAUGIAY',
        identifier: 'VNM001',
        latitude: 21.0362,
        longitude: 105.7905,
        name: 'Ha Noi - Cau Giay'
      },
      {
        mountpoint: 'HCM_QUAN1',
        identifier: 'VNM002', 
        latitude: 10.7769,
        longitude: 106.7009,
        name: 'Ho Chi Minh - Quan 1'
      },
      {
        mountpoint: 'DN_SONTRA',
        identifier: 'VNM003',
        latitude: 16.0544,
        longitude: 108.2022,
        name: 'Da Nang - Son Tra'
      },
      {
        mountpoint: 'HP_HONGBANG',
        identifier: 'VNM004',
        latitude: 20.8648,
        longitude: 106.6838,
        name: 'Hai Phong - Hong Bang'
      },
      {
        mountpoint: 'CT_NINHKIEU',
        identifier: 'VNM005',
        latitude: 10.0302,
        longitude: 105.7905,
        name: 'Can Tho - Ninh Kieu'
      }
    ];
    
    // Add CORS stations to sourcetable
    for (const cors of corsStations) {
      const str = [
        'STR',                                                    // Record type
        cors.mountpoint,                                          // Mountpoint name
        cors.identifier,                                          // Source identifier
        'RTCM 3.2',                                              // Data format
        '1004(1),1005(60),1007(60),1012(1),1230(5)',            // Format details
        '2',                                                     // Carrier phase (L1+L2)
        'GPS+GLO+GAL+BDS',                                       // Navigation system
        'CORS',                                                  // Network type
        'VNM',                                                   // Country code
        cors.latitude.toFixed(4),                                // Latitude
        cors.longitude.toFixed(4),                               // Longitude
        '1',                                                     // NMEA required
        '1',                                                     // Solution type (network)
        'NTRIP/2.0',                                            // Generator
        'none',                                                  // Compression
        'B',                                                     // Authentication required
        'N',                                                     // No fee
        '2400'                                                   // Bitrate
      ].join(';');
      table += str + '\r\n';
    }
    
    // Add caster entry (CAS record)
    const host = this.options.host === '0.0.0.0' ? 'localhost' : this.options.host;
    const cas = [
      'CAS',                                                      // Record type
      host,                                                       // Host
      this.options.port.toString(),                              // Port
      'VNM_NTRIP',                                               // Source identifier
      this.options.operator || 'Vietnam CORS Network',          // Operator
      '0',                                                       // NMEA required
      'VNM',                                                     // Country
      '16.0000',                                                 // Latitude (center of Vietnam)
      '106.0000',                                                // Longitude (center of Vietnam)
      ''                                                         // Fallback host (optional)
    ].join(';');
    table += cas + '\r\n';
    
    // Add network entry (NET record)
    const net = [
      'NET',                                                      // Record type
      'VNM_CORS',                                                // Network identifier
      this.options.operator || 'Vietnam CORS Network',          // Operator
      'B',                                                       // Authentication required
      'N',                                                       // No fee
      `http://localhost:${config.server.port}`,                 // Web address
      `http://localhost:${config.server.port}/register`,        // Web registration
      'Vietnamese CORS Network for RTK positioning'             // Misc info
    ].join(';');
    table += net + '\r\n';
    
    // End marker
    table += 'ENDSOURCETABLE\r\n';
    
    // Return complete sourcetable with proper NTRIP headers
    const header = 'SOURCETABLE 200 OK\r\n' +
                   'Content-Type: text/plain\r\n' +
                   'Server: NTRIP Caster/2.0\r\n' +
                   'Connection: close\r\n' +
                   '\r\n';
    
    return header + table;
  }

  _handleRawConnection(socket) {
    const clientIp = socket.remoteAddress;
    logger.debug(`New raw connection from ${clientIp}`);
    
    let requestBuffer = Buffer.alloc(0);
    let headersParsed = false;
    let requestData = null;

    const onData = (data) => {
      if (!headersParsed) {
        requestBuffer = Buffer.concat([requestBuffer, data]);
        const headerEnd = requestBuffer.indexOf('\r\n\r\n');
        
        if (headerEnd !== -1) {
          const headerStr = requestBuffer.subarray(0, headerEnd).toString();
          headersParsed = true;
          
          // Parse HTTP request
          requestData = this._parseHttpRequest(headerStr);
          if (!requestData) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\nERROR - Invalid request');
            socket.destroy();
            return;
          }
          
          // Handle the request
          this._handleParsedRequest(requestData, socket, clientIp);
          
          // Remove the data listener to prevent further header parsing
          socket.removeListener('data', onData);
          
          // If there's remaining data after headers, handle it as client data
          const remainingData = requestBuffer.subarray(headerEnd + 4);
          if (remainingData.length > 0) {
            // This would be NMEA data from client
            socket.emit('clientData', remainingData);
          }
        }
      }
    };

    socket.on('data', onData);
    socket.on('error', (error) => {
      logger.error(`Socket error from ${clientIp}:`, error);
      socket.destroy();
    });
    socket.on('close', () => {
      logger.debug(`Connection closed from ${clientIp}`);
    });
  }

  _parseHttpRequest(headerStr) {
    try {
      const lines = headerStr.split('\r\n');
      const requestLine = lines[0];
      const [method, url, version] = requestLine.split(' ');
      
      const headers = {};
      for (let i = 1; i < lines.length; i++) {
        const colonIndex = lines[i].indexOf(':');
        if (colonIndex !== -1) {
          const key = lines[i].substring(0, colonIndex).trim().toLowerCase();
          const value = lines[i].substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }
      
      return { method, url, version, headers };
    } catch (error) {
      logger.error('Error parsing HTTP request:', error);
      return null;
    }
  }

  _handleParsedRequest(requestData, socket, clientIp) {
    const { method, url, headers } = requestData;
    
    if (method !== 'GET') {
      socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\nERROR - Method not allowed');
      socket.destroy();
      return;
    }
    
    const mountpoint = url.slice(1);
    
    // Handle sourcetable requests
    if (!mountpoint || mountpoint === '') {
      const sourcetable = this.getSourcetable();
      socket.write(sourcetable);
      socket.destroy();
      return;
    }
    
    // Handle mountpoint requests
    const station = this.stations.get(mountpoint);
    if (!station) {
      logger.warn(`Station not found: ${mountpoint}`);
      socket.write('HTTP/1.1 404 Not Found\r\n\r\nERROR - Mountpoint not found');
      socket.destroy();
      return;
    }
    
    // Handle authentication
    let user = null;
    if (station.authentication) {
      user = authenticate(headers.authorization);
      if (!user) {
        logger.warn(`Authentication failed for request to ${mountpoint}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n');
        socket.write('WWW-Authenticate: Basic realm="NTRIP Caster"\r\n');
        socket.write('\r\n');
        socket.write('ERROR - Authentication failed');
        socket.destroy();
        return;
      }
    }
    
    // Send NTRIP success response
    socket.write('ICY 200 OK\r\n\r\n');
    
    // Setup client for streaming
    this._setupRawClient(socket, mountpoint, clientIp, user);
  }

  _setupRawClient(socket, mountpoint, clientIp, user) {
    const clientId = crypto.randomUUID();
    
    const client = {
      id: clientId,
      mountpoint,
      socket: socket,
      ip: clientIp,
      connected: new Date(),
      user: user,
      lastPosition: null,
      isRawSocket: true
    };

    this.clients.set(clientId, client);
    const station = this.stations.get(mountpoint);
    station.clients.add(clientId);

    const connectionId = crypto.randomUUID();
    store.connections.set(connectionId, {
        id: connectionId,
        clientId, mountpoint, username: user ? user.username : 'anonymous',
        ip: clientIp, connected: new Date(), isActive: true
    });
    
    logger.info(`[DEBUG] Client stored in memory - Total clients: ${this.clients.size}, Store connections: ${store.connections.size}`);
    
    socket.setKeepAlive(true, 30000);
    socket.setNoDelay(true);

    logger.info(`Client ${clientId} connected to station ${mountpoint} from ${clientIp}`);
    this.emit('clientConnected', { clientId, mountpoint, ip: clientIp });

    socket.on('data', (data) => this._handleClientData(clientId, data));
    socket.on('close', () => this._removeClient(clientId));
    socket.on('error', (error) => {
      logger.error(`Client ${clientId} socket error`, error);
      this._removeClient(clientId);
    });
  }

  _handleClientData(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const str = data.toString();
    if (str.startsWith('$')) {
      const nmeaStrings = str.split('\r\n').filter(line => line.startsWith('$'));
      for (const nmea of nmeaStrings) {
        if (nmea.startsWith('$GPGGA') || nmea.startsWith('$GNGGA')) {
          const position = this._parseGGA(nmea);
          if (position) {
            client.lastPosition = position;
            this.emit('clientPosition', { clientId, mountpoint: client.mountpoint, position });
            logger.debug(`Client ${clientId} position updated: ${JSON.stringify(position)}`);
          }
        }
      }
    }
  }

  _parseGGA(gga) {
    try {
      const fields = gga.split(',');
      if (fields.length < 10) return null;
      const lat = parseInt(fields[2].substring(0, 2), 10) + parseFloat(fields[2].substring(2)) / 60.0;
      const lon = parseInt(fields[4].substring(0, 3), 10) + parseFloat(fields[4].substring(3)) / 60.0;
      return {
        lat: fields[3] === 'S' ? -lat : lat,
        lon: fields[5] === 'W' ? -lon : lon,
        alt: parseFloat(fields[9])
      };
    } catch (error) {
      logger.error('Error parsing GGA sentence', error);
      return null;
    }
  }

  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info(`[DEBUG] Removing client ${clientId} - Before: ${this.clients.size} clients, ${store.connections.size} connections`);

    const station = this.stations.get(client.mountpoint);
    if (station) {
      station.clients.delete(clientId);
    }
    
    if (client.socket && !client.socket.destroyed) {
        client.socket.destroy();
    }

    this.clients.delete(clientId);
    
    for (const [id, connection] of store.connections.entries()) {
        if (connection.clientId === clientId) {
          connection.isActive = false;
          connection.disconnected = new Date();
          break;
        }
    }
    
    logger.info(`[DEBUG] Client removed - After: ${this.clients.size} clients, active connections: ${Array.from(store.connections.values()).filter(c => c.isActive).length}`);
    logger.info(`Client ${clientId} disconnected from station ${client.mountpoint}`);
    this.emit('clientDisconnected', { clientId, mountpoint: client.mountpoint, ip: client.ip });
  }
}

// ... (Phần còn lại của code: VirtualStationService, apiServer, hàm khởi tạo... giữ nguyên không đổi)

class VirtualStationService {
  constructor() {
    this.client = null;
    this.caster = null;
    this.initialized = false;
  }
  async initialize() {
    if (this.initialized) return;
    try {
      this.caster = new NtripCaster();
      this.caster.start();
      
      // Add multiple virtual stations if configured
      if (config.virtualStations && Array.isArray(config.virtualStations)) {
        for (const station of config.virtualStations) {
          this.caster.addStation(station);
          logger.info(`Added virtual station: ${station.name} (${station.mountpoint})`);
        }
      } else {
        // Add single virtual station (backward compatibility)
        const station = config.virtualStation;
        this.caster.addStation(station);
      }
      
      if (config.ntripClient.host) {
        this.client = new NtripClient();
        this.client.on('rtcm', (data) => { 
          // Broadcast to the main virtual station
          const mainStation = config.virtualStation || config.virtualStations[0];
          this.caster.broadcast(mainStation.mountpoint, data); 
        });
        this.client.on('connected', () => {
          const mainStation = config.virtualStation || config.virtualStations[0];
          if (mainStation.latitude && mainStation.longitude) {
            const position = { lat: mainStation.latitude, lon: mainStation.longitude, alt: 100 };
            this.client.sendPosition(position);
            setInterval(() => {
              if (this.client.connected) this.client.sendPosition(position);
            }, 60000);
          }
        });
        this.client.connect();
      } else {
        logger.warn('No NTRIP client source configured');
      }
      this.initialized = true;
      logger.info('Virtual station service initialized');
    } catch (error) {
      logger.error('Error initializing virtual station service', error);
      throw error;
    }
  }
}

const apiServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const urlPath = req.url.split('?')[0];
  if (req.method === 'GET') {
    if (urlPath === '/api/status') {
      const status = {
        server: { time: new Date(), uptime: process.uptime() },
        caster: {
          running: virtualStation.caster ? virtualStation.caster.running : false,
          stations: Array.from(store.stations.values()),
          connections: Array.from(store.connections.values()).filter(conn => conn.isActive),
          activeClients: virtualStation.caster ? Array.from(virtualStation.caster.clients.values()).map(client => ({
            id: client.id,
            mountpoint: client.mountpoint,
            ip: client.ip,
            connected: client.connected,
            username: client.user ? client.user.username : 'anonymous',
            isRawSocket: client.isRawSocket,
            lastPosition: client.lastPosition
          })) : []
        },
        client: {
          connected: virtualStation.client ? virtualStation.client.connected : false,
          lastDataReceived: virtualStation.client ? virtualStation.client.lastDataReceived : null
        }
      };
      res.statusCode = 200;
      res.end(JSON.stringify(status, null, 2));
      return;
    }
    if (urlPath === '/api/sourcetable') {
      if (virtualStation.caster) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(virtualStation.caster.getSourcetable());
      } else {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Caster not running' }));
      }
      return;
    }
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

const virtualStation = new VirtualStationService();
(async () => {
  try {
    await virtualStation.initialize();
    apiServer.listen(config.server.port, () => {
      logger.info(`API server running at http://localhost:${config.server.port}`);
    });
    logger.info('NTRIP server started successfully');
    logger.info(`NTRIP caster running at ${config.ntripCaster.host}:${config.ntripCaster.port}`);
    logger.info(`Available mountpoints: ${config.virtualStation.mountpoint}`);
  } catch (error) {
    logger.error('Failed to start server', error);
  }
})();

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  if (virtualStation.caster) virtualStation.caster.stop();
  if (virtualStation.client) virtualStation.client.disconnect();
  apiServer.close();
  process.exit(0);
});