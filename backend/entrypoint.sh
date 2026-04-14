#!/bin/bash
set -e

ARC_DIR="/root/.arc"
KEYS_DIR="$ARC_DIR/keys"
DB="$ARC_DIR/records.db"

mkdir -p "$KEYS_DIR"

# DB is seeded at FastAPI startup via seed_production_db() in api.py.
# No baked seed.db — keeps the records table free of legacy ?-alias rows.

# Auto-generate a signing key if none exist
if [ -z "$(ls -A "$KEYS_DIR" 2>/dev/null)" ]; then
  python -c "import arc; arc.generate_keypair('default')"
  echo "Generated default keypair"
fi

exec uvicorn api:app --host 0.0.0.0 --port "${PORT:-8000}"
