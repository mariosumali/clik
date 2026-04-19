#!/usr/bin/env bash
set -euo pipefail

echo "Running release smoke checks..."
swift build -c release
swift test
swift run autoclicker doctor

echo "Smoke checks complete."
