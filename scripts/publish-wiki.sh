#!/usr/bin/env bash
# Publish docs/wiki/ to the GitHub wiki (ADR-0010).
#
# docs/wiki/ in this repository is the source of truth. This script copies it into a local
# clone of the wiki repository (build/wiki) and commits there. It does NOT push: pushing the
# wiki always needs the owner's approval. After reviewing the commit, push with:
#   git -C build/wiki push
#
# The wiki repository only exists after the first wiki page has been created on GitHub
# (Wiki tab → Create the first page). Until then the clone step fails.
set -euo pipefail

WIKI_URL="https://github.com/asmithlabs/tabellify.wiki.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/docs/wiki"
DEST="$ROOT/build/wiki"

if [ ! -d "$SRC" ]; then
  echo "error: $SRC not found" >&2
  exit 1
fi

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" pull --ff-only
else
  mkdir -p "$ROOT/build"
  git clone "$WIKI_URL" "$DEST"
fi

# Copy pages (top level of docs/wiki only; the wiki is flat). Files deleted from docs/wiki
# are not removed from the wiki automatically; delete them in build/wiki by hand.
cp "$SRC"/*.md "$DEST"/

SOURCE_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  echo "Wiki already up to date with docs/wiki ($SOURCE_COMMIT)."
  exit 0
fi
git -C "$DEST" commit -m "docs: sync wiki from docs/wiki at $SOURCE_COMMIT"
echo "Committed in build/wiki. Review with: git -C build/wiki show --stat"
echo "Push only with owner approval: git -C build/wiki push"
