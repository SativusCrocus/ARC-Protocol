#!/bin/bash
set -e

# ARC_HOME can be set by the deploy (Railway: persistent volume mount path,
# e.g. /data/.arc). Default to /root/.arc for Docker, /tmp/.arc is picked
# automatically by arc.py if nothing else is writable.
: "${ARC_HOME:=/root/.arc}"
export ARC_HOME

KEYS_DIR="$ARC_HOME/keys"

# Best-effort mkdir. If this fails (read-only FS), arc.py will fall back
# to /tmp/.arc at import time — see _resolve_arc_dir().
mkdir -p "$KEYS_DIR" 2>/dev/null || echo "[entrypoint] mkdir $KEYS_DIR failed; arc.py will fall back" >&2

# Auto-generate a signing key if none exist. Swallow failures — the seed
# code in api.py generates keys per-alias on demand.
if [ -d "$KEYS_DIR" ] && [ -z "$(ls -A "$KEYS_DIR" 2>/dev/null)" ]; then
  python -c "import arc; arc.generate_keypair('default')" 2>/dev/null \
    && echo "[entrypoint] generated default keypair in $KEYS_DIR" \
    || echo "[entrypoint] default keypair generation deferred to runtime"
fi

exec uvicorn api:app --host 0.0.0.0 --port "${PORT:-8000}"
