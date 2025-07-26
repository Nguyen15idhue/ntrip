@echo off
echo Creating NTRIP Relay database...
echo.

:: Check if mysql is available
where mysql >nul 2>&1
if %errorlevel% neq 0 (
  echo MySQL not found in PATH. Make sure MySQL is installed and in your PATH.
  exit /b 1
)

:: Create database
echo CREATE DATABASE IF NOT EXISTS ntrip_relay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; | mysql -u root

if %errorlevel% neq 0 (
  echo Failed to create database. Make sure MySQL is running and credentials are correct.
  exit /b 1
)

echo Database created successfully!
echo.

echo Running migration...
node src/utils/migrate.js

if %errorlevel% neq 0 (
  echo Migration failed.
  exit /b 1
)

echo.
echo Setup completed successfully!
echo.
echo You can now start the application using:
echo npm start
echo.

pause
