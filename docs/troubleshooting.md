# NTRIP Relay Troubleshooting Guide

## Common Issues and Solutions

### 1. Station Creation Fails with "Failed to create station" Error

**Issue**: When creating a new station through the API, you receive a 500 error with message "Failed to create station".

**Potential Causes**:
- Missing required fields in the request body
- Invalid values for latitude or longitude
- Database connection issues
- Insufficient permissions (non-admin user)

**Solutions**:
- Check that your request includes all required fields: `name`, `lat`, `lon`, `location_id`, `source_host`, and `source_mount_point`
- Ensure latitude and longitude are valid decimal numbers
- Verify that the location_id exists in the database
- Check that you're using an admin JWT token for authentication

### 2. "TypeError: relayService.X is not a function" in Server Logs

If you see errors like "TypeError: relayService.setupStation is not a function" in your logs, it means there's a mismatch between function calls in the code and the actual methods available in the RelayService class.

**Solution for Developers**:
The RelayService provides these functions:
- `initialize()` - Start the relay service
- `startRelay(stationId)` - Start a relay for a station by ID
- `stopRelay(stationName)` - Stop a relay for a station by name
- `getStatus()` - Get the status of all relays
- `shutdown()` - Shutdown the relay service

Make sure any code calling the service uses these method names.

### 3. NTRIP Client Connection Issues

**Issue**: The NTRIP server starts but clients cannot connect to it.

**Solutions**:
- Check the server logs for connection errors
- Verify that the NTRIP server port (default 9001) is open and accessible
- Ensure the client is using the correct credentials
- Check network connectivity between client and server

### 4. JWT Authentication Fails

**Issue**: API requests fail with 401 Unauthorized error despite using JWT token.

**Solutions**:
- Ensure your token is valid and not expired
- Verify you're using the proper format: `Authorization: Bearer <token>`
- Check that the JWT_SECRET environment variable on the server matches what was used to generate the token

### 5. Database Connection Issues

**Issue**: Server fails to start with database connection errors.

**Solutions**:
- Verify database credentials in .env file
- Check that the database server is running
- Ensure the database and tables are created properly

## Debugging Tips

### Checking Server Logs

Check the following log files for detailed error information:
- `logs/ntrip-relay.log` - General server logs
- `logs/error.log` - Error logs only

### Testing API Endpoints

You can use tools like Postman or curl to test the API endpoints. Example:

```bash
# Login to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}'

# Use the token to create a station
curl -X POST http://localhost:3000/api/stations \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TEST_STATION",
    "description": "Test station",
    "lat": 20.9261,
    "lon": 105.6002,
    "location_id": 1,
    "source_host": "ntrip.example.com",
    "source_port": 2101,
    "source_user": "username",
    "source_pass": "password",
    "source_mount_point": "MOUNTPOINT",
    "status": "inactive"
  }'
```

### NTRIP Connection Testing

You can test NTRIP connections with standard GNSS tools or simple telnet:

```bash
# Test NTRIP connection with telnet
telnet localhost 9001
```

Then enter a valid HTTP request:
```
GET /MOUNTPOINT HTTP/1.1
Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
User-Agent: NTRIP Test Client

```

## Restarting the Server

If issues persist, try restarting the server:

```bash
# Stop the server (if running)
[Ctrl+C]

# Start the server
npm start
```

For more assistance, please file an issue on the project repository.
