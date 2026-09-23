#!/usr/bin/env bash
# Package the raw Chrome extension files for the Chrome Web Store.
#
# This is not a build step. ZUREQ Shopper ships plain JavaScript, HTML, and
# CSS; this script only creates and verifies the distribution zip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

read_version() {
  grep '"version"' "$1" | head -1 | tr -d ' ",' | cut -d: -f2
}

VERSION="$(read_version manifest.json)"
ZIP="zureq-shopper-$VERSION.zip"
rm -f "$ZIP"

zip -q "$ZIP" \
  manifest.json background.js zureq.js builds.js assistant.js optimizer.js autocompare.js share.js pagescan.js content.js watchlist.js \
  sidepanel.html sidepanel.js sidepanel.css \
  options.html options.js options.css \
  icons/icon16.png icons/icon48.png icons/icon128.png LICENSE

fail=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; fail=1; }
listing_has() { grep -qE "[[:space:]]$2\$" <<<"$1"; }

listing="$(unzip -l "$ZIP")"
echo "Verifying $ZIP:"
for file in manifest.json background.js optimizer.js autocompare.js share.js watchlist.js sidepanel.html LICENSE; do
  listing_has "$listing" "$file" && ok "$file" || bad "missing $file"
done
listing_has "$listing" "test/" && bad "test/ must not ship" || ok "no test/"
listing_has "$listing" "store-assets/" && bad "store-assets/ must not ship" || ok "no store-assets/"

for file in $(zipinfo -1 "$ZIP"); do
  if grep -a -F -m1 'zmcp_' <(unzip -p "$ZIP" "$file") >/dev/null; then
    bad "secret-like zmcp_ literal found in $file"
  fi
done
if ! grep -q 'zmcp_' <<<"$(unzip -p "$ZIP" manifest.json)"; then
  ok "no zmcp_ secret literals"
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ package verification failed" >&2
  exit 1
fi

echo
unzip -l "$ZIP"
echo
ls -lh "$ZIP"
echo "✓ package ready"
