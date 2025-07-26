import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Location extends Model {}

Location.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  province_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  lat: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false
  },
  lon: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false
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
  modelName: 'Location',
  tableName: 'locations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Location;
