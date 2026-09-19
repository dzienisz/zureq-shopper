#!/usr/bin/env bash
# Bump the extension and package versions together.
set -euo pipefail

new="${1:-}"
if ! printf '%s' "$new" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "usage: scripts/bump-version.sh <major.minor.patch>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for file in manifest.json package.json; do
  tmp="$(mktemp)"
  awk -v v="$new" '
    !done && /"version"[[:space:]]*:/ {
      sub(/"version"[[:space:]]*:[[:space:]]*"[^"]*"/, "\"version\": \"" v "\"")
      done = 1
    }
    { print }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
  echo "  $file → $new"
done

echo "✓ bumped to $new"
