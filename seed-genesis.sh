#!/bin/bash
# ARC Genesis Seeding – uses actual arc.py CLI interface
# Seeds 3 demo agents with cross-referenced action records

set -euo pipefail

CLI="python backend/arc.py"
cd "$(dirname "$0")"

echo "=== Step 1: Generate keypairs for 3 demo agents ==="

$CLI keygen --alias marketplace
$CLI keygen --alias memory-dag
$CLI keygen --alias services

# Locate the key files
MKT_KEY="$HOME/.arc/keys/marketplace.key"
DAG_KEY="$HOME/.arc/keys/memory-dag.key"
SVC_KEY="$HOME/.arc/keys/services.key"

echo ""
echo "=== Step 2: Create genesis records ==="

MKT_GENESIS=$($CLI genesis --alias "marketplace" --action "AI Content Marketplace – verifiable content trading" --key "$MKT_KEY" | head -1 | awk '{print $2}')
echo "Marketplace genesis: $MKT_GENESIS"

DAG_GENESIS=$($CLI genesis --alias "memory-dag" --action "Collaborative Memory DAG – composable multi-agent knowledge" --key "$DAG_KEY" | head -1 | awk '{print $2}')
echo "Memory DAG genesis: $DAG_GENESIS"

SVC_GENESIS=$($CLI genesis --alias "services" --action "Autonomous Services – task settlement with dispute resolution" --key "$SVC_KEY" | head -1 | awk '{print $2}')
echo "Services genesis: $SVC_GENESIS"

echo ""
echo "=== Step 3: Cross-referenced actions ==="

# Action 1: Marketplace publishes an article (references DAG)
MKT_ACTION=$($CLI action \
  --prev "$MKT_GENESIS" \
  --action "Published article: AI agent accountability via Bitcoin" \
  --memref "$DAG_GENESIS" \
  --key "$MKT_KEY" | head -1 | awk '{print $2}')
echo "Marketplace action: $MKT_ACTION"

# Action 2: Services references both Marketplace and DAG
SVC_ACTION=$($CLI action \
  --prev "$SVC_GENESIS" \
  --action "Analysis task: cross-agent provenance verification" \
  --memref "$MKT_GENESIS" \
  --memref "$DAG_GENESIS" \
  --key "$SVC_KEY" | head -1 | awk '{print $2}')
echo "Services action: $SVC_ACTION"

# Action 3: Memory DAG composes from both
DAG_ACTION=$($CLI action \
  --prev "$DAG_GENESIS" \
  --action "Knowledge synthesis: merged marketplace + services provenance" \
  --memref "$MKT_GENESIS" \
  --memref "$SVC_GENESIS" \
  --key "$DAG_KEY" | head -1 | awk '{print $2}')
echo "Memory DAG action: $DAG_ACTION"

echo ""
echo "=== Step 4: Settlement (Marketplace → Services) ==="

$CLI settle \
  --record-id "$MKT_ACTION" \
  --amount 10000 \
  --key "$SVC_KEY"

echo ""
echo "=== Genesis seeding complete ==="
echo "Marketplace genesis: $MKT_GENESIS"
echo "Memory DAG genesis:  $DAG_GENESIS"
echo "Services genesis:    $SVC_GENESIS"
echo ""
echo "Verify with:"
echo "  $CLI view-chain $MKT_GENESIS"
echo "  $CLI view-chain $DAG_GENESIS"
echo "  $CLI view-chain $SVC_GENESIS"
echo "  $CLI validate $MKT_ACTION"
echo ""
echo "Records stored in: ~/.arc/records.db"
echo "To inscribe on Bitcoin: GET /inscription/<record_id> via the API"
