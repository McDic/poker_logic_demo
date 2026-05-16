#!/usr/bin/env bash
# Build the black-dealing WASM crate and emit bindings into web/src/wasm.
#
# Usage:
#   ./scripts/build-wasm.sh          # release build (default)
#   ./scripts/build-wasm.sh dev      # dev profile, fast incremental
set -euo pipefail

PROFILE="${1:-release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WASM_CRATE="$PROJECT_ROOT/crates/black-dealing"
OUT_DIR="$PROJECT_ROOT/web/src/wasm"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "error: wasm-pack is not installed (cargo install wasm-pack)" >&2
  exit 1
fi

echo "=== Building black-dealing WASM ($PROFILE) ==="
echo "crate:  $WASM_CRATE"
echo "output: $OUT_DIR"

cd "$WASM_CRATE"
case "$PROFILE" in
  release) wasm-pack build --target web --release --out-dir "$OUT_DIR" ;;
  dev)     wasm-pack build --target web --dev     --out-dir "$OUT_DIR" ;;
  *)       echo "unknown profile: $PROFILE" >&2; exit 2 ;;
esac

# Strip files that conflict with our own package.json / .gitignore handling.
rm -f "$OUT_DIR/.gitignore" "$OUT_DIR/package.json" "$OUT_DIR/README.md"

echo "=== Done. Generated files: ==="
ls -1 "$OUT_DIR"
