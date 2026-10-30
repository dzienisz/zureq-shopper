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

mapfile -t package_files < <(sed '/^[[:space:]]*#/d; /^[[:space:]]*$/d' scripts/files.txt)
for file in "${package_files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Missing package file: $file" >&2
    exit 1
  fi
done
zip -q "$ZIP" "${package_files[@]}"

fail=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; fail=1; }
listing_has() { grep -qE "[[:space:]]$2\$" <<<"$1"; }

listing="$(unzip -l "$ZIP")"
echo "Verifying $ZIP:"
for file in manifest.json background.js list.js loading.js autocompare.js watchlist.js sidepanel.html icons/zureq-mark.svg LICENSE; do
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
