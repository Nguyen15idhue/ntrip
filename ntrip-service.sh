#!/bin/bash

# Script to manage NTRIP Relay service on Ubuntu

function show_usage() {
    echo "NTRIP Relay Service Management"
    echo "------------------------------"
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start    - Start the NTRIP Relay service"
    echo "  stop     - Stop the NTRIP Relay service"
    echo "  restart  - Restart the NTRIP Relay service"
    echo "  status   - Check the status of the NTRIP Relay service"
    echo "  logs     - View the service logs"
    echo "  update   - Update the application from git repository"
    echo "  backup   - Create a backup of the database"
    echo "  help     - Show this help message"
}

case "$1" in
    start)
        echo "Starting NTRIP Relay service..."
        sudo systemctl start ntrip-relay.service
        ;;
    stop)
        echo "Stopping NTRIP Relay service..."
        sudo systemctl stop ntrip-relay.service
        ;;
    restart)
        echo "Restarting NTRIP Relay service..."
        sudo systemctl restart ntrip-relay.service
        ;;
    status)
        echo "Checking NTRIP Relay service status..."
        sudo systemctl status ntrip-relay.service
        ;;
    logs)
        echo "Showing NTRIP Relay service logs..."
        sudo journalctl -u ntrip-relay.service -f
        ;;
    update)
        echo "Updating NTRIP Relay from repository..."
        cd "$(dirname "$0")"
        git pull
        npm install
        echo "Restarting service to apply updates..."
        sudo systemctl restart ntrip-relay.service
        ;;
    backup)
        echo "Creating database backup..."
        TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
        BACKUP_FILE="ntrip_relay_backup_$TIMESTAMP.sql"
        
        # Read the database credentials from .env file if available
        if [ -f .env ]; then
            source <(grep -v '^#' .env | sed -E 's/(.*)=(.*)/export \1="\2"/')
        fi
        
        # Use environment variables or defaults
        DB_USER=${DB_USER:-"root"}
        DB_PASS=${DB_PASS:-""}
        DB_NAME=${DB_NAME:-"ntrip_relay"}
        
        if [ -z "$DB_PASS" ]; then
            mysqldump -u $DB_USER $DB_NAME > $BACKUP_FILE
        else
            mysqldump -u $DB_USER -p$DB_PASS $DB_NAME > $BACKUP_FILE
        fi
        
        echo "Backup created: $BACKUP_FILE"
        ;;
    help|*)
        show_usage
        ;;
esac
