# NTRIP API Reference

This document provides a comprehensive reference for all REST API endpoints available in the NTRIP Relay Service.

> **Authentication Update**: All API endpoints now use JWT Bearer token authentication instead of Basic authentication. Include the token in the `Authorization` header with the format: `Bearer {token}`.

## Table of Contents
1. [Authentication](#authentication)
   - [Register](#register)
   - [Login](#login)
   - [Refresh Token](#refresh-token)
   - [Get Profile](#get-profile)
2. [Users](#users)
   - [Get All Users](#get-all-users)
   - [Get User by ID](#get-user-by-id)
   - [Create User](#create-user)
   - [Update User](#update-user)
   - [Delete User](#delete-user)
3. [Stations](#stations)
   - [Get All Stations](#get-all-stations)
   - [Get Station by ID](#get-station-by-id)
   - [Create Station](#create-station)
   - [Update Station](#update-station)
   - [Delete Station](#delete-station)
   - [Start Station Relay](#start-station-relay)
   - [Stop Station Relay](#stop-station-relay)
4. [Rovers](#rovers)
   - [Get All Rovers](#get-all-rovers)
   - [Get Rover by ID](#get-rover-by-id)
   - [Create Rover](#create-rover)
   - [Update Rover](#update-rover)
   - [Delete Rover](#delete-rover)
5. [Locations](#locations)
   - [Get All Locations](#get-all-locations)
   - [Get Location by ID](#get-location-by-id)
   - [Create Location](#create-location)
   - [Update Location](#update-location)
   - [Delete Location](#delete-location)

## Authentication

### Register

Registers a new user in the system.

- **URL**: `/api/auth/register`
- **Method**: `POST`
- **Auth Required**: No
- **Permissions**: None

#### Request Body

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### Success Response

- **Code**: 201 Created
- **Content**:

```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Error Response

- **Code**: 400 Bad Request
- **Content**:

```json
{
  "success": false,
  "message": "User already exists with this email."
}
```

OR

- **Code**: 500 Internal Server Error
- **Content**:

```json
{
  "success": false,
  "message": "Registration failed. Please try again later."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testRegister() {
  try {
    const response = await axios.post('http://localhost:3000/api/auth/register', {
      name: "Test User",
      email: "test@example.com",
      password: "password123"
    });
    console.log('Registration successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Registration failed:', error.response.data);
  }
}

testRegister();
```

### Login

Authenticates a user and returns a token.

- **URL**: `/api/auth/login`
- **Method**: `POST`
- **Auth Required**: No
- **Permissions**: None

#### Request Body

```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Invalid email or password."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testLogin() {
  try {
    const response = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    console.log('Login successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Login failed:', error.response.data);
  }
}

testLogin();
```

### Refresh Token

Refreshes an authentication token using a refresh token.

- **URL**: `/api/auth/refresh-token`
- **Method**: `POST`
- **Auth Required**: No
- **Permissions**: None

#### Request Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Token refreshed successfully.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Invalid refresh token."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testRefreshToken() {
  try {
    // First login to get a refresh token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const refreshToken = loginResponse.data.data.refreshToken;
    
    // Then try to refresh the token
    const response = await axios.post('http://localhost:3000/api/auth/refresh-token', {
      refreshToken: refreshToken
    });
    
    console.log('Token refresh successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Token refresh failed:', error.response.data);
  }
}

testRefreshToken();
```

### Get Profile

Retrieves the profile information for the currently authenticated user.

- **URL**: `/api/auth/profile`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "created_at": "2025-07-25T10:30:00.000Z",
    "updated_at": "2025-07-25T10:30:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetProfile() {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch the profile
    const response = await axios.get('http://localhost:3000/api/auth/profile', {
      headers: {
        'Authorization': `Bearer ${token}`  // Bearer token authentication
      }
    });
    
    console.log('Profile fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Profile fetch failed:', error.response.data);
  }
}

testGetProfile();
```

## Users

### Get All Users

Retrieves a list of all users. Admin access required.

- **URL**: `/api/users`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Admin User",
      "email": "admin@example.com",
      "role": "admin",
      "created_at": "2025-07-25T10:30:00.000Z",
      "updated_at": "2025-07-25T10:30:00.000Z"
    },
    {
      "id": 2,
      "name": "Regular User",
      "email": "user@example.com",
      "role": "user",
      "created_at": "2025-07-26T15:45:00.000Z",
      "updated_at": "2025-07-26T15:45:00.000Z"
    }
  ]
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetAllUsers() {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch all users
    const response = await axios.get('http://localhost:3000/api/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Users fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Users fetch failed:', error.response.data);
  }
}

testGetAllUsers();
```

### Get User by ID

Retrieves a specific user by their ID. Admin can view any user, regular users can only view themselves.

- **URL**: `/api/users/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Admin or Self
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Regular User",
    "email": "user@example.com",
    "role": "user",
    "created_at": "2025-07-26T15:45:00.000Z",
    "updated_at": "2025-07-26T15:45:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "You are not authorized to view this user."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "User not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetUserById(userId) {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch the user
    const response = await axios.get(`http://localhost:3000/api/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('User fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('User fetch failed:', error.response.data);
  }
}

// Test with a valid user ID
testGetUserById(1);
```

### Create User

Creates a new user. Admin access required.

- **URL**: `/api/users`
- **Method**: `POST`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "name": "New User",
  "email": "newuser@example.com",
  "password": "securepassword",
  "role": "user"
}
```

#### Success Response

- **Code**: 201 Created
- **Content**:

```json
{
  "success": true,
  "message": "User created successfully.",
  "data": {
    "id": 3,
    "name": "New User",
    "email": "newuser@example.com",
    "role": "user",
    "created_at": "2025-07-27T08:15:00.000Z",
    "updated_at": "2025-07-27T08:15:00.000Z"
  }
}
```

#### Error Response

- **Code**: 400 Bad Request
- **Content**:

```json
{
  "success": false,
  "message": "User already exists with this email."
}
```

OR

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testCreateUser() {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to create a new user
    const response = await axios.post('http://localhost:3000/api/users', {
      name: "New Test User",
      email: "newtest@example.com",
      password: "password123",
      role: "user"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('User creation successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('User creation failed:', error.response.data);
  }
}

testCreateUser();
```

### Update User

Updates an existing user. Admin can update any user, regular users can only update themselves.

- **URL**: `/api/users/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Permissions**: Admin or Self
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "name": "Updated User Name",
  "email": "updated@example.com",
  "password": "newsecurepassword"
}
```

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "User updated successfully.",
  "data": {
    "id": 2,
    "name": "Updated User Name",
    "email": "updated@example.com",
    "role": "user",
    "created_at": "2025-07-26T15:45:00.000Z",
    "updated_at": "2025-07-27T09:30:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "You are not authorized to update this user."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "User not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testUpdateUser(userId) {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    const myId = loginResponse.data.data.id;
    
    // Then use the token to update the user
    const response = await axios.put(`http://localhost:3000/api/users/${myId}`, {
      name: "Updated Test User",
      email: "test@example.com"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('User update successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('User update failed:', error.response.data);
  }
}

// Test with the user's own ID
testUpdateUser(2);
```

### Delete User

Deletes an existing user. Admin access required.

- **URL**: `/api/users/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "User deleted successfully."
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "User not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testDeleteUser(userId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to delete the user
    const response = await axios.delete(`http://localhost:3000/api/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('User deletion successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('User deletion failed:', error.response.data);
  }
}

// Test with a valid user ID
testDeleteUser(3);
```

## Stations

### Get All Stations

Retrieves a list of all stations.

- **URL**: `/api/stations`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "HNI_CAUGIAY",
      "description": "Ha Noi - Cau Giay CORS Station",
      "lat": "21.0362",
      "lon": "105.7905",
      "source_host": "cors1.example.com",
      "source_port": 2101,
      "source_user": "user1",
      "source_pass": "******",
      "source_mount_point": "HNI",
      "status": "active",
      "location": {
        "id": 1,
        "name": "Ha Noi",
        "state": "HN",
        "country": "Vietnam"
      }
    },
    {
      "id": 2,
      "name": "HCM_QUAN1",
      "description": "Ho Chi Minh - Quan 1 CORS Station",
      "lat": "10.7769",
      "lon": "106.7009",
      "source_host": "cors2.example.com",
      "source_port": 2101,
      "source_user": "user2",
      "source_pass": "******",
      "source_mount_point": "HCM",
      "status": "active",
      "location": {
        "id": 2,
        "name": "Ho Chi Minh",
        "state": "HCM",
        "country": "Vietnam"
      }
    }
  ]
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetAllStations() {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch all stations
    const response = await axios.get('http://localhost:3000/api/stations', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Stations fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Stations fetch failed:', error.response.data);
  }
}

testGetAllStations();
```

### Get Station by ID

Retrieves a specific station by its ID.

- **URL**: `/api/stations/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "HNI_CAUGIAY",
    "description": "Ha Noi - Cau Giay CORS Station",
    "lat": "21.0362",
    "lon": "105.7905",
    "source_host": "cors1.example.com",
    "source_port": 2101,
    "source_user": "user1",
    "source_pass": "******",
    "source_mount_point": "HNI",
    "status": "active",
    "location": {
      "id": 1,
      "name": "Ha Noi",
      "state": "HN",
      "country": "Vietnam"
    }
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Station not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetStationById(stationId) {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch the station
    const response = await axios.get(`http://localhost:3000/api/stations/${stationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Station fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Station fetch failed:', error.response.data);
  }
}

// Test with a valid station ID
testGetStationById(1);
```

### Create Station

Creates a new station. Admin access required.

- **URL**: `/api/stations`
- **Method**: `POST`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "name": "DN_SONTRA",
  "description": "Da Nang - Son Tra CORS Station",
  "lat": 16.0544,
  "lon": 108.2022,
  "location_id": 3,
  "source_host": "cors3.example.com",
  "source_port": 2101,
  "source_user": "user3",
  "source_pass": "password3",
  "source_mount_point": "DN",
  "status": "active"
}
```

#### Success Response

- **Code**: 201 Created
- **Content**:

```json
{
  "success": true,
  "message": "Station created successfully.",
  "data": {
    "id": 3,
    "name": "DN_SONTRA",
    "description": "Da Nang - Son Tra CORS Station",
    "lat": "16.0544",
    "lon": "108.2022",
    "location_id": 3,
    "source_host": "cors3.example.com",
    "source_port": 2101,
    "source_user": "user3",
    "source_pass": "password3",
    "source_mount_point": "DN",
    "status": "active",
    "created_at": "2025-07-27T10:15:00.000Z",
    "updated_at": "2025-07-27T10:15:00.000Z"
  }
}
```

#### Error Response

- **Code**: 400 Bad Request
- **Content**:

```json
{
  "success": false,
  "message": "Station with this name already exists."
}
```

OR

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testCreateStation() {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to create a new station
    const response = await axios.post('http://localhost:3000/api/stations', {
      name: "HP_HONGBANG",
      description: "Hai Phong - Hong Bang CORS Station",
      lat: 20.8648,
      lon: 106.6838,
      location_id: 4,
      source_host: "cors4.example.com",
      source_port: 2101,
      source_user: "user4",
      source_pass": "password4",
      source_mount_point": "HP",
      status": "active"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Station creation successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Station creation failed:', error.response.data);
  }
}

testCreateStation();
```

### Update Station

Updates an existing station. Admin access required.

- **URL**: `/api/stations/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "description": "Updated Da Nang - Son Tra CORS Station",
  "source_host": "newcors3.example.com",
  "status": "inactive"
}
```

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Station updated successfully.",
  "data": {
    "id": 3,
    "name": "DN_SONTRA",
    "description": "Updated Da Nang - Son Tra CORS Station",
    "lat": "16.0544",
    "lon": "108.2022",
    "location_id": 3,
    "source_host": "newcors3.example.com",
    "source_port": 2101,
    "source_user": "user3",
    "source_pass": "password3",
    "source_mount_point": "DN",
    "status": "inactive",
    "created_at": "2025-07-27T10:15:00.000Z",
    "updated_at": "2025-07-27T11:30:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Station not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testUpdateStation(stationId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to update the station
    const response = await axios.put(`http://localhost:3000/api/stations/${stationId}`, {
      description: "Updated CORS Station",
      status: "inactive"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Station update successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Station update failed:', error.response.data);
  }
}

// Test with a valid station ID
testUpdateStation(3);
```

### Delete Station

Deletes an existing station. Admin access required.

- **URL**: `/api/stations/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Station deleted successfully."
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Station not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testDeleteStation(stationId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to delete the station
    const response = await axios.delete(`http://localhost:3000/api/stations/${stationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Station deletion successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Station deletion failed:', error.response.data);
  }
}

// Test with a valid station ID
testDeleteStation(3);
```

### Start Station Relay

Starts the NTRIP relay service for a station. Admin access required.

- **URL**: `/api/stations/:id/start`
- **Method**: `POST`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Relay started",
  "data": {
    "id": 1,
    "name": "HNI_CAUGIAY",
    "description": "Ha Noi - Cau Giay CORS Station",
    "status": "active"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Station not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testStartStationRelay(stationId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to start the relay
    const response = await axios.post(`http://localhost:3000/api/stations/${stationId}/start`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Station relay started successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Station relay start failed:', error.response.data);
  }
}

// Test with a valid station ID
testStartStationRelay(1);
```

### Stop Station Relay

Stops the NTRIP relay service for a station. Admin access required.

- **URL**: `/api/stations/:id/stop`
- **Method**: `POST`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Relay stopped"
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Station not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testStopStationRelay(stationId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to stop the relay
    const response = await axios.post(`http://localhost:3000/api/stations/${stationId}/stop`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Station relay stopped successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Station relay stop failed:', error.response.data);
  }
}

// Test with a valid station ID
testStopStationRelay(1);
```

## Rovers

### Get All Rovers

Retrieves a list of all rovers.

- **URL**: `/api/rovers`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "rover1",
      "status": "active",
      "last_connection": "2025-07-26T14:30:00.000Z",
      "created_at": "2025-07-25T10:30:00.000Z",
      "updated_at": "2025-07-26T14:30:00.000Z",
      "user": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com"
      },
      "station": {
        "id": 1,
        "name": "HNI_CAUGIAY",
        "description": "Ha Noi - Cau Giay CORS Station"
      }
    },
    {
      "id": 2,
      "username": "rover2",
      "status": "active",
      "last_connection": "2025-07-27T09:15:00.000Z",
      "created_at": "2025-07-25T11:45:00.000Z",
      "updated_at": "2025-07-27T09:15:00.000Z",
      "user": {
        "id": 2,
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "station": {
        "id": 2,
        "name": "HCM_QUAN1",
        "description": "Ho Chi Minh - Quan 1 CORS Station"
      }
    }
  ]
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetAllRovers() {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch all rovers
    const response = await axios.get('http://localhost:3000/api/rovers', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Rovers fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Rovers fetch failed:', error.response.data);
  }
}

testGetAllRovers();
```

### Get Rover by ID

Retrieves a specific rover by its ID.

- **URL**: `/api/rovers/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "rover1",
    "status": "active",
    "last_connection": "2025-07-26T14:30:00.000Z",
    "created_at": "2025-07-25T10:30:00.000Z",
    "updated_at": "2025-07-26T14:30:00.000Z",
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com"
    },
    "station": {
      "id": 1,
      "name": "HNI_CAUGIAY",
      "description": "Ha Noi - Cau Giay CORS Station"
    }
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Rover not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetRoverById(roverId) {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch the rover
    const response = await axios.get(`http://localhost:3000/api/rovers/${roverId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Rover fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Rover fetch failed:', error.response.data);
  }
}

// Test with a valid rover ID
testGetRoverById(1);
```

### Create Rover

Creates a new rover. Admin access required.

- **URL**: `/api/rovers`
- **Method**: `POST`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "username": "rover3",
  "password": "securepassword",
  "user_id": 3,
  "station_id": 1,
  "status": "active"
}
```

#### Success Response

- **Code**: 201 Created
- **Content**:

```json
{
  "success": true,
  "message": "Rover created successfully.",
  "data": {
    "id": 3,
    "username": "rover3",
    "user_id": 3,
    "station_id": 1,
    "status": "active",
    "created_at": "2025-07-27T12:30:00.000Z",
    "updated_at": "2025-07-27T12:30:00.000Z"
  }
}
```

#### Error Response

- **Code**: 400 Bad Request
- **Content**:

```json
{
  "success": false,
  "message": "Rover with this username already exists."
}
```

OR

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testCreateRover() {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to create a new rover
    const response = await axios.post('http://localhost:3000/api/rovers', {
      username: "newrover",
      password: "password123",
      user_id: 2,
      station_id: 1,
      status: "active"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Rover creation successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Rover creation failed:', error.response.data);
  }
}

testCreateRover();
```

### Update Rover

Updates an existing rover. Admin access required.

- **URL**: `/api/rovers/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "password": "newsecurepassword",
  "station_id": 2,
  "status": "inactive"
}
```

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Rover updated successfully.",
  "data": {
    "id": 3,
    "username": "rover3",
    "user_id": 3,
    "station_id": 2,
    "status": "inactive",
    "created_at": "2025-07-27T12:30:00.000Z",
    "updated_at": "2025-07-27T14:00:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Rover not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testUpdateRover(roverId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to update the rover
    const response = await axios.put(`http://localhost:3000/api/rovers/${roverId}`, {
      password: "newpassword123",
      status: "inactive"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Rover update successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Rover update failed:', error.response.data);
  }
}

// Test with a valid rover ID
testUpdateRover(3);
```

### Delete Rover

Deletes an existing rover. Admin access required.

- **URL**: `/api/rovers/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Rover deleted successfully."
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Rover not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testDeleteRover(roverId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to delete the rover
    const response = await axios.delete(`http://localhost:3000/api/rovers/${roverId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Rover deletion successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Rover deletion failed:', error.response.data);
  }
}

// Test with a valid rover ID
testDeleteRover(3);
```

## Locations

### Get All Locations

Retrieves a list of all locations.

- **URL**: `/api/locations`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Ha Noi",
      "state": "HN",
      "country": "Vietnam",
      "created_at": "2025-07-25T10:00:00.000Z",
      "updated_at": "2025-07-25T10:00:00.000Z"
    },
    {
      "id": 2,
      "name": "Ho Chi Minh",
      "state": "HCM",
      "country": "Vietnam",
      "created_at": "2025-07-25T10:00:00.000Z",
      "updated_at": "2025-07-25T10:00:00.000Z"
    }
  ]
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetAllLocations() {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch all locations
    const response = await axios.get('http://localhost:3000/api/locations', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Locations fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Locations fetch failed:', error.response.data);
  }
}

testGetAllLocations();
```

### Get Location by ID

Retrieves a specific location by its ID.

- **URL**: `/api/locations/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions**: Authenticated User
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Ha Noi",
    "state": "HN",
    "country": "Vietnam",
    "created_at": "2025-07-25T10:00:00.000Z",
    "updated_at": "2025-07-25T10:00:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Location not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testGetLocationById(locationId) {
  try {
    // First login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "test@example.com",
      password: "password123"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to fetch the location
    const response = await axios.get(`http://localhost:3000/api/locations/${locationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Location fetch successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Location fetch failed:', error.response.data);
  }
}

// Test with a valid location ID
testGetLocationById(1);
```

### Create Location

Creates a new location. Admin access required.

- **URL**: `/api/locations`
- **Method**: `POST`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "name": "Da Nang",
  "state": "DN",
  "country": "Vietnam"
}
```

#### Success Response

- **Code**: 201 Created
- **Content**:

```json
{
  "success": true,
  "message": "Location created successfully.",
  "data": {
    "id": 3,
    "name": "Da Nang",
    "state": "DN",
    "country": "Vietnam",
    "created_at": "2025-07-27T15:00:00.000Z",
    "updated_at": "2025-07-27T15:00:00.000Z"
  }
}
```

#### Error Response

- **Code**: 400 Bad Request
- **Content**:

```json
{
  "success": false,
  "message": "Location with this name already exists."
}
```

OR

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testCreateLocation() {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to create a new location
    const response = await axios.post('http://localhost:3000/api/locations', {
      name: "Can Tho",
      state: "CT",
      country: "Vietnam"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Location creation successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Location creation failed:', error.response.data);
  }
}

testCreateLocation();
```

### Update Location

Updates an existing location. Admin access required.

- **URL**: `/api/locations/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Request Body

```json
{
  "name": "Updated Da Nang",
  "state": "DNG"
}
```

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Location updated successfully.",
  "data": {
    "id": 3,
    "name": "Updated Da Nang",
    "state": "DNG",
    "country": "Vietnam",
    "created_at": "2025-07-27T15:00:00.000Z",
    "updated_at": "2025-07-27T16:30:00.000Z"
  }
}
```

#### Error Response

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Location not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testUpdateLocation(locationId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to update the location
    const response = await axios.put(`http://localhost:3000/api/locations/${locationId}`, {
      name: "Updated Location Name",
      state: "ULN"
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Location update successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Location update failed:', error.response.data);
  }
}

// Test with a valid location ID
testUpdateLocation(3);
```

### Delete Location

Deletes an existing location. Admin access required.

- **URL**: `/api/locations/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Permissions**: Admin
- **Headers**: 
  - Authorization: Bearer {token}

#### Success Response

- **Code**: 200 OK
- **Content**:

```json
{
  "success": true,
  "message": "Location deleted successfully."
}
```

#### Error Response

- **Code**: 400 Bad Request
- **Content**:

```json
{
  "success": false,
  "message": "Cannot delete location. It is associated with one or more stations."
}
```

OR

- **Code**: 401 Unauthorized
- **Content**:

```json
{
  "success": false,
  "message": "Unauthorized."
}
```

OR

- **Code**: 403 Forbidden
- **Content**:

```json
{
  "success": false,
  "message": "Admin access required."
}
```

OR

- **Code**: 404 Not Found
- **Content**:

```json
{
  "success": false,
  "message": "Location not found."
}
```

#### Sample Test

```javascript
const axios = require('axios');

async function testDeleteLocation(locationId) {
  try {
    // First login as admin to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: "admin@example.com",
      password: "adminpassword"
    });
    
    const token = loginResponse.data.data.token;
    
    // Then use the token to delete the location
    const response = await axios.delete(`http://localhost:3000/api/locations/${locationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Location deletion successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Location deletion failed:', error.response.data);
  }
}

// Test with a valid location ID
testDeleteLocation(3);
```
