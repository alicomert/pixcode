#!/bin/bash
#
# Pixcode — macOS Gatekeeper fix
#
# Double-click this file once after dragging Pixcode.app to
# /Applications. It removes the quarantine attribute Gatekeeper uses
# to block unsigned apps and opens Pixcode.
#
# Why this exists: until we sign the app with an Apple Developer ID
# ($99/year Apple Developer Program), macOS shows "Pixcode is damaged
# and can't be opened." The binary is fine — Gatekeeper is just
# refusing to launch an unsigned app. This script removes the
# quarantine flag from the .app bundle. Run it once; the fix persists
# until you download a new installer (which will need the same fix).

set -u

APP_PATH="/Applications/Pixcode.app"

cat <<'BANNER'
╭────────────────────────────────────────╮
│        Pixcode Gatekeeper Fix          │
╰────────────────────────────────────────╯

This script will remove the macOS quarantine flag
from Pixcode.app so it can launch.

BANNER

if [ ! -d "$APP_PATH" ]; then
  echo "❌ Pixcode.app wasn't found at $APP_PATH"
  echo ""
  echo "Please drag Pixcode.app into your Applications folder first,"
  echo "then double-click this script again."
  echo ""
  read -rp "Press Enter to close this window..."
  exit 1
fi

echo "Removing quarantine flag from $APP_PATH…"
if xattr -cr "$APP_PATH" 2>/dev/null; then
  echo "✅ Done."
else
  # xattr -cr can fail silently on some macOS versions; try the
  # explicit name as a fallback.
  echo "Retrying with explicit attribute name…"
  xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null || true
  echo "✅ Done (via explicit attribute removal)."
fi

echo ""
echo "Opening Pixcode…"
open "$APP_PATH"

echo ""
echo "You can close this window. Pixcode is launching."
# Brief pause so the window doesn't vanish before the user reads this.
sleep 2
