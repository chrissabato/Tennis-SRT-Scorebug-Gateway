#!/bin/bash
set -e

echo "--- Killing FFmpeg processes..."
pkill -f ffmpeg 2>/dev/null || true

echo "--- Pulling latest..."
git -C "$(dirname "$0")" pull

echo "--- Restarting app..."
pm2 restart tennis-gateway

echo "Done."
