#!/bin/bash
# Seed ARC Protocol backend via REST API
# Usage: ./seed-remote.sh https://your-app.railway.app

set -euo pipefail

API="${1:?Usage: ./seed-remote.sh <BACKEND_URL>}"

echo "=== Seeding $API ==="

# Health check
curl -sf "$API/health" | python3 -c "import sys,json; print(json.load(sys.stdin))" || {
  echo "Backend not reachable at $API"; exit 1
}

echo ""
echo "=== Step 1: Genesis records ==="

MKT=$(curl -sf "$API/genesis" \
  -H "Content-Type: application/json" \
  -d '{"alias":"marketplace","action":"AI Content Marketplace – verifiable content trading","input_data":"marketplace-genesis"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Marketplace genesis: $MKT"

DAG=$(curl -sf "$API/genesis" \
  -H "Content-Type: application/json" \
  -d '{"alias":"memory-dag","action":"Collaborative Memory DAG – composable multi-agent knowledge","input_data":"memory-dag-genesis"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Memory DAG genesis: $DAG"

SVC=$(curl -sf "$API/genesis" \
  -H "Content-Type: application/json" \
  -d '{"alias":"services","action":"Autonomous Services – task settlement with dispute resolution","input_data":"services-genesis"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Services genesis: $SVC"

echo ""
echo "=== Step 2: Cross-referenced actions ==="

MKT_A=$(curl -sf "$API/action" \
  -H "Content-Type: application/json" \
  -d "{\"prev\":\"$MKT\",\"action\":\"Published article: AI agent accountability via Bitcoin\",\"memrefs\":[\"$DAG\"]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Marketplace action: $MKT_A"

SVC_A=$(curl -sf "$API/action" \
  -H "Content-Type: application/json" \
  -d "{\"prev\":\"$SVC\",\"action\":\"Analysis task: cross-agent provenance verification\",\"memrefs\":[\"$MKT\",\"$DAG\"]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Services action: $SVC_A"

DAG_A=$(curl -sf "$API/action" \
  -H "Content-Type: application/json" \
  -d "{\"prev\":\"$DAG\",\"action\":\"Knowledge synthesis: merged marketplace + services provenance\",\"memrefs\":[\"$MKT\",\"$SVC\"]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Memory DAG action: $DAG_A"

echo ""
echo "=== Step 3: Settlement ==="

SETTLE=$(curl -sf "$API/settle" \
  -H "Content-Type: application/json" \
  -d "{\"record_id\":\"$MKT_A\",\"amount\":10000}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "Settlement: $SETTLE"

echo ""
echo "=== Step 4: Marketplace demos ==="

for i in 1 2 3; do
  DEMO=$(curl -sf "$API/marketplace/demo" \
    -X POST -H "Content-Type: application/json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Demo {$i}: {d.get('job_id','ok')}\")")
  echo "$DEMO"
done

echo ""
echo "=== Verifying ==="
STATS=$(curl -sf "$API/records" | python3 -c "
import sys, json
recs = json.load(sys.stdin)
agents = len(set(r['record']['agent']['pubkey'] for r in recs))
actions = sum(1 for r in recs if r['record']['type'] == 'action')
sats = sum(r['record'].get('settlement',{}).get('amount_sats',0) for r in recs)
print(f'Records: {len(recs)} | Agents: {agents} | Actions: {actions} | Settled: {sats:,} sats')
")
echo "$STATS"
echo ""
echo "Done. Set BACKEND_URL=$API in Vercel and redeploy."
