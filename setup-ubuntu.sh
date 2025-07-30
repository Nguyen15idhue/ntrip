#!/bin/bash

# Update package list and upgrade existing packages
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js, npm and MySQL
echo "Installing Node.js, npm and MySQL..."
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs mysql-server

# Check if Node.js and npm were installed successfully
node_version=$(node -v)
npm_version=$(npm -v)
echo "Node.js version: $node_version"
echo "npm version: $npm_version"

# Configure MySQL
echo "Configuring MySQL..."
sudo mysql_secure_installation

# Create database for the application
echo "Creating database for the application..."
sudo mysql -e "CREATE DATABASE IF NOT EXISTS ntrip_relay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "System dependencies installed successfully."
