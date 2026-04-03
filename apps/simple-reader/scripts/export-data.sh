#!/bin/bash
# Export simple-reader data for migration to another machine.
# Usage: ./export-data.sh [output-dir]

set -e

DATA_DIR="$HOME/Library/Application Support/simple-reader"
OUTPUT_DIR="${1:-$HOME/Desktop/simple-reader-export}"

if [ ! -d "$DATA_DIR" ]; then
  echo "Error: Data directory not found at $DATA_DIR"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Copy database
if [ -f "$DATA_DIR/simple-reader.db" ]; then
  cp "$DATA_DIR/simple-reader.db" "$OUTPUT_DIR/"
  echo "✓ Database copied ($(du -h "$OUTPUT_DIR/simple-reader.db" | cut -f1))"
else
  echo "⚠ No database found"
fi

# Copy preferences (contains API keys)
if [ -f "$DATA_DIR/simple-reader-preferences.json" ]; then
  cp "$DATA_DIR/simple-reader-preferences.json" "$OUTPUT_DIR/"
  echo "✓ Preferences copied"
else
  echo "⚠ No preferences found"
fi

echo ""
echo "Exported to: $OUTPUT_DIR"
echo "Transfer this folder to the new machine, then run import-data.sh"
