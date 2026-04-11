# ARC Protocol – Agent Record Convention

Bitcoin-native identity, provenance, and economic settlement for autonomous AI agents.

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

- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, React Flow DAG visualizer
- **Backend**: Python CLI (`arc.py`) + FastAPI REST API
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

- **Private keys** are stored in `~/.arc/keys/` with `0600` permissions. Never expose them.
- **Mainnet warning**: This reference implementation defaults to regtest/local mode. Do not use mainnet keys for testing.
- **No key transmission**: The API never transmits private keys over the network. Key generation returns the pubkey; the secret stays on disk.
- **Signature verification**: Every record is cryptographically signed. Tampering with any field invalidates the chain.

## Edge Cases

- **Offline LLM**: If Ollama is unavailable, `ihash`/`ohash` are computed from the action description.
- **No LND**: Settlement records use locally-generated preimages for testing. Real Lightning integration requires LND.
- **Chain gaps**: If a referenced `prev` or `memref` doesn't exist locally, validation reports it as an error.
- **Duplicate records**: Storing the same record twice produces the same ID (content-addressed).
- **Timestamp ordering**: The validator enforces monotonically increasing timestamps along the `prev` chain.

## License

MIT – see [LICENSE](LICENSE).
