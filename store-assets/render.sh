#!/usr/bin/env bash
# Render Chrome Web Store screenshots from the raw HTML sources (needs ImageMagick).
set -euo pipefail

CHROME="${CHROME:-google-chrome}"
SRC="$(cd "$(dirname "$0")/src" && pwd)"
OUT="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

chrome() {
  "$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --hide-scrollbars --force-device-scale-factor=1 "$@" 2>/dev/null
}

# Headless Chrome reserves part of --window-size for window chrome, so measure
# how much the viewport loses and request that much extra, then crop.
probe="$PROFILE/probe.html"
printf '<script>document.write(innerHeight)</script>' > "$probe"
PROBE_HEIGHT=1000
VIEWPORT="$(chrome --user-data-dir="$PROFILE/probe" --window-size="1000,$PROBE_HEIGHT" \
  --dump-dom "file://$probe" | grep -o '[0-9]\+' | tail -1)"
DELTA=$((PROBE_HEIGHT - VIEWPORT))

shot() {
  local name="$1" width="$2" height="$3"
  chrome --user-data-dir="$PROFILE/$name" --window-size="$width,$((height + DELTA))" \
    --screenshot="$OUT/$name.png" "file://$SRC/$name.html" >/dev/null
  convert "$OUT/$name.png" -crop "${width}x${height}+0+0" +repage "$OUT/$name.png"
  local got
  got="$(identify -format '%wx%h' "$OUT/$name.png")"
  [ "$got" = "${width}x${height}" ] || { echo "$name.png is $got, expected ${width}x${height}" >&2; exit 1; }
  echo "rendered $name.png ($got)"
}

shot shot1-search 1280 800
shot shot2-compare 1280 800
shot shot3-build 1280 800
shot shot4-watch 1280 800
shot shot5-shop-page 1280 800
shot tile-small 440 280
shot tile-marquee 1400 560
