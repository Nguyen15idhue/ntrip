#!/bin/bash

# Clone the repository
echo "Cloning the repository..."
git clone https://github.com/Nguyen15idhue/ntrip.git
cd ntrip

# Install dependencies
echo "Installing dependencies..."
npm install

# Create environment file
echo "Creating .env file..."
cp .env.example .env

# Open the .env file for editing
echo "Please edit your .env file with appropriate values"
echo "Press any key to open the editor..."
read -n 1
nano .env

# Run migrations
echo "Running database migrations..."
node src/utils/migrate.js

# Create systemd service file for running the application as a service
echo "Creating systemd service file..."
sudo bash -c 'cat > /etc/systemd/system/ntrip-relay.service << EOL
[Unit]
Description=NTRIP Relay System
After=network.target mysql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which node) src/app.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOL'

# Reload systemd, enable and start the service
echo "Starting NTRIP Relay service..."
sudo systemctl daemon-reload
sudo systemctl enable ntrip-relay.service
sudo systemctl start ntrip-relay.service

echo "NTRIP Relay System has been installed and started!"
echo "To check the status of the service, run: sudo systemctl status ntrip-relay.service"
echo "To view logs, run: sudo journalctl -u ntrip-relay.service -f"
