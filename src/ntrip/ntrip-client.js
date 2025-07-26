import net from 'net';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Enhanced NTRIP Client Service
 * Connects to an NTRIP caster as a client to receive RTCM data
 */
class NtripClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Default options
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
    this.lastDataReceived = null;
    this.lastPosition = null;
    this.rtcmData = Buffer.alloc(0);
    this.stats = {
      bytesReceived: 0,
      messagesReceived: 0,
      messageTypes: new Map()
    };
  }

  connect() {
    if (this.socket) {
      this.disconnect();
    }

    logger.info(`Connecting to NTRIP caster: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
    
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
    
    this.socket.setTimeout(this.options.timeout);
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.destroy();
        this.socket = null;
        this.connected = false;
        logger.info(`Disconnected from NTRIP caster: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
        this.emit('disconnected');
      } catch (error) {
        logger.error('Error disconnecting from NTRIP caster', error);
      }
    }
  }

  sendPosition(position) {
    if (!this.connected || !this.socket) {
      logger.warn(`Cannot send position: Not connected to NTRIP caster ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
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
    logger.info(`Connected to NTRIP caster: ${this.options.host}:${this.options.port}`);
    const requestHeader = this._createRequestHeader();
    this.socket.write(requestHeader);
    this.reconnectAttempts = 0;
  }

  _handleData(data) {
    if (!this.connected) {
      const response = data.toString();
      if (response.includes('ICY 200 OK')) {
        this.connected = true;
        logger.info(`NTRIP caster authentication successful: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
        this.emit('connected');
        
        const headerEndIndex = response.indexOf('\r\n\r\n');
        if (headerEndIndex !== -1) {
          const rtcmData = data.subarray(headerEndIndex + 4);
          if (rtcmData.length > 0) {
            this._processRtcmData(rtcmData);
          }
        }
      } else if (response.includes('HTTP/1.1 401 Unauthorized')) {
        logger.error(`NTRIP caster authentication failed: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
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
    this.stats.bytesReceived += data.length;
    
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
          
          // Extract message type for statistics
          const byte3 = this.rtcmData[index + 3];
          const byte4 = this.rtcmData[index + 4];
          const messageType = (byte3 << 4) | (byte4 >> 4);
          
          // Update statistics
          this.stats.messagesReceived++;
          if (!this.stats.messageTypes.has(messageType)) {
            this.stats.messageTypes.set(messageType, 0);
          }
          this.stats.messageTypes.set(messageType, this.stats.messageTypes.get(messageType) + 1);
          
          // Emit RTCM message
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
    logger.error(`NTRIP client error: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`, error);
    this.emit('error', error);
  }

  _handleClose() {
    this.connected = false;
    logger.info(`Connection to NTRIP caster closed: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
    this.emit('disconnected');
    
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`Reconnecting to NTRIP caster (attempt ${this.reconnectAttempts} of ${this.options.maxReconnectAttempts})...`);
      setTimeout(() => { this.connect(); }, this.options.reconnectInterval);
    } else {
      logger.error(`Max reconnect attempts reached: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
      this.emit('error', new Error('Max reconnect attempts reached'));
    }
  }

  _handleTimeout() {
    logger.warn(`NTRIP connection timeout: ${this.options.host}:${this.options.port}/${this.options.mountpoint}`);
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
    
    return (
      `GET /${this.options.mountpoint} HTTP/1.1\r\n` +
      `Host: ${this.options.host}:${this.options.port}\r\n` +
      `User-Agent: NTRIP NodeJS Relay Client/1.0\r\n` +
      `Accept: */*\r\n` +
      auth +
      '\r\n'
    );
  }

  /**
   * Format a position object into a NMEA GGA sentence
   * @param {Object} position - Position object with lat, lon, alt properties
   * @returns {string} NMEA GGA sentence
   */
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
   * Get client statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const dataRate = this.lastDataReceived 
      ? (this.stats.bytesReceived / ((new Date() - this.lastDataReceived) / 1000)).toFixed(2) 
      : 0;
      
    return {
      connected: this.connected,
      lastDataReceived: this.lastDataReceived,
      bytesReceived: this.stats.bytesReceived,
      messagesReceived: this.stats.messagesReceived,
      messageTypes: Object.fromEntries(this.stats.messageTypes),
      dataRate: `${dataRate} bytes/sec`,
      lastPosition: this.lastPosition
    };
  }
}

export default NtripClient;
