#!/usr/bin/env bash
# Compiles the Swift helper binary that performs CGEventPost clicks.
# Output: resources/clik-helper  (shipped via extraResource)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="$ROOT/resources/clik-helper"

mkdir -p "$ROOT/resources"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "swiftc not found. Install Xcode Command Line Tools: xcode-select --install" >&2
  exit 1
fi

ARM_OUT="$ROOT/resources/.clik-helper.arm64"
X86_OUT="$ROOT/resources/.clik-helper.x86_64"

echo "==> building clik-helper (arm64)"
swiftc -O -target arm64-apple-macos12.0 \
  -framework CoreGraphics -framework ApplicationServices \
  "$HERE/helper.swift" -o "$ARM_OUT"

if xcrun --sdk macosx --find swiftc >/dev/null 2>&1; then
  # Try x86_64 slice; if the toolchain does not support it just skip and ship arm64-only.
  if swiftc -O -target x86_64-apple-macos12.0 \
       -framework CoreGraphics -framework ApplicationServices \
       "$HERE/helper.swift" -o "$X86_OUT" 2>/dev/null; then
    echo "==> fusing universal binary"
    lipo -create "$ARM_OUT" "$X86_OUT" -output "$OUT"
    rm -f "$ARM_OUT" "$X86_OUT"
  else
    echo "==> x86_64 slice unsupported on this toolchain, shipping arm64 only"
    mv "$ARM_OUT" "$OUT"
  fi
else
  mv "$ARM_OUT" "$OUT"
fi

chmod +x "$OUT"
echo "==> built $OUT ($(du -h "$OUT" | cut -f1))"
