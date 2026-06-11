#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/worldcup-polymarket-dashboard"
SERVICE_FILE="/etc/systemd/system/worldcup-dashboard.service"
SYNC_SERVICE_FILE="/etc/systemd/system/worldcup-context-sync.service"
SYNC_TIMER_FILE="/etc/systemd/system/worldcup-context-sync.timer"
HISTORY_SERVICE_FILE="/etc/systemd/system/worldcup-history-archive.service"
HISTORY_TIMER_FILE="/etc/systemd/system/worldcup-history-archive.timer"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but not installed." >&2
  exit 1
fi

sudo mkdir -p "$APP_DIR"
sudo rsync -av --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude data/worldcup-context.json \
  --exclude data/worldcup-history.sqlite \
  --exclude data/worldcup-history.sqlite-shm \
  --exclude data/worldcup-history.sqlite-wal \
  ./ "$APP_DIR/"

sudo cp "$APP_DIR/deploy/worldcup-dashboard.service" "$SERVICE_FILE"
sudo cp "$APP_DIR/deploy/worldcup-context-sync.service" "$SYNC_SERVICE_FILE"
sudo cp "$APP_DIR/deploy/worldcup-context-sync.timer" "$SYNC_TIMER_FILE"
sudo cp "$APP_DIR/deploy/worldcup-history-archive.service" "$HISTORY_SERVICE_FILE"
sudo cp "$APP_DIR/deploy/worldcup-history-archive.timer" "$HISTORY_TIMER_FILE"
sudo systemctl daemon-reload
sudo systemctl enable --now worldcup-dashboard
sudo systemctl enable --now worldcup-context-sync.timer
sudo systemctl enable --now worldcup-history-archive.timer

echo
echo "Node service status:"
sudo systemctl status worldcup-dashboard --no-pager || true

echo
echo "Local health check:"
curl -fsS http://127.0.0.1:4174/worldcup/api/health
echo

echo
echo "Next: paste deploy/nginx-worldcup.conf into the active nginx server block, then run:"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo
echo "Target:"
echo "  http://3.252.137.211/worldcup/"
