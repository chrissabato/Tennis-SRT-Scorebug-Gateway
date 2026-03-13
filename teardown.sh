#!/bin/bash

echo "=== Tennis SRT Scorebug Gateway — Teardown ==="

# Stop app and remove PM2
echo "--- Stopping app..."
pm2 delete tennis-gateway 2>/dev/null || true
pm2 save 2>/dev/null || true

# Stop nginx
echo "--- Stopping Nginx..."
systemctl stop nginx 2>/dev/null || true

# Kill any lingering FFmpeg processes
echo "--- Killing FFmpeg processes..."
pkill -f ffmpeg 2>/dev/null || true

# Clean up FIFOs
echo "--- Cleaning up FIFOs..."
rm -f /tmp/tennis-scorebug-*.fifo

echo ""
echo "=== Teardown complete. Safe to destroy instance. ==="
