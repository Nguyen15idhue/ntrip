import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Station extends Model {}

Station.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Mount point name'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  lat: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false
  },
  lon: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'locations',
      key: 'id'
    }
  },
  source_host: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'NTRIP source caster hostname'
  },
  source_port: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2101,
    comment: 'NTRIP source caster port'
  },
  source_user: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Username for source caster auth'
  },
  source_pass: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Password for source caster auth'
  },
  source_mount_point: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Source caster mountpoint name'
  },
  carrier: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: '2',
    comment: 'Carrier phase (1=L1, 2=L1+L2)'
  },
  nav_system: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'GPS+GLO+GAL+BDS',
    comment: 'Navigation system'
  },
  network: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: 'VRS',
    comment: 'Network type (VRS, RTK, etc.)'
  },
  country: {
    type: DataTypes.STRING(3),
    allowNull: true,
    defaultValue: 'VNM',
    comment: 'Country code (ISO 3166)'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'inactive'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Station',
  tableName: 'stations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Station;
