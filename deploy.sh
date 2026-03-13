#!/bin/bash
set -e

REPO="https://github.com/chrissabato/Tennis-SRT-Scorebug-Gateway.git"
APP_DIR="/root/Tennis-SRT-Scorebug-Gateway"
echo "=== Tennis SRT Scorebug Gateway — Deploy ==="

# System packages
echo "--- Installing system dependencies..."
apt-get update -qq
apt-get install -y \
  ffmpeg \
  nodejs npm \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev pkg-config \
  ufw

# Node global tools
echo "--- Installing PM2..."
npm install -g pm2 --silent

# Clone or update repo
if [ -d "$APP_DIR" ]; then
  echo "--- Updating existing repo..."
  git -C "$APP_DIR" pull
else
  echo "--- Cloning repo..."
  git clone "$REPO" "$APP_DIR"
fi

# App dependencies
echo "--- Installing npm dependencies..."
cd "$APP_DIR"
npm install --silent

# Firewall
echo "--- Configuring firewall..."
ufw allow 22/tcp
ufw allow 3000/tcp
ufw allow 5000:5010/udp
ufw allow 6001:6010/udp
ufw --force enable

# Start app
echo "--- Starting app with PM2..."
cd "$APP_DIR"
pm2 delete tennis-gateway 2>/dev/null || true
pm2 start server.js --name tennis-gateway
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

IP=$(curl -s https://api.ipify.org)
echo ""
echo "=== Done! ==="
echo "    App:  http://$IP:3000"
echo "    Logs: pm2 logs tennis-gateway"
