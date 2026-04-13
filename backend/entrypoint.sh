#!/bin/bash
set -e

ARC_DIR="/root/.arc"
KEYS_DIR="$ARC_DIR/keys"
DB="$ARC_DIR/records.db"

mkdir -p "$KEYS_DIR"

# Seed DB from baked-in copy if volume is empty
if [ ! -f "$DB" ] && [ -f /app/seed.db ]; then
  cp /app/seed.db "$DB"
  echo "Seeded records.db from build image"
fi

# Auto-generate a signing key if none exist
if [ -z "$(ls -A "$KEYS_DIR" 2>/dev/null)" ]; then
  python -c "import arc; arc.generate_keypair('default')"
  echo "Generated default keypair"
fi

exec uvicorn api:app --host 0.0.0.0 --port "${PORT:-8000}"
