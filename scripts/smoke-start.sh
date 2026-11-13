#!/bin/bash
# Start a Tabellify smoke test in the dev profile (macOS, owner use only).
#   1. Quits Zotero and waits until it has exited.
#   2. Backs up the dev profile's Tabellify codebook to the Desktop (timestamped).
#   3. Starts Zotero with the tabellify-dev profile, Debug Output to the next free
#      build/debug-N.txt.
# Usage: scripts/smoke-start.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
zotero="/Applications/Zotero.app/Contents/MacOS/zotero"
data="$HOME/Zotero tabellify-dev/tabellify"

# 1. Quit Zotero (if running) and wait up to 30 s for it to exit.
if pgrep -x zotero >/dev/null; then
  echo "Quitting Zotero…"
  osascript -e 'quit app "Zotero"' || true
  for _ in $(seq 1 30); do pgrep -x zotero >/dev/null || break; sleep 1; done
  if pgrep -x zotero >/dev/null; then
    echo "Zotero is still running. Quit it by hand, then run this script again." >&2
    exit 1
  fi
fi
echo "Zotero is closed."

# 2. Back up the codebook (and layout) files.
stamp=$(date +%Y%m%d-%H%M%S)
backup="$HOME/Desktop/tabellify-backup-$stamp"
if [ -d "$data" ]; then
  mkdir -p "$backup"
  cp -p "$data"/*.json "$backup"/ 2>/dev/null || true
  echo "Backed up $(ls "$backup" | wc -l | tr -d ' ') file(s) to $backup"
  grep -h '"schemaVersion"' "$backup/codebooks.json" 2>/dev/null | head -1 || true
else
  echo "No Tabellify data folder yet; nothing to back up."
fi

# 3. Start Zotero with Debug Output to the next free build/debug-N.txt.
mkdir -p "$repo/build"
n=1
while [ -e "$repo/build/debug-$n.txt" ]; do n=$((n + 1)); done
log="$repo/build/debug-$n.txt"
echo "Starting Zotero (profile tabellify-dev). Debug Output: build/debug-$n.txt"
echo "Leave this Terminal window open; it is free again when Zotero quits."
"$zotero" -P tabellify-dev -ZoteroDebugText > "$log" 2>&1
echo "Zotero quit. Debug Output saved in build/debug-$n.txt"
