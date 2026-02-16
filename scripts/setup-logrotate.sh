#!/bin/bash
# ─── PM2 Logrotate Setup ─────────────────────────────────────────
# Run this once on the server to configure pm2-logrotate
# with 7-day retention and daily rotation.
# ─────────────────────────────────────────────────────────────────

set -e

echo "📦 Installing pm2-logrotate module..."
pm2 install pm2-logrotate

echo "⚙️  Configuring logrotate..."

# Rotate daily at midnight
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# Keep 7 days of logs
pm2 set pm2-logrotate:retain 7

# Compress rotated logs
pm2 set pm2-logrotate:compress true

# Max size before forced rotation (100MB)
pm2 set pm2-logrotate:max_size 100M

# Enable date-based filenames
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD

# Rotate pm2 module logs too
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateModule true

echo "✅ pm2-logrotate configured:"
pm2 get pm2-logrotate
