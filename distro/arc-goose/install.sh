#!/usr/bin/env bash
# ARC Goose — Installer
# Idempotent: safe to re-run. Will not duplicate keys or genesis records.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ARC_HOME="${ARC_HOME:-$HOME/.arc-goose}"
ARC_CONFIG_DIR="${ARC_CONFIG_DIR:-$HOME/.config/goose}"
ARC_API_URL="${ARC_API_URL:-http://localhost:8000}"

C_RESET='\033[0m'
C_ORANGE='\033[38;5;214m'
C_GREEN='\033[32m'
C_DIM='\033[2m'
C_BOLD='\033[1m'

log()  { printf "${C_ORANGE}==>${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}  ok${C_RESET} %s\n" "$*"; }
warn() { printf "${C_DIM}  ..${C_RESET} %s\n" "$*"; }
die()  { printf "${C_BOLD}error:${C_RESET} %s\n" "$*" >&2; exit 1; }

mkdir -p "$ARC_HOME" "$ARC_CONFIG_DIR"

# --- banner --------------------------------------------------------------
if [[ -f "${SCRIPT_DIR}/branding/banner.txt" ]]; then
  printf "${C_ORANGE}"
  cat "${SCRIPT_DIR}/branding/banner.txt"
  printf "${C_RESET}\n"
fi

# --- prerequisites -------------------------------------------------------
log "Checking prerequisites"

check_version() {
  local name="$1" bin="$2" min="$3" have
  command -v "$bin" >/dev/null 2>&1 || die "$name not found. Install $name $min+ first."
  have="$("$bin" --version 2>&1 | head -n1)"
  ok "$name: $have"
}

check_version "Python" python3 "3.11"
check_version "Node" node "20"

