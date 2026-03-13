#!/bin/bash
set -e

echo "--- Stopping PM2 app..."
pm2 stop tennis-gateway 2>/dev/null || true

echo "--- Killing FFmpeg processes..."
pkill -9 -f ffmpeg 2>/dev/null || true

echo "--- Freeing port 3000..."
fuser -k 3000/tcp 2>/dev/null || true
sleep 2

echo "--- Pulling latest..."
git -C "$(dirname "$0")" pull

echo "--- Starting app..."
pm2 start tennis-gateway || pm2 start ecosystem.config.js && pm2 save

echo "Done."
