import net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { Rover, Station } from '../models/index.js';

/**
 * Enhanced NTRIP Caster Service
 * Acts as an NTRIP caster to broadcast RTCM data to clients
 */
class NtripCaster extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Default options
    this.options = {
      host: '0.0.0.0',
      port: 9001,
      operator: 'NTRIP Relay Service',
      country: 'VNM',
      ...options
    };
    
    this.server = null;
    this.clients = new Map();
    this.stations = new Map();
    this.running = false;
    this.stats = {
      totalConnections: 0,
      bytesTransferred: 0,
      activeClients: 0
    };
  }

  /**
   * Start the NTRIP caster server
   */
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

  /**
   * Stop the NTRIP caster server
   */
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

  /**
   * Add a virtual station to the caster
   * @param {Object} station - Station configuration
   * @returns {Object} Added station
   */
  addStation(station) {
    if (this.stations.has(station.name)) {
      throw new Error(`Station with mountpoint ${station.name} already exists`);
    }
    
    this.stations.set(station.name, { 
      ...station, 
      clients: new Set(),
      stats: {
        created: new Date(),
        bytesTransferred: 0,
        messagesTransferred: 0
      }
    });
    
    logger.info(`Added virtual station: ${station.name} (${station.description || 'No description'})`);
    this.emit('stationAdded', station);
    return station;
  }

  /**
   * Remove a virtual station from the caster
   * @param {string} mountpoint - Station mountpoint name
   * @returns {boolean} Success status
   */
  removeStation(mountpoint) {
    const station = this.stations.get(mountpoint);
    if (!station) return false;
    
    for (const clientId of station.clients) {
      const client = this.clients.get(clientId);
      if (client) client.socket.destroy();
    }
    
    this.stations.delete(mountpoint);
    
    logger.info(`Removed virtual station: ${mountpoint}`);
    this.emit('stationRemoved', station);
    return true;
  }

  /**
   * Broadcast RTCM data to all clients connected to a station
   * @param {string} mountpoint - Station mountpoint name
   * @param {Buffer} data - RTCM data buffer
   * @returns {number} Number of clients that received the data
   */
  broadcast(mountpoint, data) {
    const station = this.stations.get(mountpoint);
    if (!station) return 0;

    // Update station statistics
    station.stats.bytesTransferred += data.length;
    station.stats.messagesTransferred++;
    this.stats.bytesTransferred += data.length * station.clients.size;

    let successCount = 0;
    for (const clientId of station.clients) {
      const client = this.clients.get(clientId);
      if (client && client.socket) {
        try {
          // Check if it's a writable stream (socket)
          if (client.socket.writable !== false && !client.socket.destroyed) {
            // Important: Write the original buffer directly without modification
            // This ensures the data format is preserved exactly as received
            client.socket.write(data);
            successCount++;
            
            // Update client statistics
            client.stats.bytesReceived += data.length;
            client.stats.lastDataSent = new Date();
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

  /**
   * Get the sourcetable in NTRIP format
   * @returns {string} NTRIP sourcetable
   */
  getSourcetable() {
    // Generate NTRIP standard sourcetable
    let table = '';
    
    // Add stream entries (STR records) for each station
    for (const [mountpoint, station] of this.stations.entries()) {
      if (!station.active && !station.status) continue;
      
      const str = [
        'STR',                                             // Record type
        mountpoint,                                        // Mountpoint name
        station.identifier || mountpoint,                  // Source identifier
        station.format || 'RTCM 3.2',                     // Data format
        station.formatDetails || '1004(1),1005/1006(5),1019(5),1020(5)', // Format details
        station.carrier || '2',                            // Carrier phase (1=L1, 2=L1+L2)
        station.navSystem || 'GPS+GLO+GAL+BDS',           // Navigation system
        station.network || 'CORS',                        // Network type
        station.country || this.options.country,          // Country code
        station.lat.toFixed(4),                           // Latitude
        station.lon.toFixed(4),                           // Longitude
        station.nmea ? '1' : '0',                         // NMEA required
        station.solution || '1',                          // Solution type (0=single, 1=network)
        station.generator || 'NTRIP Relay/1.0',           // Generator/software
        station.compression || 'none',                    // Compression
        'B',                                              // Authentication required
        station.fee ? 'Y' : 'N',                          // Fee
        station.bitrate || '2400'                         // Bitrate
      ].join(';');
      
      table += str + '\r\n';
    }
    
    // Add caster entry (CAS record)
    const host = this.options.host === '0.0.0.0' ? 'localhost' : this.options.host;
    const cas = [
      'CAS',                                              // Record type
      host,                                               // Host
      this.options.port.toString(),                       // Port
      'VNM_NTRIP',                                        // Source identifier
      this.options.operator,                              // Operator
      '0',                                                // NMEA required
      this.options.country,                               // Country
      '16.0000',                                          // Latitude (center of Vietnam)
      '106.0000',                                         // Longitude (center of Vietnam)
      ''                                                  // Fallback host
    ].join(';');
    
    table += cas + '\r\n';
    
    // Add network entry (NET record)
    const net = [
      'NET',                                              // Record type
      'VNM_CORS',                                         // Network identifier
      this.options.operator,                              // Operator
      'B',                                                // Authentication required
      'N',                                                // No fee
      '',                                                 // Web address
      '',                                                 // Web registration
      'Vietnamese CORS Network Relay Service'             // Misc info
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

  /**
   * Get server statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      running: this.running,
      activeClients: this.clients.size,
      totalConnections: this.stats.totalConnections,
      bytesTransferred: this.stats.bytesTransferred,
      stations: Array.from(this.stations.entries()).map(([name, station]) => ({
        name,
        clientCount: station.clients.size,
        bytesTransferred: station.stats.bytesTransferred,
        messagesTransferred: station.stats.messagesTransferred
      }))
    };
  }

  /**
   * Handle a new raw TCP connection
   * @private
   */
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

  /**
   * Parse an HTTP request header string
   * @private
   */
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

  /**
   * Handle a parsed HTTP request
   * @private
   */
  async _handleParsedRequest(requestData, socket, clientIp) {
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
    try {
      const roverCredentials = await this._authenticateRover(headers.authorization, mountpoint);
      if (!roverCredentials) {
        logger.warn(`Authentication failed for request to ${mountpoint}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n');
        socket.write('WWW-Authenticate: Basic realm="NTRIP Caster"\r\n');
        socket.write('\r\n');
        socket.write('ERROR - Authentication failed');
        socket.destroy();
        return;
      }
      
      // Send NTRIP success response
      socket.write('ICY 200 OK\r\n\r\n');
      
      // Setup client for streaming
      this._setupRawClient(socket, mountpoint, clientIp, roverCredentials);
    } catch (error) {
      logger.error(`Authentication error: ${error.message}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\nERROR - Server error');
      socket.destroy();
    }
  }

  /**
   * Authenticate a rover using credentials
   * @private
   */
  async _authenticateRover(authHeader, mountpoint) {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return null;
    }
    
    try {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      
      logger.debug(`Authenticating rover with username: ${username} for mountpoint: ${mountpoint}`);
      
      // Find rover in database without requiring station link
      const rover = await Rover.findOne({ 
        where: { 
          username,
          status: 'active'
        }
        // Removed the include with Station condition to allow any rover to connect to any station
      });
      
      if (!rover) {
        logger.warn(`Authentication failed: Rover '${username}' not found or not active in database`);
        return null;
      }
      
      logger.debug(`Rover '${username}' found, validating password...`);
      
      // Validate password
      const isValid = await rover.validatePassword(password);
      if (!isValid) {
        logger.warn(`Authentication failed: Invalid password for rover '${username}'`);
        return null;
      }
      
      logger.debug(`Password validation successful for rover '${username}'`);
      
      // Update last connection time
      rover.last_connection = new Date();
      await rover.save();
      
      return {
        id: rover.id,
        username: rover.username,
        stationId: rover.station_id,
        userId: rover.user_id
      };
    } catch (error) {
      logger.error('Authentication error', error);
      throw error;
    }
  }

  /**
   * Setup a client after successful authentication
   * @private
   */
  _setupRawClient(socket, mountpoint, clientIp, roverCredentials) {
    const clientId = crypto.randomUUID();
    
    const client = {
      id: clientId,
      mountpoint,
      socket: socket,
      ip: clientIp,
      connected: new Date(),
      rover: roverCredentials,
      lastPosition: null,
      stats: {
        bytesReceived: 0,
        lastDataSent: null
      }
    };

    // Add client to maps
    this.clients.set(clientId, client);
    const station = this.stations.get(mountpoint);
    station.clients.add(clientId);
    this.stats.totalConnections++;
    this.stats.activeClients = this.clients.size;
    
    // Setup socket options for optimal performance
    socket.setKeepAlive(true, 30000);
    socket.setNoDelay(true); // Disable Nagle's algorithm for low latency

    logger.info(`Client ${clientId} (${roverCredentials.username}) connected to station ${mountpoint} from ${clientIp}`);
    this.emit('clientConnected', { 
      clientId, 
      mountpoint, 
      ip: clientIp,
      username: roverCredentials.username
    });

    socket.on('data', (data) => this._handleClientData(clientId, data));
    socket.on('close', () => this._removeClient(clientId));
    socket.on('error', (error) => {
      logger.error(`Client ${clientId} socket error`, error);
      this._removeClient(clientId);
    });
  }

  /**
   * Handle data from a client (NMEA messages)
   * @private
   */
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
            this.emit('clientPosition', { 
              clientId, 
              mountpoint: client.mountpoint, 
              position 
            });
            logger.debug(`Client ${clientId} position updated: ${JSON.stringify(position)}`);
          }
        }
      }
    }
  }

  /**
   * Parse a NMEA GGA sentence
   * @private
   */
  _parseGGA(gga) {
    try {
      const fields = gga.split(',');
      if (fields.length < 10) return null;
      const lat = parseInt(fields[2].substring(0, 2), 10) + parseFloat(fields[2].substring(2)) / 60.0;
      const lon = parseInt(fields[4].substring(0, 3), 10) + parseFloat(fields[4].substring(3)) / 60.0;
      return {
        lat: fields[3] === 'S' ? -lat : lat,
        lon: fields[5] === 'W' ? -lon : lon,
        alt: parseFloat(fields[9]),
        quality: parseInt(fields[6], 10),
        satellites: parseInt(fields[7], 10)
      };
    } catch (error) {
      logger.error('Error parsing GGA sentence', error);
      return null;
    }
  }

  /**
   * Remove a client from the caster
   * @private
   */
  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.debug(`Removing client ${clientId} - Current active clients: ${this.clients.size}`);

    const station = this.stations.get(client.mountpoint);
    if (station) {
      station.clients.delete(clientId);
    }
    
    if (client.socket && !client.socket.destroyed) {
        client.socket.destroy();
    }

    this.clients.delete(clientId);
    this.stats.activeClients = this.clients.size;
    
    logger.info(`Client ${clientId} disconnected from station ${client.mountpoint}`);
    this.emit('clientDisconnected', { 
      clientId, 
      mountpoint: client.mountpoint, 
      ip: client.ip,
      username: client.rover ? client.rover.username : 'unknown'
    });
  }
}

export default NtripCaster;
