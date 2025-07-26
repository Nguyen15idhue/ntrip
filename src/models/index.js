import User from './user.js';
import Location from './location.js';
import Station from './station.js';
import Rover from './Rover.js';

// Define associations
User.hasMany(Rover, { foreignKey: 'user_id' });
Rover.belongsTo(User, { foreignKey: 'user_id' });

Location.hasMany(Station, { foreignKey: 'location_id' });
Station.belongsTo(Location, { foreignKey: 'location_id' });

Station.hasMany(Rover, { foreignKey: 'station_id' });
Rover.belongsTo(Station, { foreignKey: 'station_id' });

export {
  User,
  Location,
  Station,
  Rover
};
