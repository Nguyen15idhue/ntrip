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
    allowNull: true, // THAY ĐỔI Ở ĐÂY: Cho phép NULL
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
  // --- NEW FIELDS ---
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'The date when the rover becomes active.'
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'The date when the rover expires.'
  },
  // --- NEW VIRTUAL FIELD ---
  is_currently_active: {
    type: DataTypes.VIRTUAL,
    get() {
      const status = this.getDataValue('status');
      if (status !== 'active') {
        return false;
      }
      
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Compare date part only

      const startDate = this.getDataValue('start_date');
      const endDate = this.getDataValue('end_date');

      if (startDate && new Date(startDate) > now) {
        return false; // Not yet started
      }
      if (endDate && new Date(endDate) < now) {
        return false; // Expired
      }

      return true; // Active and within valid date range
    }
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
    beforeCreate: async (rover) => {
      // Use the raw password provided, not password_hash
      if (rover.password_hash) {
        rover.password_hash = await bcrypt.hash(rover.password_hash, 10);
      }
    },
    beforeUpdate: async (rover) => {
      // Check if password_hash was changed explicitly
      if (rover.changed('password_hash') && rover.password_hash) {
        rover.password_hash = await bcrypt.hash(rover.password_hash, 10);
      }
    }
  }
});

export default Rover;