#!/usr/bin/env bash
# Creates App/.win95-ui, a link to the @duckdgoose/win95-ui package source.
#
# Why a link at a fixed path instead of `npm link`: `npm install` prunes anything in
# node_modules that is not in package.json, and win95-ui is deliberately not in
# package.json. A link outside node_modules is invisible to npm, so it survives.
#
# Why a link at all instead of a relative path in the configs: each git worktree sits at a
# different depth under the repo root, so no single relative path is correct everywhere.
# This link is always at App/.win95-ui, whichever worktree you are in.
#
# Usage:  bash Scripts/link-win95-ui.sh [path-to-win95-ui]
#         WIN95_UI_SRC=/path/to/win95-ui bash Scripts/link-win95-ui.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
link="$repo_root/App/.win95-ui"

# Walk up looking for the sibling duckdgoose checkout. Worktrees live at different depths
# (main/App vs defect/app-scaffold/App), so counting "../" is not reliable.
find_default() {
  local dir="$repo_root"
  while [ "$dir" != "/" ] && [ "$dir" != "" ]; do
    for cand in "$dir"/personal-new/*/Packages/win95-ui "$dir"/personal-new/*/*/Packages/win95-ui; do
      [ -f "$cand/package.json" ] && { echo "$cand"; return; }
    done
    dir="$(dirname "$dir")"
  done
}
default_src="$(find_default)"
src="${1:-${WIN95_UI_SRC:-$default_src}}"

if [ ! -f "$src/package.json" ]; then
  echo "error: no package.json at '$src'" >&2
  echo "Pass the path to the win95-ui package, or set WIN95_UI_SRC." >&2
  exit 1
fi
src="$(cd "$src" && pwd)"

rm -rf "$link"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # Junctions work without Developer Mode or admin rights; plain symlinks do not.
    cmd //c mklink //J "$(cygpath -w "$link")" "$(cygpath -w "$src")" >/dev/null
    ;;
  *)
    ln -s "$src" "$link"
    ;;
esac

echo "linked App/.win95-ui -> $src"
