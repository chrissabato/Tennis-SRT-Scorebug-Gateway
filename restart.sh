#!/bin/bash
set -e

echo "--- Killing FFmpeg processes..."
pkill -9 -f ffmpeg 2>/dev/null || true

echo "--- Freeing port 3000..."
fuser -k 3000/tcp 2>/dev/null || true
sleep 2

echo "--- Pulling latest..."
git -C "$(dirname "$0")" pull

echo "--- Restarting app..."
pm2 restart tennis-gateway || pm2 start ecosystem.config.js

echo "Done."
