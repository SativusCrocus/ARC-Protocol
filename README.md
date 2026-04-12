<p align="center">
  <img src="frontend/public/logo.svg" alt="ARC Protocol" width="280" />
</p>

<h1 align="center">ARC Protocol</h1>

<p align="center">
  <strong>Agent Record Convention</strong><br/>
  Bitcoin-native identity, provenance, and economic settlement for autonomous AI agents.
</p>

<p align="center">
  <a href="https://arc-protocol-six.vercel.app"><img src="https://img.shields.io/badge/Live-arc--protocol--six.vercel.app-F7931A?style=flat-square&logo=vercel&logoColor=white" alt="Live Demo"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License"/></a>
  <img src="https://img.shields.io/badge/Bitcoin-BIP--340_Schnorr-F7931A?style=flat-square&logo=bitcoin&logoColor=white" alt="BIP-340"/>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+"/>
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 15"/>
</p>

---

## About

ARC Protocol is an open-source framework that gives every AI agent a **cryptographically signed, immutable provenance chain** anchored to Bitcoin. Each action an agent takes — from initialization to inference to economic settlement — becomes a BIP-340 Schnorr-signed record that can be inscribed as a Bitcoin ordinal. The result is a tamper-proof audit trail that no platform can revoke, edit, or censor.

**Who it's for:** AI agent developers, autonomous system architects, and anyone building infrastructure where agent accountability and economic settlement must survive beyond any single platform.

**What it solves:**
- **Identity** — Taproot keypairs give agents persistent, self-sovereign identity (no API keys, no OAuth tokens)
- **Provenance** — Every action is hash-chained, timestamped, and signed — forming a DAG that can be validated by anyone
- **Settlement** — Lightning Network integration enables agents to send and receive real sats for completed work
- **Permanence** — Records inscribed via `ord` inherit Bitcoin's immutability and 15+ year uptime track record

## Why ARC

Every AI agent action becomes a **signed, timestamped, chain-linked Bitcoin inscription**.
No platform lock-in. No centralized trust. No expiring credentials.
The agent's entire history lives on the most durable ledger in existence.

**The moat is permanent**: ARC records are Bitcoin inscriptions. They inherit Bitcoin's
immutability, censorship resistance, and 15-year track record. No L2 token, no VC-funded
API, no "trust us" middleware can replicate this. The protocol is so simple it's
unobsoletable – like TCP/IP, the value accrues to the network, not the implementation.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   Bitcoin     │
│  Next.js 15  │     │  FastAPI     │     │  (ord / LND) │
│  :3000       │     │  :8000       │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     ┌─────┴─────┐
                     │  Ollama   │
                     │  (local)  │
                     └───────────┘
```

- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Framer Motion, React Flow DAG
- **Backend**: Python CLI (`arc.py`) + FastAPI REST API with slowapi rate limiting
- **Storage**: SQLite (local dev) → Bitcoin inscriptions (production)
- **LLM**: Ollama (local, free) for prompt→hash generation
- **Settlement**: Lightning Network via LND REST API

## Quick Start (60 seconds)

### Option A: Docker (recommended)

```bash
docker-compose up
```

Open [http://localhost:3000](http://localhost:3000) (frontend) and [http://localhost:8000/docs](http://localhost:8000/docs) (API docs).

### Option B: Manual (Mac Mini compatible)

```bash
# Terminal 1 – Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --reload --port 8000

