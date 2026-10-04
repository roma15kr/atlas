#!/usr/bin/env bash
# Usage: ./scripts/new-project.sh /path/to/project
# Copies the template into a new or existing project (never overwrites files), detects the
# project's stacks for the Makefile, then sets up OpenSpec.
set -euo pipefail
TARGET="${1:?Usage: new-project.sh /path/to/project}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$TARGET"

agents_existed=false
[ -f "$TARGET/AGENTS.md" ] && agents_existed=true

(cd "$SRC" && find . -type f ! -path './.git/*' ! -path './README.md') | while IFS= read -r f; do
  if [ ! -e "$TARGET/$f" ]; then
    mkdir -p "$TARGET/$(dirname "$f")"
    cp -p "$SRC/$f" "$TARGET/$f"
  fi
done

cd "$TARGET"
[ -d .git ] || git init -q
./scripts/detect-stacks.sh .

# A freshly added AGENTS.md keeps only the verification notes for this project's stacks.
if [ "$agents_existed" = false ]; then
  stacks="$(sed -n 's/^STACKS := *//p' Makefile 2> /dev/null || true)"
  for s in php python ts; do
    if [ -z "$stacks" ] || [[ " $stacks " == *" $s "* ]]; then
      sed -i "/^<!-- \/\{0,1\}stack:$s -->$/d" AGENTS.md
    else
      sed -i "/^<!-- stack:$s -->$/,/^<!-- \/stack:$s -->$/d" AGENTS.md
    fi
  done
fi

./scripts/init-openspec.sh .
echo "Done: $TARGET. Next: fill the <placeholders> in AGENTS.md, check 'make help', then commit."
