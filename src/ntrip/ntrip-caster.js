import net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { Rover, Station, User } from '../models/index.js';

class NtripCaster extends EventEmitter {
  constructor(options = {}) {
    super();
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
  }

  start() {
    if (this.running) {
      logger.info('NTRIP caster is already running.');
      return;
    }
    this.server = net.createServer((socket) => this._handleRawConnection(socket));
    this.server.listen(this.options.port, this.options.host, () => {
      this.running = true;
      logger.info(`NTRIP caster started on ${this.options.host}:${this.options.port}`);
      this.emit('started');
    });
    this.server.on('error', (error) => {
      logger.error('NTRIP caster server error', error);
      this.emit('error', error);
    });
  }

  stop() {
    if (!this.running || !this.server) return;
    this.clients.forEach(client => client.socket.destroy());
    this.clients.clear();
    this.stations.clear();
    this.server.close(() => {
      this.running = false;
      logger.info('NTRIP caster stopped.');
      this.emit('stopped');
    });
  }

  addStation(station) {
    const existingStation = this.stations.get(station.name);
    if (existingStation) {
      const updatedStation = { ...existingStation, ...station };
      this.stations.set(station.name, updatedStation);
      return updatedStation;
    }
    const newStation = { ...station, clients: new Set(), stats: { bytesTransferred: 0 } };
    this.stations.set(station.name, newStation);
    logger.info(`Added new station to caster: ${station.name}`);
    this.emit('stationAdded', newStation);
    return newStation;
  }

  removeStation(mountpoint) {
    const station = this.stations.get(mountpoint);
    if (!station) return false;
    station.clients.forEach(clientId => this.clients.get(clientId)?.socket.destroy());
    this.stations.delete(mountpoint);
    logger.info(`Removed station from caster: ${mountpoint}`);
    this.emit('stationRemoved', { mountpoint });
    return true;
  }

