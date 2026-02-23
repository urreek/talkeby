#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${PLIST_WEB_LABEL:-com.talkeby.web}"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$PROJECT_DIR/logs"
WEB_PORT="${WEB_PORT:-5173}"

NPM_BIN="${NPM_BIN:-}"
if [[ -z "$NPM_BIN" ]]; then
  NPM_BIN="$(command -v npm || true)"
fi

if [[ -z "$NPM_BIN" ]]; then
  echo "Could not find npm binary. Set NPM_BIN=/absolute/path/to/npm and retry."
  exit 1
fi

if [[ ! -x "$NPM_BIN" ]]; then
  echo "npm binary is not executable: $NPM_BIN"
  exit 1
fi

if [[ ! -d "$PROJECT_DIR/web/node_modules" ]]; then
  echo "Missing web dependencies. Run: npm run web:install"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NPM_BIN}</string>
    <string>--prefix</string>
    <string>${PROJECT_DIR}/web</string>
    <string>run</string>
    <string>dev</string>
    <string>--</string>
    <string>--host</string>
    <string>0.0.0.0</string>
    <string>--port</string>
    <string>${WEB_PORT}</string>
  </array>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/web.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/web.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"
plutil -lint "$PLIST_PATH" >/dev/null

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "Installed and started ${LABEL}"
echo "Plist: $PLIST_PATH"
echo "Logs:  $LOG_DIR/web.out.log"
echo "       $LOG_DIR/web.err.log"
