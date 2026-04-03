#!/bin/bash
# Import simple-reader data from an export.
# Usage: ./import-data.sh [input-dir]

set -e

DATA_DIR="$HOME/Library/Application Support/simple-reader"
INPUT_DIR="${1:-$HOME/Desktop/simple-reader-export}"

if [ ! -d "$INPUT_DIR" ]; then
  echo "Error: Export directory not found at $INPUT_DIR"
  echo "Usage: ./import-data.sh /path/to/simple-reader-export"
  exit 1
fi

mkdir -p "$DATA_DIR"

# Backup existing data if present
if [ -f "$DATA_DIR/simple-reader.db" ] || [ -f "$DATA_DIR/simple-reader-preferences.json" ]; then
  BACKUP="$DATA_DIR/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  [ -f "$DATA_DIR/simple-reader.db" ] && cp "$DATA_DIR/simple-reader.db" "$BACKUP/"
  [ -f "$DATA_DIR/simple-reader-preferences.json" ] && cp "$DATA_DIR/simple-reader-preferences.json" "$BACKUP/"
  echo "✓ Existing data backed up to $BACKUP"
fi

# Import database
if [ -f "$INPUT_DIR/simple-reader.db" ]; then
  cp "$INPUT_DIR/simple-reader.db" "$DATA_DIR/"
  echo "✓ Database imported"
else
  echo "⚠ No database in export"
fi

# Import preferences
if [ -f "$INPUT_DIR/simple-reader-preferences.json" ]; then
  cp "$INPUT_DIR/simple-reader-preferences.json" "$DATA_DIR/"
  echo "✓ Preferences imported"
else
  echo "⚠ No preferences in export"
fi

echo ""
echo "Done! Restart Simple Reader to use the imported data."