  broadcast(mountpoint, data) {
    const station = this.stations.get(mountpoint);
    if (!station || station.clients.size === 0) return 0;
    station.clients.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client?.socket.writable) {
        client.socket.write(data);
      }
    });
    return station.clients.size;
  }
  
  getSourcetable() {
    let table = '';
    this.stations.forEach((station, mountpoint) => {
        if (!station.active || !station.lat || !station.lon) return;
        const str = ['STR', mountpoint, station.identifier || mountpoint, station.format || 'RTCM 3.2', station.formatDetails || '1004(1),1005/1006(5),1019(5),1020(5)', '2', 'GPS+GLO+GAL+BDS', 'CORS', this.options.country, station.lat.toFixed(4), station.lon.toFixed(4), '1', '1', 'NTRIP-JS-Relay/1.0', 'none', 'B', 'N', '2400'].join(';');
        table += str + '\r\n';
    });
    const host = this.options.host === '0.0.0.0' ? '127.0.0.1' : this.options.host;
    table += ['CAS', host, this.options.port.toString(), 'VN_CASTER', this.options.operator, '0', this.options.country, '16.0000', '106.0000', ''].join(';') + '\r\n';
    table += ['NET', 'VN_NETWORK', this.options.operator, 'B', 'N', '', '', 'Vietnam CORS Network Relay'].join(';') + '\r\n';
    table += 'ENDSOURCETABLE\r\n';
    const header = 'SOURCETABLE 200 OK\r\nServer: NTRIP-JS-Caster/1.0\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n';
    return header + table;
  }

  async refreshSourceTable() {
    try {
      const activeDbStations = await Station.findAll({ where: { status: 'active' } });
      const activeDbStationNames = new Set(activeDbStations.map(s => s.name));
      const currentCasterStations = new Set(this.stations.keys());
      for (const dbStation of activeDbStations) this.addStation({ name: dbStation.name, description: dbStation.description, lat: parseFloat(dbStation.lat), lon: parseFloat(dbStation.lon), active: true });
      for (const stationName of currentCasterStations) if (!activeDbStationNames.has(stationName)) this.removeStation(stationName);
      logger.info(`Caster sourcetable refreshed. Total active stations: ${this.stations.size}`);
    } catch (error) {
      logger.error('Error refreshing caster sourcetable:', error);
    }
  }

  _handleRawConnection(socket) {
    let requestBuffer = Buffer.alloc(0);
    const onData = (data) => {
      requestBuffer = Buffer.concat([requestBuffer, data]);
      const headerEnd = requestBuffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        socket.removeListener('data', onData);
        const headerStr = requestBuffer.subarray(0, headerEnd).toString();
        const requestData = this._parseHttpRequest(headerStr);
        if (requestData) {
          this._handleParsedRequest(requestData, socket);
          // Handle any NMEA data that was sent along with headers
          const remainingData = requestBuffer.subarray(headerEnd + 4);
          if (remainingData.length > 0) {
              socket.emit('clientData', remainingData);
          }
        } else {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        }
      }
    };
    socket.on('data', onData);
    socket.on('error', (err) => logger.error(`Socket error: ${err.message}`));
  }

  _parseHttpRequest(headerStr) {
    try {
      const lines = headerStr.split('\r\n');
      const [method, url] = lines[0].split(' ');
      const headers = Object.fromEntries(lines.slice(1).map(l => l.split(/:\s*/, 2)).filter(a => a[0]));
      return { method, url, headers };
    } catch { return null; }
  }

  async _handleParsedRequest(requestData, socket) {
    const { method, url, headers } = requestData;
    const mountpoint = url.startsWith('/') ? url.slice(1) : url;

    if (method === 'GET' && mountpoint === '') return socket.end(this.getSourcetable());

    if (method === 'GET' && mountpoint) {
      if (!this.stations.has(mountpoint)) return socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      const roverCreds = await this._authenticateRover(headers.Authorization);
      if (!roverCreds) return socket.end('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic\r\n\r\n');
      
      socket.write('ICY 200 OK\r\n\r\n');
      this._setupRawClient(socket, mountpoint, roverCreds);
      return;
    }
    socket.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
  }

  async _authenticateRover(authHeader) {
    if (!authHeader?.startsWith('Basic ')) return null;
    try {
      const [username, password] = Buffer.from(authHeader.slice(6), 'base64').toString().split(':');
      const rover = await Rover.findOne({ where: { username } });
      if (rover && await rover.validatePassword(password) && rover.is_currently_active) {
        rover.last_connection = new Date();
        await rover.save();
        return { id: rover.id, username: rover.username };
      }
    } catch (e) { logger.error('Auth error:', e); }
    return null;
  }

  _setupRawClient(socket, mountpoint, rover) {
    const clientId = crypto.randomUUID();
    const client = {
      id: clientId,
      mountpoint,
      socket,
      ip: socket.remoteAddress,
      rover,
      connectedAt: new Date(),
      // --- NEW: Add fields for real-time status ---
      gnssStatus: 'N/A',
      lastPosition: null,
      lastPositionUpdate: null
    };
    
    this.clients.set(clientId, client);
    this.stations.get(mountpoint).clients.add(clientId);

    socket.setKeepAlive(true, 30000).setNoDelay(true);

    logger.info(`Client ${clientId} (${rover.username}) connected to ${mountpoint} from ${client.ip}.`);
    this.emit('clientConnected', client);

    // --- NEW: Listen for data from this specific client ---
    const handleData = (data) => this._handleClientData(clientId, data);
    socket.on('data', handleData);
    // Also listen for the initial data packet that might have come with headers
    socket.on('clientData', handleData);

    socket.on('close', () => {
      socket.removeListener('data', handleData); // Clean up listener
      this._removeClient(clientId);
    });
    socket.on('error', () => this._removeClient(clientId));
  }
  
  // --- NEW: Handle incoming NMEA data from a connected client ---
  _handleClientData(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const str = data.toString('ascii');
    // Simple check for GGA sentence
    if (str.includes('$GPGGA') || str.includes('$GNGGA')) {
        const ggaSentence = str.split('\r\n').find(s => s.startsWith('$GPGGA') || s.startsWith('$GNGGA'));
        if (ggaSentence) {
            const positionInfo = this._parseGGA(ggaSentence);
            if (positionInfo) {
                client.lastPosition = { lat: positionInfo.lat, lon: positionInfo.lon, alt: positionInfo.alt };
                client.gnssStatus = positionInfo.quality;
                client.lastPositionUpdate = new Date();
                
                logger.debug(`Client ${client.rover.username} updated position. Status: ${client.gnssStatus}`);
                this.emit('clientPositionUpdate', { clientId, ...positionInfo });
            }
        }
    }
  }
  
  // --- NEW: Parse GGA sentence and return quality ---
  _parseGGA(gga) {
    try {
      const fields = gga.split(',');
      if (fields.length < 7) return null;

      const lat = parseFloat(fields[2]);
      const lon = parseFloat(fields[4]);
      const qualityCode = parseInt(fields[6], 10);
      
      let quality;
      switch (qualityCode) {
        case 1: quality = 'Single'; break;
        case 2: quality = 'DGPS'; break; // Differential GPS
        case 4: quality = 'RTK Fixed'; break;
        case 5: quality = 'RTK Float'; break;
        default: quality = 'N/A';
      }
      
      return {
        lat: (fields[3] === 'S' ? -1 : 1) * (Math.floor(lat / 100) + (lat % 100) / 60),
        lon: (fields[5] === 'W' ? -1 : 1) * (Math.floor(lon / 100) + (lon % 100) / 60),
        alt: parseFloat(fields[9]),
        quality: quality,
        satellites: parseInt(fields[7], 10)
      };
    } catch (error) {
      logger.warn('Could not parse GGA sentence:', gga);
      return null;
    }
  }

  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.stations.get(client.mountpoint)?.clients.delete(clientId);
    client.socket?.destroy();
    this.clients.delete(clientId);
    logger.info(`Client ${clientId} (${client.rover.username}) disconnected.`);
    this.emit('clientDisconnected', client);
  }
}

export default NtripCaster;