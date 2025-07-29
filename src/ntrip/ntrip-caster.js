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
      logger.debug(`Updated existing station in caster: ${station.name}`);
      return updatedStation;
    }
    
    const newStation = {
      ...station,
      clients: new Set(),
      stats: { bytesTransferred: 0, messagesTransferred: 0 }
    };
    this.stations.set(station.name, newStation);
    logger.info(`Added new station to caster: ${station.name}`);
    this.emit('stationAdded', newStation);
    return newStation;
  }

  removeStation(mountpoint) {
    const station = this.stations.get(mountpoint);
    if (!station) return false;
    
    station.clients.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client) client.socket.destroy();
    });
    
    this.stations.delete(mountpoint);
    logger.info(`Removed station from caster: ${mountpoint}`);
    this.emit('stationRemoved', { mountpoint });
    return true;
  }

  broadcast(mountpoint, data) {
    const station = this.stations.get(mountpoint);
    if (!station || station.clients.size === 0) return 0;

    let successCount = 0;
    station.clients.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.socket && client.socket.writable) {
        try {
          client.socket.write(data);
          successCount++;
        } catch (error) {
          logger.error(`Error writing to client ${clientId}: ${error.message}`);
          this._removeClient(clientId);
        }
      }
    });
    return successCount;
  }

  getSourcetable() {
    let table = '';
    
    // STR entries for each active station
    this.stations.forEach((station, mountpoint) => {
        // Ensure station has minimum required data and is marked active
        if (!station.active || !station.lat || !station.lon) {
            logger.debug(`Skipping inactive or incomplete station in sourcetable: ${mountpoint}`);
            return;
        }

        const str = [
            'STR',
            mountpoint,
            station.identifier || mountpoint,
            station.format || 'RTCM 3.2',
            station.formatDetails || '1004(1),1005/1006(5),1019(5),1020(5)',
            station.carrier || '2',
            station.navSystem || 'GPS+GLO+GAL+BDS',
            station.network || 'CORS',
            station.country || this.options.country,
            station.lat.toFixed(4),
            station.lon.toFixed(4),
            station.nmea ? '1' : '0',
            station.solution || '1',
            station.generator || 'NTRIP-JS-Relay/1.0',
            station.compression || 'none',
            'B', // Authentication: Basic
            station.fee ? 'Y' : 'N',
            station.bitrate || '2400'
        ].join(';');
        table += str + '\r\n';
    });
    
    // CAS entry for the caster itself
    const host = this.options.host === '0.0.0.0' ? '127.0.0.1' : this.options.host;
    const cas = ['CAS', host, this.options.port.toString(), 'VN_CASTER', this.options.operator, '0', this.options.country, '16.0000', '106.0000', ''].join(';');
    table += cas + '\r\n';
    
    // NET entry for the network
    const net = ['NET', 'VN_NETWORK', this.options.operator, 'B', 'N', '', '', 'Vietnam CORS Network Relay'].join(';');
    table += net + '\r\n';
    
    table += 'ENDSOURCETABLE\r\n';
    
    const header = 'SOURCETABLE 200 OK\r\n' +
                   'Server: NTRIP-JS-Caster/1.0\r\n' +
                   'Content-Type: text/plain\r\n' +
                   'Connection: close\r\n' +
                   `Content-Length: ${Buffer.byteLength(table)}\r\n` +
                   '\r\n';
    
    return header + table;
  }
  
  /**
   * REFACTORED: This is the single source of truth for updating the caster's station list from the database.
   */
  async refreshSourceTable() {
    try {
      logger.info('Caster is refreshing its station list from the database.');
      const activeDbStations = await Station.findAll({ where: { status: 'active' } });
      const activeDbStationNames = new Set(activeDbStations.map(s => s.name));
      const currentCasterStations = new Set(this.stations.keys());
      
      // Add/Update stations from DB
      for (const dbStation of activeDbStations) {
        this.addStation({
          name: dbStation.name,
          description: dbStation.description,
          lat: parseFloat(dbStation.lat),
          lon: parseFloat(dbStation.lon),
          active: true,
          status: true,
        });
      }
      
      // Remove stations from caster that are no longer active in DB
      for (const stationName of currentCasterStations) {
        if (!activeDbStationNames.has(stationName)) {
          this.removeStation(stationName);
        }
      }
      
      logger.info(`Caster sourcetable refreshed. Total active stations: ${this.stations.size}`);
      return true;
    } catch (error) {
      logger.error('Error refreshing caster sourcetable:', error);
      return false;
    }
  }


  _handleRawConnection(socket) {
    const clientIp = socket.remoteAddress;
    let requestBuffer = Buffer.alloc(0);

    const onData = (data) => {
      requestBuffer = Buffer.concat([requestBuffer, data]);
      const headerEnd = requestBuffer.indexOf('\r\n\r\n');
      
      if (headerEnd !== -1) {
        socket.removeListener('data', onData);
        const headerStr = requestBuffer.subarray(0, headerEnd).toString();
        const requestData = this._parseHttpRequest(headerStr);
        
        if (!requestData) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\nERROR - Invalid request');
          return;
        }
        
        this._handleParsedRequest(requestData, socket, clientIp);
      }
    };

    socket.on('data', onData);
    socket.on('error', (err) => logger.error(`Socket error from ${clientIp}: ${err.message}`));
    socket.on('close', () => logger.debug(`Connection closed from ${clientIp}.`));
  }

  _parseHttpRequest(headerStr) {
    try {
      const lines = headerStr.split('\r\n');
      const [method, url, version] = lines[0].split(' ');
      const headers = lines.slice(1).reduce((acc, line) => {
        const [key, value] = line.split(/:\s*(.*)/s);
        if (key) acc[key.toLowerCase()] = value;
        return acc;
      }, {});
      return { method, url, version, headers };
    } catch (error) {
      logger.error('Error parsing HTTP request:', error);
      return null;
    }
  }

  async _handleParsedRequest(requestData, socket, clientIp) {
    const { method, url } = requestData;
    const mountpoint = url.startsWith('/') ? url.slice(1) : url;

    // Sourcetable request
    if (method === 'GET' && mountpoint === '') {
      await this.refreshSourceTable(); // Ensure it's up to date
      socket.end(this.getSourcetable());
      return;
    }

    // Mountpoint connection request
    if (method === 'GET' && mountpoint) {
      const station = this.stations.get(mountpoint);
      if (!station || !station.active) {
        socket.end('HTTP/1.1 404 Not Found\r\n\r\nERROR - Mountpoint not found or is inactive.');
        return;
      }

      try {
        const roverCredentials = await this._authenticateRover(requestData.headers.authorization);
        if (!roverCredentials) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n');
          socket.write('WWW-Authenticate: Basic realm="NTRIP Caster"\r\n\r\n');
          socket.end('ERROR - Authentication failed');
          return;
        }
        
        socket.write('ICY 200 OK\r\n\r\n');
        this._setupRawClient(socket, mountpoint, clientIp, roverCredentials);

      } catch (error) {
        logger.error(`Authentication or setup error for ${mountpoint}: ${error.message}`);
        socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\nERROR - Server error during authentication.');
      }
      return;
    }
    
    socket.end('HTTP/1.1 405 Method Not Allowed\r\n\r\nERROR - Method not allowed.');
  }

  async _authenticateRover(authHeader) {
      if (!authHeader || !authHeader.startsWith('Basic ')) {
          return null;
      }
      try {
          const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
          const [username, password] = credentials.split(':');

          const rover = await Rover.findOne({ where: { username, status: 'active' } });
          if (!rover) return null;

          const isValid = await rover.validatePassword(password);
          if (!isValid) return null;

          rover.last_connection = new Date();
          await rover.save();

          return { id: rover.id, username: rover.username };
      } catch (error) {
          logger.error('Authentication error:', error);
          return null;
      }
  }

  _setupRawClient(socket, mountpoint, clientIp, roverCredentials) {
    const clientId = crypto.randomUUID();
    const client = { id: clientId, mountpoint, socket, ip: clientIp, rover: roverCredentials };
    
    this.clients.set(clientId, client);
    const station = this.stations.get(mountpoint);
    station.clients.add(clientId);

    socket.setKeepAlive(true, 30000);
    socket.setNoDelay(true);

    logger.info(`Client ${clientId} (${roverCredentials.username}) connected to ${mountpoint} from ${clientIp}.`);
    this.emit('clientConnected', client);

    socket.on('close', () => this._removeClient(clientId));
    socket.on('error', (err) => {
        logger.error(`Client ${clientId} socket error: ${err.message}`);
        this._removeClient(clientId);
    });
  }

  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const station = this.stations.get(client.mountpoint);
    if (station) {
      station.clients.delete(clientId);
    }
    
    if (client.socket && !client.socket.destroyed) {
        client.socket.destroy();
    }

    this.clients.delete(clientId);
    logger.info(`Client ${clientId} (${client.rover.username}) disconnected from ${client.mountpoint}.`);
    this.emit('clientDisconnected', client);
  }
  
  // FIX: REMOVED the duplicate getSourcetable function that was here.
}

export default NtripCaster;