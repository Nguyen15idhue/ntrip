import net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

class NtripClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      host: null,
      port: 2101,
      mountpoint: null,
      username: null,
      password: null,
      maxReconnectAttempts: 10,
      reconnectInterval: 5000,
      timeout: 30000,
      ...options
    };
    
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.lastDataReceived = null;
    this.rtcmData = Buffer.alloc(0);
    this.stats = { bytesReceived: 0 };
  }

  connect() {
    if (this.socket) {
      logger.warn(`Client for ${this.options.mountpoint} already has a socket. Disconnecting first.`);
      this.disconnect();
    }
    
    // Clear any pending reconnect timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    logger.info(`Connecting to NTRIP source: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
    
    this.socket = new net.Socket();
    this.socket.setTimeout(this.options.timeout);
    
    this.socket.on('connect', () => this._handleConnect());
    this.socket.on('data', (data) => this._handleData(data));
    this.socket.on('error', (error) => this._handleError(error));
    this.socket.on('close', () => this._handleClose());
    this.socket.on('timeout', () => this._handleTimeout());
    
    this.socket.connect({ host: this.options.host, port: this.options.port });
  }

  disconnect() {
    this.connected = false;
    if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
      logger.info(`Disconnected from NTRIP source: ${this.options.mountpoint}`);
      this.emit('disconnected');
    }
  }

  sendPosition(position) {
    if (!this.connected || !this.socket) return false;
    const nmea = this._formatNmeaGGA(position);
    try {
      this.socket.write(nmea);
      return true;
    } catch (error) {
      logger.error(`Error sending NMEA position to ${this.options.mountpoint}: ${error.message}`);
      return false;
    }
  }
  
  _handleConnect() {
    logger.info(`TCP connection established to source: ${this.options.host}:${this.options.port}`);
    this.socket.write(this._createRequestHeader());
    this.reconnectAttempts = 0;
  }

  _handleData(data) {
    if (!this.connected) {
      const response = data.toString();
      if (response.includes('ICY 200 OK')) {
        this.connected = true;
        this.lastDataReceived = new Date();
        logger.info(`Authentication successful for mountpoint: ${this.options.mountpoint}`);
        this.emit('connected');
        
        // Process any RTCM data that came with the header
        const headerEndIndex = data.indexOf('\r\n\r\n');
        if (headerEndIndex !== -1 && data.length > headerEndIndex + 4) {
          this._processRtcmData(data.subarray(headerEndIndex + 4));
        }
      } else {
        logger.error(`Authentication failed for ${this.options.mountpoint}: ${response.split('\r\n')[0]}`);
        this.emit('error', new Error('Authentication failed'));
        this.disconnect();
      }
    } else {
      this._processRtcmData(data);
    }
  }

  _processRtcmData(data) {
    this.lastDataReceived = new Date();
    this.stats.bytesReceived += data.length;
    this.emit('rtcm', data);
  }

  _handleError(error) {
    logger.error(`NTRIP client error for ${this.options.mountpoint}: ${error.message}`);
    this.emit('error', error);
    // The 'close' event will usually follow, triggering reconnection logic.
  }

  _handleClose() {
    this.connected = false;
    logger.warn(`Connection closed for ${this.options.mountpoint}.`);
    this.emit('disconnected');
    
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Attempting to reconnect to ${this.options.mountpoint} in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts}).`);
      this.reconnectTimer = setTimeout(() => this.connect(), this.options.reconnectInterval);
    } else {
      logger.error(`Max reconnect attempts reached for ${this.options.mountpoint}. Giving up.`);
      this.emit('error', new Error('Max reconnect attempts reached'));
    }
  }

  _handleTimeout() {
    logger.warn(`Connection timeout for ${this.options.mountpoint}. Destroying socket.`);
    if (this.socket) {
        this.socket.destroy(new Error('Socket timeout'));
    }
  }

  _createRequestHeader() {
    let auth = '';
    if (this.options.username && this.options.password) {
      const credentials = Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64');
      auth = `Authorization: Basic ${credentials}\r\n`;
    }
    
    return `GET /${this.options.mountpoint} HTTP/1.1\r\n` +
           `Host: ${this.options.host}:${this.options.port}\r\n` +
           'User-Agent: NTRIP-JS-Relay-Client/1.0\r\n' +
           auth +
           'Connection: close\r\n' +
           '\r\n';
  }

  _formatNmeaGGA(position) {
    const { lat, lon, alt = 0 } = position;
    const now = new Date();
    const time = now.getUTCHours().toString().padStart(2, '0') + 
                 now.getUTCMinutes().toString().padStart(2, '0') + 
                 now.getUTCSeconds().toString().padStart(2, '0') + '.00';
    const latDeg = Math.floor(Math.abs(lat));
    const latMin = (Math.abs(lat) - latDeg) * 60;
    const latStr = `${latDeg.toString().padStart(2, '0')}${latMin.toFixed(5).padStart(8, '0')}`;
    const latHem = lat >= 0 ? 'N' : 'S';
    const lonDeg = Math.floor(Math.abs(lon));
    const lonMin = (Math.abs(lon) - lonDeg) * 60;
    const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(5).padStart(8, '0')}`;
    const lonHem = lon >= 0 ? 'E' : 'W';
    const ggaBody = `GPGGA,${time},${latStr},${latHem},${lonStr},${lonHem},1,08,1.0,${alt.toFixed(1)},M,0.0,M,,`;
    
    let checksum = 0;
    for (const char of ggaBody) {
      checksum ^= char.charCodeAt(0);
    }
    
    return `$${ggaBody}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
  }

  getStats() {
    return {
      connected: this.connected,
      lastDataReceived: this.lastDataReceived,
      bytesReceived: this.stats.bytesReceived,
    };
  }
}

export default NtripClient;