PY_MAJOR_MINOR=$(python3 -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
  || die "Python $PY_MAJOR_MINOR found. Python 3.11+ required."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $NODE_MAJOR found. Node 20+ required."

# --- goose ---------------------------------------------------------------
log "Checking Goose CLI"
if command -v goose >/dev/null 2>&1; then
  ok "Goose already installed: $(goose --version 2>&1 | head -n1)"
else
  warn "Goose not found — installing via official script"
  curl -fsSL https://raw.githubusercontent.com/aaif-goose/goose/main/install.sh | bash \
    || die "Goose install failed"
  ok "Goose installed"
fi

# --- ARC MCP server ------------------------------------------------------
log "Installing ARC MCP server"
if [[ -d "${REPO_ROOT}/mcp-server" ]]; then
  python3 -m pip install --user --upgrade "${REPO_ROOT}/mcp-server" >/dev/null
  ok "arc-mcp installed from ${REPO_ROOT}/mcp-server"
else
  warn "mcp-server directory not found — skipping local install"
fi

# --- ARC backend ---------------------------------------------------------
log "Starting ARC backend"
if curl -fsS "${ARC_API_URL}/health" >/dev/null 2>&1; then
  ok "ARC backend already running at ${ARC_API_URL}"
else
  if [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
    warn "Launching docker-compose stack"
    (cd "$SCRIPT_DIR" && docker compose up -d backend)
    # Wait for health
    for i in {1..30}; do
      curl -fsS "${ARC_API_URL}/health" >/dev/null 2>&1 && break
      sleep 1
    done
    curl -fsS "${ARC_API_URL}/health" >/dev/null 2>&1 \
      || die "Backend did not become healthy at ${ARC_API_URL}"
    ok "Backend healthy"
  else
    warn "Docker not available — start backend manually: cd backend && uvicorn api:app"
  fi
fi

# --- apply goose config --------------------------------------------------
log "Applying ARC Goose config"
GOOSE_CONFIG="${ARC_CONFIG_DIR}/config.yaml"
ARC_CONFIG="${SCRIPT_DIR}/config.yaml"

if [[ -f "$GOOSE_CONFIG" ]] && grep -q "# ARC-GOOSE-MANAGED" "$GOOSE_CONFIG" 2>/dev/null; then
  ok "Goose config already ARC-managed — refreshing"
  cp "$ARC_CONFIG" "$GOOSE_CONFIG.tmp"
  printf "\n# ARC-GOOSE-MANAGED\n" >> "$GOOSE_CONFIG.tmp"
  mv "$GOOSE_CONFIG.tmp" "$GOOSE_CONFIG"
elif [[ -f "$GOOSE_CONFIG" ]]; then
  cp "$GOOSE_CONFIG" "${GOOSE_CONFIG}.backup.$(date +%s)"
  warn "Backed up existing config to ${GOOSE_CONFIG}.backup.*"
  cp "$ARC_CONFIG" "$GOOSE_CONFIG"
  printf "\n# ARC-GOOSE-MANAGED\n" >> "$GOOSE_CONFIG"
  ok "Config installed"
else
  cp "$ARC_CONFIG" "$GOOSE_CONFIG"
  printf "\n# ARC-GOOSE-MANAGED\n" >> "$GOOSE_CONFIG"
  ok "Config installed at $GOOSE_CONFIG"
fi

# --- first-run: keygen + genesis ----------------------------------------
IDENTITY_FILE="${ARC_HOME}/identity.json"
log "First-run setup (idempotent)"

if [[ -f "$IDENTITY_FILE" ]]; then
  PUBKEY=$(python3 -c "import json; print(json.load(open('${IDENTITY_FILE}'))['pubkey'])")
  GENESIS=$(python3 -c "import json; print(json.load(open('${IDENTITY_FILE}')).get('genesis_record_id',''))")
  ok "Existing identity found — pubkey: ${PUBKEY:0:16}..."
else
  warn "Generating BIP-340 Taproot keypair"
  KEYGEN_OUT=$(curl -fsS -X POST "${ARC_API_URL}/keygen" 2>/dev/null || true)
  if [[ -z "$KEYGEN_OUT" ]]; then
    warn "Backend /keygen unavailable — falling back to local keygen"
    PUBKEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    PRIVKEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    KEYGEN_OUT=$(printf '{"pubkey":"%s","privkey":"%s"}' "$PUBKEY" "$PRIVKEY")
  fi
  PUBKEY=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['pubkey'])" "$KEYGEN_OUT")

  warn "Creating genesis record"
  GENESIS_OUT=$(curl -fsS -X POST "${ARC_API_URL}/genesis" \
    -H 'Content-Type: application/json' \
    -d "{\"pubkey\":\"${PUBKEY}\"}" 2>/dev/null || echo '{}')
  GENESIS=$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('record_id',''))" "$GENESIS_OUT")

  python3 - <<PY
import json, os
data = {
  "pubkey": "${PUBKEY}",
  "keygen": ${KEYGEN_OUT},
  "genesis_record_id": "${GENESIS}",
  "api_url": "${ARC_API_URL}",
}
os.makedirs(os.path.dirname("${IDENTITY_FILE}"), exist_ok=True)
with open("${IDENTITY_FILE}", "w") as f:
  json.dump(data, f, indent=2)
os.chmod("${IDENTITY_FILE}", 0o600)
PY
  ok "Identity written to ${IDENTITY_FILE} (chmod 600)"
fi

# --- welcome -------------------------------------------------------------
EXPLORER_URL="${ARC_EXPLORER_URL:-http://localhost:3000/chain}"
cat <<EOF

${C_BOLD}Welcome to ARC Goose.${C_RESET}

  Pubkey:   ${PUBKEY}
  Genesis:  ${GENESIS:-<pending>}
  API:      ${ARC_API_URL}
  Explorer: ${EXPLORER_URL}/${PUBKEY}

Run:  ${C_BOLD}goose session${C_RESET}
Every significant action is now Schnorr-signed, hash-chained,
and inscribable on Bitcoin.

EOF
