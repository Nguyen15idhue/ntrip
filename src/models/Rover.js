import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import sequelize from '../config/database.js';

class Rover extends Model {
  // Instance method to validate password
  async validatePassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }
}

Rover.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  station_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stations',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  last_connection: {
    type: DataTypes.DATE,
    allowNull: true
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
  modelName: 'Rover',
  tableName: 'rovers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    // Hash password before saving to database
    beforeCreate: async (rover) => {
      if (rover.password_hash) {
        rover.password_hash = await bcrypt.hash(rover.password_hash, 10);
      }
    },
    beforeUpdate: async (rover) => {
      if (rover.changed('password_hash')) {
        rover.password_hash = await bcrypt.hash(rover.password_hash, 10);
      }
    }
  }
});

export default Rover;
