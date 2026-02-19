#!/usr/bin/env bash
set -euo pipefail

LABEL="${PLIST_LABEL:-com.talkeby.worker}"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Uninstalled ${LABEL}"
echo "Removed: $PLIST_PATH"
