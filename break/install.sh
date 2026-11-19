#!/bin/sh
# Builds Lifeboard Break, installs it to ~/Applications, and starts it at login.
# Uninstall: break/install.sh --uninstall
set -e
cd "$(dirname "$0")"
DEST="$HOME/Applications/LifeboardBreak.app"
AGENT="$HOME/Library/LaunchAgents/com.lifeboard.break.plist"
launchctl bootout "gui/$(id -u)" "$AGENT" 2>/dev/null || true
pkill -x LifeboardBreak 2>/dev/null || true
if [ "$1" = "--uninstall" ]; then
  rm -rf "$DEST" "$AGENT"; echo "uninstalled"; exit 0
fi
./build.sh
mkdir -p "$HOME/Applications" "$HOME/Library/LaunchAgents"
rm -rf "$DEST"; cp -R out/LifeboardBreak.app "$DEST"
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.lifeboard.break</string>
  <key>ProgramArguments</key><array><string>$DEST/Contents/MacOS/LifeboardBreak</string></array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$AGENT"
echo "installed $DEST; starts at login"
