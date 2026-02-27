#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "  ViewTape - Share Ep0k Stuff!"
echo "========================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[ViewTape] Node.js found: $(node --version)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[ViewTape] Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install dependencies."
        exit 1
    fi
    echo "[ViewTape] Dependencies installed."
else
    echo "[ViewTape] Dependencies already installed."
fi
echo ""

# ========================================
# PORT SELECTION
# ========================================
echo "----------------------------------------"
echo "  PORT CONFIGURATION"
echo "----------------------------------------"
read -p "Enter port number [default: 3000]: " VT_PORT
VT_PORT=${VT_PORT:-3000}
echo "[ViewTape] Using port: $VT_PORT"
echo ""

# ========================================
# BINDING SELECTION
# ========================================
echo "----------------------------------------"
echo "  NETWORK ACCESS"
echo "----------------------------------------"
echo "  1) localhost only (private, just this machine)"
echo "  2) Open to network (LAN / port forwarding)"
echo ""
read -p "Choose [1 or 2, default: 2]: " VT_BIND_CHOICE
VT_BIND_CHOICE=${VT_BIND_CHOICE:-2}
if [ "$VT_BIND_CHOICE" = "1" ]; then
    VT_HOST="127.0.0.1"
    echo "[ViewTape] Binding: localhost only"
else
    VT_HOST="0.0.0.0"
    echo "[ViewTape] Binding: open to network (0.0.0.0)"
fi
echo ""

# ========================================
# PASSWORD PROTECTION
# ========================================
echo "----------------------------------------"
echo "  SERVER SECURITY"
echo "----------------------------------------"
read -p "Set a server password (leave blank to skip): " VT_PASSWORD
if [ -n "$VT_PASSWORD" ]; then
    echo "[ViewTape] Password protection: ENABLED"
else
    echo "[ViewTape] Password protection: disabled"
fi
echo ""

# ========================================
# 2FA (TWO-FACTOR AUTHENTICATION)
# ========================================
VT_2FA_SECRET=""
if [ -n "$VT_PASSWORD" ]; then
    echo "----------------------------------------"
    echo "  TWO-FACTOR AUTHENTICATION"
    echo "----------------------------------------"
    read -p "Enable 2FA? (y/n) [default: n]: " VT_2FA_CHOICE
    VT_2FA_CHOICE=${VT_2FA_CHOICE:-n}
    if [ "$VT_2FA_CHOICE" = "y" ] || [ "$VT_2FA_CHOICE" = "Y" ]; then
        # Generate a random base32 secret using the helper script
        VT_2FA_SECRET=$(node gen_secret.js)
        echo "[ViewTape] 2FA: ENABLED"
        echo "[ViewTape] Your 2FA secret: $VT_2FA_SECRET"
        echo "[ViewTape] After the server starts, visit /gate/2fa-setup-qr to scan the QR code"
        echo "[ViewTape]   with Google Authenticator, Authy, or any TOTP app."
    else
        echo "[ViewTape] 2FA: disabled"
    fi
    echo ""
fi

# ========================================
# KILL EXISTING SERVER ON CHOSEN PORT
# ========================================
echo "[ViewTape] Checking for existing server on port $VT_PORT..."
EXISTING_PID=$(lsof -ti :$VT_PORT 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
    echo "[ViewTape] Found existing process on port $VT_PORT (PID: $EXISTING_PID). Killing it..."
    kill -9 $EXISTING_PID 2>/dev/null
    sleep 1
fi
echo "[ViewTape] Port $VT_PORT is clear."
echo ""

# ========================================
# SET ENVIRONMENT VARIABLES AND START
# ========================================
export PORT="$VT_PORT"
export HOST="$VT_HOST"
[ -n "$VT_PASSWORD" ] && export SERVER_PASSWORD="$VT_PASSWORD"
[ -n "$VT_2FA_SECRET" ] && export SERVER_2FA_SECRET="$VT_2FA_SECRET"

echo "========================================"
echo "  STARTING VIEWTAPE SERVER"
echo "========================================"
echo "  Port:     $VT_PORT"
echo "  Binding:  $VT_HOST"
if [ -n "$VT_PASSWORD" ]; then
    echo "  Password: ON"
    [ -n "$VT_2FA_SECRET" ] && echo "  2FA:      ON"
fi
echo "========================================"
echo ""
echo "[ViewTape] Press Ctrl+C to stop the server."
echo ""

# Open the default browser after a short delay
(sleep 2 && {
  if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:$VT_PORT"
  elif command -v open &> /dev/null; then
    open "http://localhost:$VT_PORT"
  fi
}) &

node server.js
