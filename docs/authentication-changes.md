# Authentication Changes Documentation

## Overview

This document outlines the changes made to upgrade the authentication system from Basic Authentication to JWT Bearer Token Authentication across the NTRIP Relay Service.

## Changes Made

### 1. Authentication Middleware (`src/middleware/auth.js`)

The authentication middleware has been updated to support JWT Bearer Token authentication:

- Removed Basic Auth verification
- Added JWT token verification
- Set up user details in request object for downstream handlers

### 2. NTRIP Caster (`src/ntrip/ntrip-caster.js`)

The NTRIP Caster has been updated to support dual authentication methods:

- **Basic Authentication**: Maintained for backward compatibility with GNSS devices that don't support modern auth methods
- **Bearer Token Authentication**: Added for API clients and modern applications

The `_authenticateRover` method now handles both authentication types:
- Detects auth type based on header prefix (`Basic` or `Bearer`)
- For Basic auth: Validates username/password against Rover model
- For Bearer auth: Validates JWT token and finds associated rover

### 3. API Documentation

Documentation files have been updated to reflect the authentication changes:

- **api-documentation.md**: Updated all API examples to use Bearer token auth
- **docs/api-reference.md**: Updated with Bearer token authentication details

### 4. Migration Guide

A migration guide has been added to help clients transition from Basic Auth to Bearer Tokens:

- **Old Method**: Basic authentication with username/password
- **New Method**: JWT bearer token authentication
- **Benefits**: Enhanced security, stateless authentication, token expiration
- **Best Practices**: Token storage, refresh logic, HTTPS usage

## Testing

The NTRIP server has been tested and is running successfully with the new authentication system. It can now:

1. Accept Basic Auth credentials from GNSS devices
2. Accept Bearer Tokens from API clients
3. Properly validate both types of credentials
4. Connect authenticated clients to the appropriate NTRIP streams

## Backward Compatibility

For backward compatibility, GNSS devices can continue to use Basic Authentication. This dual authentication system ensures a smooth transition while maintaining security for all client types.

## Next Steps

1. Consider implementing a token refresh endpoint for long-lived API clients
2. Monitor usage of Basic Auth vs Bearer Tokens to determine when Basic Auth can be deprecated
3. Add rate limiting to protect against brute force authentication attempts
