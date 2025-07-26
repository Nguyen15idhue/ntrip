# NTRIP API Documentation

This document provides a comprehensive guide to all REST APIs available in the NTRIP project, along with testing instructions.

## Table of Contents

1. [Authentication APIs](#authentication-apis)
2. [User APIs](#user-apis)
3. [Station APIs](#station-apis)
4. [Rover APIs](#rover-apis)
5. [Location APIs](#location-apis)
6. [NTRIP Specific APIs](#ntrip-specific-apis)
7. [Testing the APIs](#testing-the-apis)

## Authentication APIs

Base URL: `/api/auth`

| Endpoint | Method | Description | Authentication | Request Body | Response |
|----------|--------|-------------|----------------|--------------|----------|
| `/register` | POST | Register a new user | No | `{ "name": "string", "email": "string", "password": "string" }` | `{ "success": true, "message": "User registered", "data": { "id": "number", "name": "string", "email": "string", "role": "string" }, "token": "string" }` |
| `/login` | POST | Login user | No | `{ "email": "string", "password": "string" }` | `{ "success": true, "message": "Login successful", "data": { "id": "number", "name": "string", "email": "string", "role": "string" }, "token": "string", "refreshToken": "string" }` |
| `/refresh-token` | POST | Refresh authentication token | No | `{ "refreshToken": "string" }` | `{ "success": true, "token": "string", "refreshToken": "string" }` |
| `/profile` | GET | Get current user profile | JWT | - | `{ "success": true, "data": { "id": "number", "name": "string", "email": "string", "role": "string" } }` |

## User APIs

Base URL: `/api/users`

| Endpoint | Method | Description | Authentication | Request Body | Response |
|----------|--------|-------------|----------------|--------------|----------|
| `/` | GET | Get all users | JWT + Admin | - | `{ "success": true, "data": [{ "id": "number", "name": "string", "email": "string", "role": "string" }] }` |
| `/:id` | GET | Get user by ID | JWT (Admin or Self) | - | `{ "success": true, "data": { "id": "number", "name": "string", "email": "string", "role": "string" } }` |
| `/` | POST | Create new user | JWT + Admin | `{ "name": "string", "email": "string", "password": "string", "role": "string" }` | `{ "success": true, "message": "User created", "data": { "id": "number", "name": "string", "email": "string", "role": "string" } }` |
| `/:id` | PUT | Update user | JWT (Admin or Self) | `{ "name": "string", "email": "string", "role": "string" }` | `{ "success": true, "message": "User updated", "data": { "id": "number", "name": "string", "email": "string", "role": "string" } }` |
| `/:id/change-password` | PUT | Change user password | JWT (Admin or Self) | `{ "currentPassword": "string", "newPassword": "string" }` | `{ "success": true, "message": "Password changed successfully" }` |
| `/:id` | DELETE | Delete user | JWT + Admin | - | `{ "success": true, "message": "User deleted" }` |

## Station APIs

Base URL: `/api/stations`

| Endpoint | Method | Description | Authentication | Request Body | Response |
|----------|--------|-------------|----------------|--------------|----------|
| `/` | GET | Get all stations | JWT | - | `{ "success": true, "data": [{ "id": "number", "name": "string", ... }] }` |
| `/:id` | GET | Get station by ID | JWT | - | `{ "success": true, "data": { "id": "number", "name": "string", ... } }` |
| `/` | POST | Create new station | JWT + Admin | `{ "name": "string", "description": "string", "lat": "number", "lon": "number", "location_id": "number", ... }` | `{ "success": true, "message": "Station created", "data": { "id": "number", "name": "string", ... } }` |
| `/:id` | PUT | Update station | JWT + Admin | `{ "name": "string", "description": "string", ... }` | `{ "success": true, "message": "Station updated", "data": { "id": "number", "name": "string", ... } }` |
| `/:id` | DELETE | Delete station | JWT + Admin | - | `{ "success": true, "message": "Station deleted" }` |
| `/:id/start` | POST | Start station relay | JWT + Admin | - | `{ "success": true, "message": "Relay started", "station": { ... } }` |
| `/:id/stop` | POST | Stop station relay | JWT + Admin | - | `{ "success": true, "message": "Relay stopped" }` |

## Rover APIs

Base URL: `/api/rovers`

| Endpoint | Method | Description | Authentication | Request Body | Response |
|----------|--------|-------------|----------------|--------------|----------|
| `/` | GET | Get all rovers | JWT (Admin sees all, users see only their rovers) | - | `{ "success": true, "data": [{ "id": "number", "username": "string", ... }] }` |
| `/:id` | GET | Get rover by ID | JWT (Admin or Owner) | - | `{ "success": true, "data": { "id": "number", "username": "string", ... } }` |
| `/` | POST | Create new rover | JWT | `{ "username": "string", "password": "string", "station_id": "number", ... }` | `{ "success": true, "message": "Rover created", "data": { "id": "number", "username": "string", ... } }` |
| `/:id` | PUT | Update rover | JWT (Admin or Owner) | `{ "username": "string", "description": "string", ... }` | `{ "success": true, "message": "Rover updated", "data": { "id": "number", "username": "string", ... } }` |
| `/:id/change-password` | PUT | Change rover password | JWT (Admin or Owner) | `{ "newPassword": "string" }` | `{ "success": true, "message": "Password changed successfully" }` |
| `/:id` | DELETE | Delete rover | JWT (Admin or Owner) | - | `{ "success": true, "message": "Rover deleted" }` |
| `/:id/status` | PUT | Update rover status | JWT (Admin or Owner) | `{ "status": "string" }` | `{ "success": true, "message": "Status updated", "data": { "status": "string" } }` |
| `/:id/station` | PUT | Change rover station | JWT (Admin or Owner) | `{ "station_id": "number" }` | `{ "success": true, "message": "Station updated", "data": { "station_id": "number" } }` |

## Location APIs

Base URL: `/api/locations`

| Endpoint | Method | Description | Authentication | Request Body | Response |
|----------|--------|-------------|----------------|--------------|----------|
| `/` | GET | Get all locations | JWT | - | `{ "success": true, "data": [{ "id": "number", "name": "string", ... }] }` |
| `/:id` | GET | Get location by ID | JWT | - | `{ "success": true, "data": { "id": "number", "name": "string", ... } }` |
| `/` | POST | Create new location | JWT + Admin | `{ "name": "string", "description": "string", "lat": "number", "lon": "number", ... }` | `{ "success": true, "message": "Location created", "data": { "id": "number", "name": "string", ... } }` |
| `/:id` | PUT | Update location | JWT + Admin | `{ "name": "string", "description": "string", ... }` | `{ "success": true, "message": "Location updated", "data": { "id": "number", "name": "string", ... } }` |
| `/:id` | DELETE | Delete location | JWT + Admin | - | `{ "success": true, "message": "Location deleted" }` |

## NTRIP Specific APIs

| Endpoint | Method | Description | Authentication | Request Body | Response |
|----------|--------|-------------|----------------|--------------|----------|
| `/api/sourcetable` | GET | Get NTRIP sourcetable | No | - | Text content in NTRIP sourcetable format |

## Testing the APIs

### Prerequisites

1. Install Postman (https://www.postman.com/)
2. Make sure the NTRIP server is running

### Step 1: Set up Environment

1. Open Postman
2. Create a new environment called "NTRIP API"
3. Add the following variables:
   - `baseUrl`: `http://localhost:3000` (or the URL where your API is hosted)
   - `token`: (leave empty for now)

### Step 2: Test Authentication

1. Register a new user
   - Method: POST
   - URL: `{{baseUrl}}/api/auth/register`
   - Body (JSON):
     ```json
     {
       "name": "Test User",
       "email": "test@example.com",
       "password": "password123"
     }
     ```
   - Save the token from the response to your Postman environment variable `token`

2. Login
   - Method: POST
   - URL: `{{baseUrl}}/api/auth/login`
   - Body (JSON):
     ```json
     {
       "email": "test@example.com",
       "password": "password123"
     }
     ```
   - Save the token from the response to your Postman environment variable `token`

3. For testing authenticated endpoints, add an Authorization header:
   - Type: Bearer Token
   - Token: `{{token}}`

### Step 3: Test Other APIs

Once you have your authentication token, you can test all the other API endpoints by following the documentation above. Make sure to set the Authorization header for endpoints requiring authentication.

### Step 4: NTRIP Client Testing

To test the actual NTRIP functionality, you'll need an NTRIP client application such as:

1. **BKG NTRIP Client (BNC)**: A professional GNSS data processing software
2. **RTKLIB**: Open source GNSS processing software with NTRIP client capabilities
3. **LeftHand NTRIP Client**: Simple NTRIP client for Windows

#### Example: Testing with RTKLIB

1. Download and install RTKLIB
2. Open STRSVR (Stream Server)
3. Configure the input stream:
   - Type: NTRIP Client
   - Host: `localhost` (or your server address)
   - Port: `9001` (or your NTRIP caster port)
   - Mountpoint: (choose from your sourcetable)
   - User-ID: (your rover username)
   - Password: (your rover password)
4. Click "Start" to connect to your NTRIP caster

### Step 5: Command Line Testing

You can also test the NTRIP caster using curl:

1. Get sourcetable:
   ```bash
   curl -v http://localhost:9001
   ```

2. Connect to a mountpoint:
   ```bash
   curl -v -u "rover_username:rover_password" http://localhost:9001/MOUNTPOINT_NAME
   ```

### Troubleshooting

1. **Authentication Issues**: Verify that your token is valid and not expired
2. **404 Errors**: Check that the endpoint URL is correct
3. **500 Errors**: Check the server logs for detailed error information
4. **Connection Issues with NTRIP Client**: Ensure that the caster is running and the mountpoint exists in the sourcetable

For any issues, refer to the server logs for more detailed error messages.
