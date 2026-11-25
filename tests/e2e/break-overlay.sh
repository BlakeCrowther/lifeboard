#!/bin/sh
# Builds Lifeboard Break (break/desktop) and runs its end-to-end test (break-overlay.ts) in a virtual X display with
# a window manager. Linux only. Exit 2 when a tool is missing (verify then SKIPs the row).
set -e
cd "$(dirname "$0")/../.."
for tool in xvfb-run openbox xdotool; do
  command -v "$tool" >/dev/null || { echo "break-overlay: needs $tool (apt-get install xvfb openbox xdotool)"; exit 2; }
done
pnpm -s break:build >/dev/null
exec xvfb-run -a -s "-screen 0 1440x900x24" sh -c \
  'openbox >/dev/null 2>&1 & node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/e2e/break-overlay.ts'
