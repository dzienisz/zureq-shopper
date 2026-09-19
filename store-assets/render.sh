#!/usr/bin/env bash
# Render Chrome Web Store screenshots from the raw HTML sources.
set -euo pipefail

CHROME="${CHROME:-google-chrome}"
SRC="$(cd "$(dirname "$0")/src" && pwd)"
OUT="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

shot() {
  local name="$1" width="$2" height="$3"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --hide-scrollbars --force-device-scale-factor=1 \
    --user-data-dir="$PROFILE/$name" --window-size="$width,$height" \
    --screenshot="$OUT/$name.png" "file://$SRC/$name.html" >/dev/null 2>&1
  echo "rendered $name.png ($width×$height)"
}

shot shot1-search 1280 800
shot shot2-compare 1280 800
shot shot3-build 1280 800
shot shot4-assistant 1280 800
shot shot5-shop-page 1280 800
shot tile-small 440 280
shot tile-marquee 1400 560
