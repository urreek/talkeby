#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${WEB_PORT:-5173}"
WEB_URL="${WEB_URL:-http://127.0.0.1:${WEB_PORT}}"
TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install it first:"
  echo "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

echo "Starting Cloudflare tunnel to ${WEB_URL}"

if [[ -n "$TUNNEL_TOKEN" ]]; then
  echo "Using persistent tunnel token from CLOUDFLARE_TUNNEL_TOKEN"
  exec cloudflared tunnel run --token "$TUNNEL_TOKEN"
fi

echo "Using quick tunnel (ephemeral URL)"
exec cloudflared tunnel --url "$WEB_URL"
