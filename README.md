# NTRIP Relay System

A Node.js-based NTRIP Relay system that provides RESTful API and low-latency RTCM data relay services.

## Features

- Connect to source NTRIP casters and relay data to multiple rovers
- Virtual mount points with customizable names
- User authentication and authorization (JWT Bearer Tokens)
- Dual authentication support for rovers (Basic Auth for GNSS devices, Bearer Token for API clients)
- Role-based access control (admin/user)
- Low-latency, high-performance RTCM data relay
- Database-driven configuration
- RESTful API with comprehensive documentation

## Prerequisites

- Node.js v14.0.0 or higher
- MySQL 5.7 or higher
- npm 6.0.0 or higher

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/ntrip-relay.git
cd ntrip-relay
```

2. Install dependencies:
```
npm install
```

3. Configure the environment:
Copy the `.env.example` file to `.env` and update the values according to your environment.

4. Create the database and run migrations:
```
# On Windows
setup-db.bat

# On Linux/Mac
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS ntrip_relay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
node src/utils/migrate.js
```

## Authentication Update

As of the latest update, the system now supports dual authentication methods:

- **JWT Bearer Tokens** (Recommended): For web applications, mobile apps, and API clients
- **Basic Authentication**: Maintained for backward compatibility with GNSS devices

For detailed information about the authentication changes and migration guide, see [Authentication Changes Documentation](./docs/authentication-changes.md).

## Usage

### Starting the Server

```
npm start
```

For development with auto-reload:
```
npm run dev
```

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh-token` - Refresh JWT token
- `GET /api/auth/profile` - Get current user profile

#### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user (admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)
- `GET /api/users/:id/rovers` - Get user's rovers
- `POST /api/users/:id/reset-password` - Reset user password (admin only)

#### Stations
- `GET /api/stations` - Get all stations
- `GET /api/stations/:id` - Get station by ID
- `POST /api/stations` - Create new station (admin only)
- `PUT /api/stations/:id` - Update station (admin only)
- `DELETE /api/stations/:id` - Delete station (admin only)
- `POST /api/stations/:id/start` - Start station (admin only)
- `POST /api/stations/:id/stop` - Stop station (admin only)
- `GET /api/stations/:id/stats` - Get station statistics

#### Rovers
- `GET /api/rovers` - Get all rovers
- `GET /api/rovers/:id` - Get rover by ID
- `POST /api/rovers` - Create new rover
- `PUT /api/rovers/:id` - Update rover
- `DELETE /api/rovers/:id` - Delete rover
- `POST /api/rovers/:id/reset-password` - Reset rover password

#### Locations
- `GET /api/locations` - Get all locations
- `GET /api/locations/:id` - Get location by ID
- `POST /api/locations` - Create new location (admin only)
- `PUT /api/locations/:id` - Update location (admin only)
- `DELETE /api/locations/:id` - Delete location (admin only)

### NTRIP Client Connection

Rovers can connect to the NTRIP caster using standard NTRIP client software:

```
Host: <your-server-ip>
Port: 9001 (default, configurable)
Mountpoint: <station-name>
Username: <rover-username>
Password: <rover-password>
```

## Project Structure

```
ntrip-relay/
├── src/                  # Source files
│   ├── config/           # Configuration files
│   ├── controllers/      # Controllers
│   ├── middleware/       # Middleware functions
│   ├── models/           # Database models
│   ├── ntrip/            # NTRIP client and caster implementations
│   ├── routes/           # API routes
│   ├── services/         # Business logic services
│   └── utils/            # Utility functions
├── logs/                 # Log files
├── migrations/           # Database migrations
├── .env                  # Environment variables
├── .env.example          # Example environment variables
└── package.json          # Project metadata and dependencies
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- NTRIP (Networked Transport of RTCM via Internet Protocol) specification
- Express.js and Sequelize for providing the framework and ORM
- The Node.js community for excellent documentation and support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
