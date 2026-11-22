#!/bin/sh
# Builds break/out/LifeboardBreak.app. Run: break/build.sh [--run | --now]
set -e
cd "$(dirname "$0")"
APP=out/LifeboardBreak.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -swift-version 5 -o "$APP/Contents/MacOS/LifeboardBreak" LifeboardBreak.swift Pacing.swift
cp placeholder.html "$APP/Contents/Resources/"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.lifeboard.break</string>
  <key>CFBundleName</key><string>Lifeboard Break</string>
  <key>CFBundleExecutable</key><string>LifeboardBreak</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign -s - --force "$APP" >/dev/null 2>&1 || true
echo "built $APP"
case "$1" in
  --run) open "$APP" ;;
  --now) open "$APP" --args --now ;;
esac
