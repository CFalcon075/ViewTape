@echo off
title ViewTape Server
setlocal enabledelayedexpansion

:: Make sure we run from the script's own directory
cd /d "%~dp0"

echo ========================================
echo   ViewTape - Share Ep0k Stuff!
echo ========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [ViewTape] Node.js found:
node --version
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo [ViewTape] Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [ViewTape] Dependencies installed.
) else (
    echo [ViewTape] Dependencies already installed.
)
echo.

:: ========================================
:: PORT SELECTION
:: ========================================
echo ----------------------------------------
echo   PORT CONFIGURATION
echo ----------------------------------------
set "VT_PORT=3000"
set /p "VT_PORT=Enter port number [default: 3000]: "
if "!VT_PORT!"=="" set "VT_PORT=3000"
echo [ViewTape] Using port: !VT_PORT!
echo.

:: ========================================
:: BINDING SELECTION
:: ========================================
echo ----------------------------------------
echo   NETWORK ACCESS
echo ----------------------------------------
echo   1) localhost only (private, just this PC)
echo   2) Open to network (LAN / port forwarding)
echo.
set "VT_BIND_CHOICE=2"
set /p "VT_BIND_CHOICE=Choose [1 or 2, default: 2]: "
if "!VT_BIND_CHOICE!"=="1" (
    set "VT_HOST=127.0.0.1"
    echo [ViewTape] Binding: localhost only
) else (
    set "VT_HOST=0.0.0.0"
    echo [ViewTape] Binding: open to network ^(0.0.0.0^)
)
echo.

:: ========================================
:: PASSWORD PROTECTION
:: ========================================
echo ----------------------------------------
echo   SERVER SECURITY
echo ----------------------------------------
set "VT_PASSWORD="
set /p "VT_PASSWORD=Set a server password (leave blank to skip): "
if not "!VT_PASSWORD!"=="" (
    echo [ViewTape] Password protection: ENABLED
) else (
    echo [ViewTape] Password protection: disabled
)
echo.

:: ========================================
:: 2FA (TWO-FACTOR AUTHENTICATION)
:: ========================================
set "VT_2FA_SECRET="
if not "!VT_PASSWORD!"=="" (
    echo ----------------------------------------
    echo   TWO-FACTOR AUTHENTICATION
    echo ----------------------------------------
    set "VT_2FA_CHOICE=n"
    set /p "VT_2FA_CHOICE=Enable 2FA? (y/n) [default: n]: "
    if /i "!VT_2FA_CHOICE!"=="y" (
        :: Generate a random base32 secret using the helper script
        for /f "delims=" %%s in ('node gen_secret.js') do set "VT_2FA_SECRET=%%s"
        echo [ViewTape] 2FA: ENABLED
        echo [ViewTape] Your 2FA secret: !VT_2FA_SECRET!
        echo [ViewTape] After the server starts, visit /gate/2fa-setup-qr to scan the QR code
        echo [ViewTape]   with Google Authenticator, Authy, or any TOTP app.
    ) else (
        echo [ViewTape] 2FA: disabled
    )
    echo.
)

:: ========================================
:: KILL EXISTING SERVER ON CHOSEN PORT
:: ========================================
echo [ViewTape] Checking for existing server on port !VT_PORT!...
set "VT_FOUND="
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":!VT_PORT! " ^| findstr /i "LISTENING"') do (
    set "VT_FOUND=1"
    echo [ViewTape] Killing existing process on port !VT_PORT! - PID %%a
    taskkill /F /PID %%a >nul 2>nul
)
if defined VT_FOUND (
    echo [ViewTape] Waiting for port to free up...
    timeout /t 2 /nobreak >nul
)
echo [ViewTape] Port !VT_PORT! is clear.
echo.

:: ========================================
:: SET ENVIRONMENT VARIABLES AND START
:: ========================================
set "PORT=!VT_PORT!"
set "HOST=!VT_HOST!"
if not "!VT_PASSWORD!"=="" set "SERVER_PASSWORD=!VT_PASSWORD!"
if not "!VT_2FA_SECRET!"=="" set "SERVER_2FA_SECRET=!VT_2FA_SECRET!"

echo ========================================
echo   STARTING VIEWTAPE SERVER
echo ========================================
echo   Port:     !VT_PORT!
echo   Binding:  !VT_HOST!
if not "!VT_PASSWORD!"=="" (
    echo   Password: ON
    if not "!VT_2FA_SECRET!"=="" echo   2FA:      ON
)
echo ========================================
echo.
echo [ViewTape] Press Ctrl+C to stop the server.
echo.

:: Open the default browser after a short delay
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:!VT_PORT!"

node server.js

echo.
echo [ViewTape] Server stopped.
pause