# Terminal 2 – Frontend
cd frontend
npm install
npm run dev
```

### Option C: CLI only

```bash
cd backend
pip install -r requirements.txt
python arc.py keygen --alias my-agent
python arc.py genesis --action "Agent initialized"
python arc.py view-chain <pubkey>
```

## Prerequisites

- Python 3.11+ (backend)
- Node.js 20+ (frontend)
- Docker & Docker Compose (optional)
- Ollama (optional, for LLM integration): `brew install ollama && ollama pull llama3.2`
- Bitcoin Core + ord (optional, for real inscriptions)
- LND (optional, for Lightning settlement)

## Protocol Specification (v1.0)

### Record Schema

```json
{
  "arc": "1.0",
  "type": "genesis | action | settlement",
  "agent": {
    "pubkey": "<32-byte x-only Taproot public key, hex>",
    "alias": "<optional human-readable name>"
  },
  "prev": "<record_id | null for genesis>",
  "memrefs": ["<record_id>", "..."],
  "ts": "<ISO 8601 UTC timestamp>",
  "ihash": "<SHA-256 hex of input/prompt>",
  "ohash": "<SHA-256 hex of output/response>",
  "action": "<human-readable description>",
  "settlement": {
    "type": "lightning",
    "amount_sats": 1000,
    "payment_hash": "<SHA-256 hex>",
    "preimage": "<32-byte hex, revealed after payment>"
  },
  "sig": "<64-byte BIP-340 Schnorr signature, hex>"
}
```

### Validation Rules

| # | Rule |
|---|------|
| 1 | `arc` must be `"1.0"` |
| 2 | `type` must be one of: `genesis`, `action`, `settlement` |
| 3 | `agent.pubkey` must be valid 32-byte hex (64 chars) |
| 4 | Genesis: `prev` must be `null`, `memrefs` must be `[]` |
| 5 | Action/Settlement: `prev` must reference a valid prior record by the same agent |
| 6 | Timestamps must be monotonically increasing along the `prev` chain |
| 7 | `ihash` and `ohash` must be valid SHA-256 hex (64 chars) |
| 8 | `sig` must be a valid BIP-340 Schnorr signature over canonical JSON (sorted keys, compact, `sig` field removed) |
| 9 | All `memrefs` must reference valid, existing records (any agent) |
| 10 | Settlement records must include `settlement` with positive `amount_sats` |
| 11 | No circular references in `prev` chain or `memrefs` (DAG property) |

### Signing Algorithm

1. Remove the `sig` field from the record
2. Serialize as canonical JSON: `json.dumps(record, sort_keys=True, separators=(',', ':'))`
3. SHA-256 hash the resulting bytes
4. BIP-340 Schnorr sign the hash with the agent's private key

### Inscription

Each ARC record is inscribed on Bitcoin using `ord`:

```bash
ord wallet inscribe --content-type "application/json" --body '<record_json>' --fee-rate 10
```

The resulting inscription ID becomes the record's permanent, globally-unique identifier.

## CLI Reference

```bash
arc keygen [--alias NAME]                    # Generate Taproot keypair
arc genesis --action DESC [--alias NAME]     # Create genesis record
arc action --prev ID --action DESC           # Create action record
    [--memref ID ...] [--prompt TEXT]        #   with optional LLM + memrefs
arc validate RECORD_ID [--deep|--shallow]    # Validate record + chain
arc settle --record-id ID --amount SATS      # Lightning settlement
arc view-chain PUBKEY_OR_ID                  # View full provenance chain
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/keygen` | Generate keypair |
| `GET` | `/keys` | List stored keys |
| `POST` | `/genesis` | Create genesis record |
| `POST` | `/action` | Create action record |
| `GET` | `/validate/{id}` | Validate record and chain |
| `POST` | `/settle` | Create Lightning settlement |
| `GET` | `/record/{id}` | Get single record |
| `GET` | `/chain/{id}` | Get full chain (by record ID or pubkey) |
| `GET` | `/records` | List all records |
| `GET` | `/inscription/{id}` | Get `ord` inscription command |

Interactive API docs at [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI).

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

## Security

See [SECURITY.md](SECURITY.md) for the full security policy.

- **Private keys** are stored in `~/.arc/keys/` with `0600` permissions. Never expose them.
- **Private keys never touch the API transport layer.** The API loads keys from disk for signing, never transmits them.
- **Schnorr re-verification** on every record before storage (defense in depth).
- **Rate limiting** via `slowapi` on all mutation endpoints.
- **Strict Pydantic validation** with regex-enforced hex format checks on every request.
- **Security headers**: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy.
- **Mainnet warning**: This reference implementation defaults to regtest/local mode. Do not use mainnet keys for testing.

## Vercel Deployment

ARC Protocol deploys as a multi-service Vercel project (frontend + backend):

### Setup

1. Push to GitHub and import in [Vercel Dashboard](https://vercel.com/dashboard)
2. Vercel auto-detects the `vercel.json` multi-service config
3. Set environment variables in Vercel project settings:
   - `NEXT_PUBLIC_BITCOIN_NETWORK=regtest` (or `mainnet`)
   - All environment variables should be set as **read-only** in Vercel

### Recommended Vercel Settings

- **Edge Config**: Enable for dynamic configuration without redeployment
- **Vercel Protection (DDoS)**: Enable under Project Settings > Security
- **Environment Variables**: Set all as read-only to prevent runtime modification
- **Deployment Protection**: Enable Vercel Authentication for preview deployments

### Post-Deploy Verification

```bash
# Health check
curl https://your-app.vercel.app/_/backend/health

# Frontend
open https://your-app.vercel.app
```

## Edge Cases

- **Offline LLM**: If Ollama is unavailable, `ihash`/`ohash` are computed from the action description.
- **No LND**: Settlement records use locally-generated preimages for testing. Real Lightning integration requires LND.
- **Chain gaps**: If a referenced `prev` or `memref` doesn't exist locally, validation reports it as an error.
- **Duplicate records**: Storing the same record twice produces the same ID (content-addressed).
- **Timestamp ordering**: The validator enforces monotonically increasing timestamps along the `prev` chain.

## License

MIT – see [LICENSE](LICENSE).
