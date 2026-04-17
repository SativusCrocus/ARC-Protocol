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
  <a href="mcp-server"><img src="https://img.shields.io/badge/MCP-arc--mcp-10B981?style=flat-square" alt="arc-mcp"/></a>
  <a href="orchestrator"><img src="https://img.shields.io/badge/Orchestrator-Goose--powered-6366F1?style=flat-square" alt="Goose orchestrator"/></a>
  <a href="distro/arc-goose"><img src="https://img.shields.io/badge/ARC_Goose-Distribution-8B5CF6?style=flat-square" alt="ARC Goose Distribution"/></a>
</p>

---

## Contents

- [About](#about) · [Why ARC](#why-arc) · [What's new](#whats-new)
- [Stack at a glance](#stack-at-a-glance) · [Architecture](#architecture)
- [Quick Start](#quick-start-60-seconds) · [Prerequisites](#prerequisites)
- [MCP Server](#mcp-server) · [Orchestrator](#orchestrator) · [Agents](#agents) · [Recipes](#recipes--provenance-wrapped-goose-workflows) · [Memory Layer](#memory-layer--verifiable-cross-session-memory-for-goose)
- [Protocol Spec](#protocol-specification-v10) · [CLI](#cli-reference) · [REST API](#rest-api)
- [ARC Goose Distribution](#distributions--arc-goose) · [Frontend Routes](#frontend-routes)
- [Tests](#running-tests) · [Security](#security) · [Deployment](#vercel-deployment) · [Edge Cases](#edge-cases)

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

## What's new

**v0.3 — Goose-native runtime.** The protocol now runs on four new pillars that land together in this release:

- **`mcp-server/`** — ARC exposed as Model Context Protocol tools (identity, provenance, settlement, memory)
- **`orchestrator/`** — Goose-powered dispatch runtime; each of the 10 ARC agents is a short-lived Goose session that writes real signed records
- **`distro/arc-goose/`** — a branded Goose distribution: vanilla Goose + arc-mcp + first-run keygen/genesis, one command to install
- **Memory Layer** — a new `memory` record type with Schnorr-signed cross-session memory for any MCP-speaking agent
- **Recipes** — ARC-aware Goose YAML workflows where every step becomes a signed node in a provenance DAG

The legacy cron "spawn every 6 hours" runtime is preserved under [`orchestrator/legacy/`](orchestrator/legacy/) as a fallback.

## Stack at a glance

| Layer | Component | Default port | Language / runtime | Purpose |
|-------|-----------|--------------|--------------------|---------|
| UI | [`frontend/`](frontend/) | 3000 | Next.js 15, TypeScript, Tailwind, React Flow | Dashboard, DAG explorer, market, memory, recipes, agents |
| Core | [`backend/`](backend/) | 8000 | Python 3.11+, FastAPI, SQLite | Keygen, signing, validation, memory, Lightning settlement |
| Runtime | [`orchestrator/`](orchestrator/) | 8100 | Python 3.11+, FastAPI, APScheduler | Spawns Goose sessions per agent; recipes; WebSocket stream |
| Bridge | [`mcp-server/`](mcp-server/) | 8765 (SSE) | Python 3.11+, MCP SDK | Exposes ARC as MCP tools over stdio / SSE |
| Distro | [`distro/arc-goose/`](distro/arc-goose/) | — | Goose + config + install.sh | Branded Goose distribution, one-command install |
| LLM | Ollama (local) / Anthropic | — | — | Prompt → `ihash`/`ohash`, Goose session provider |
| Anchor | `ord` / LND | — | — | Optional Bitcoin inscription + Lightning settlement |

## Architecture

```
┌──────────────┐   HTTP    ┌──────────────┐   REST JSON   ┌──────────────┐
│  Frontend    │──────────▶│  Orchestrator│──────────────▶│   Backend    │
│  Next.js 15  │◀─ WS ─────│   FastAPI    │◀──────────────│   FastAPI    │
│  :3000       │           │   :8100      │               │   :8000      │
└──────┬───────┘           └──────┬───────┘               └──────┬───────┘
       │                          │                              │
       │  HTTP                    │  spawns short-lived          │
       ▼                          ▼  Goose subprocess            ▼
┌──────────────┐           ┌──────────────┐   stdio       ┌──────────────┐
│   Backend    │           │    Goose     │──────────────▶│   arc-mcp    │
│ /records /…  │           │ (session)    │   MCP proto   │   :8765 sse  │
└──────┬───────┘           └──────┬───────┘               └──────┬───────┘
       │                          │                              │
       ▼                          ▼                              │
 SQLite  ord/LND         Ollama / Anthropic                      │
 (local) (Bitcoin)                                               │
       ▲                                                         │
       └─────────────── HTTP REST ───────────────────────────────┘
```

Each ARC agent = one YAML in [`orchestrator/agents/`](orchestrator/agents/) + one Goose session at dispatch time. Whatever `arc_*` tool calls that session makes become real, BIP-340 Schnorr-signed records on the chain. No cron placeholders.

**Component details**

- **Frontend** — Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Framer Motion, React Flow DAG
- **Backend** — Python CLI (`arc.py`) + FastAPI REST API with slowapi rate limiting, strict Pydantic validation, Schnorr re-verification on every write
- **Storage** — SQLite for local dev (`~/.arc/`); Bitcoin inscriptions via `ord` for production permanence
- **LLM** — Ollama (local, free) for prompt→hash generation; Anthropic or any Goose-supported provider for the orchestrator
- **Settlement** — Lightning Network via LND REST API (preimage-revealing settlement records)
- **MCP Server** — exposes ARC as [Model Context Protocol](https://modelcontextprotocol.io) tools over stdio or SSE: `arc_keygen`, `arc_genesis`, `arc_action`, `arc_validate`, `arc_settle`, `arc_chain`, `arc_list_records`, plus the memory tools `arc_memory_store` / `arc_memory_recall` / `arc_memory_latest`
- **Orchestrator** — Goose-powered dispatcher; each agent is a YAML spec (system prompt + provider + MCP config + trigger) that runs as a short-lived Goose session wired into arc-mcp. Dry-run mode auto-activates if the Goose CLI is not on `PATH`, so the whole surface works in dev and CI without an LLM.

### MCP Server

The [`mcp-server/`](mcp-server/) subproject is a standalone Python package that
wraps the ARC REST API as MCP tools. An AI agent running inside Goose can
establish a Bitcoin identity for itself, write signed provenance records, and
settle payments — all through tool calls, without touching ARC's internals.

Quick start:

```bash
cd mcp-server
pip install -e .
ARC_API_URL=http://localhost:8000 arc-mcp        # stdio (for Goose CLI)
ARC_API_URL=http://localhost:8000 arc-mcp-sse    # SSE  (for remote clients)
```

See [mcp-server/README.md](mcp-server/README.md) for the Goose
`~/.config/goose/config.yaml` snippet and remote-deployment notes.

### Orchestrator

The [`orchestrator/`](orchestrator/) subproject replaces the old cron-based
"spawn every 6 hours" runtime with a real Goose-powered dispatcher. Each of
the 10 ARC agents is defined by a YAML file under
[`orchestrator/agents/`](orchestrator/agents/) that specifies its role,
system prompt, LLM provider, MCP servers, and trigger mode
(`on_demand` / `scheduled` / `webhook`). When a task arrives, the runtime
spawns a short-lived Goose session wired into the [ARC MCP
server](mcp-server/) — whatever arc_* tool calls that session makes become
real, signed ARC records.

The orchestrator exposes a FastAPI surface and a WebSocket activity stream:

```
POST /orchestrator/dispatch              # route or target a task
GET  /orchestrator/agents                # list agents + triggers + pubkeys
GET  /orchestrator/agent/{name}/history  # per-agent recent activity
POST /orchestrator/agent/{name}/trigger  # manually fire one agent
WS   /orchestrator/stream                # real-time event stream
```

Quick start:

```bash
cd orchestrator
pip install -e .
ARC_ORCH_DRY_RUN=true arc-orchestrator   # works without Goose installed
# once Goose is installed:
unset ARC_ORCH_DRY_RUN && arc-orchestrator
```

Dry-run mode is automatic when the Goose CLI isn't on PATH, so the runtime,
scheduler, API, and WebSocket stream all work in development and CI without
a real LLM. See [orchestrator/README.md](orchestrator/README.md) for full
configuration and the agent YAML schema. The cron-based orchestrator it
replaces is preserved as a fallback in
[orchestrator/legacy/](orchestrator/legacy/).

## Agents

Ten certified agents ship in [`orchestrator/agents/`](orchestrator/agents/). Each is a YAML spec the runtime loads at startup; spawning one just means executing a Goose session with that agent's prompt, provider, and MCP wiring.

| Agent | Role | Trigger | Frontend |
|-------|------|---------|----------|
| `arc-deep-research` | Long-form research + synthesis | on_demand | [`/research`](frontend/src/app/research/) |
| `arc-code-generator` | Code generation & refactors | on_demand | [`/codegen`](frontend/src/app/codegen/) |
| `arc-defi-trader` | DeFi / Lightning trading agent | on_demand | [`/trader`](frontend/src/app/trader/) |
| `arc-legal-contracts` | Contract drafting & review | on_demand | [`/legal`](frontend/src/app/legal/) |
| `arc-design-images` | Image generation + design | on_demand | [`/design`](frontend/src/app/design/) |
| `arc-support` | Customer support agent | webhook | [`/support`](frontend/src/app/support/) |
| `arc-compliance-audit` | Scheduled compliance audits | scheduled | [`/compliance`](frontend/src/app/compliance/) |
| `arc-data-analysis` | Data cleaning / analysis | on_demand | [`/data`](frontend/src/app/data/) |
| `arc-content-creator` | Multi-step content pipeline | on_demand | [`/content`](frontend/src/app/content/) |
| `arc-orchestrator` | **Meta-agent** that routes to others | on_demand | [`/orchestrator`](frontend/src/app/orchestrator/) |

Add a new agent: drop a YAML under `orchestrator/agents/`, restart the runtime, and it appears in `/orchestrator/agents`. The meta-agent automatically considers it for routing if listed in its `child_agents`.

## Quick Start (60 seconds)

### Option A: Docker — full stack (recommended)

```bash
docker-compose up
```

Brings up frontend, backend, MCP server, and orchestrator. Endpoints:

- [http://localhost:3000](http://localhost:3000) — Frontend dashboard
- [http://localhost:8000/docs](http://localhost:8000/docs) — Backend Swagger UI
- [http://localhost:8100/docs](http://localhost:8100/docs) — Orchestrator Swagger UI

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

# Terminal 3 – Orchestrator (optional, needed for /orchestrator + /recipes)
cd orchestrator
pip install -e .
ARC_ORCH_DRY_RUN=true arc-orchestrator   # omit ARC_ORCH_DRY_RUN once Goose is installed
```

### Option C: CLI only

```bash
cd backend
pip install -r requirements.txt
python arc.py keygen --alias my-agent
python arc.py genesis --action "Agent initialized"
python arc.py view-chain <pubkey>
```

### Option D: ARC Goose — the branded Goose distribution

```bash
cd distro/arc-goose
./install.sh           # idempotent: keypair + genesis created once
docker compose up -d
goose session          # every significant turn is Schnorr-signed
```

See [`distro/arc-goose/docs/QUICKSTART.md`](distro/arc-goose/docs/QUICKSTART.md) for the full flow.

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
| `POST` | `/memory` | Store a signed memory record |
| `GET` | `/memory/search?q=<prefix>` | Search memories by key pattern |
| `GET` | `/memory/agent/{pubkey}` | All memories for an agent |
| `GET` | `/memory/latest/{key}` | Current value for a memory key |
| `GET` | `/memory/timeline/{key}` | Full history for a memory key |
| `GET` | `/memory/stats` | Memory layer statistics |
| `DELETE` | `/memory/{id}` | Soft-delete (append tombstone) |

Interactive API docs at [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI).

## Memory Layer — verifiable cross-session memory for Goose

ARC now ships a first-class **memory** record type that turns the DAG into
persistent, cryptographically verifiable memory for Goose (or any MCP-speaking)
agents. Every memory is Schnorr-signed and hash-chained — tamper any byte and
verification fails.

Out of the box, Goose has `.goosehints` and session history: editable, unsigned,
local. ARC memory replaces that with an append-only, signed, auditable store
any party can verify.

### Record shape

A memory record has every standard ARC field plus:

```jsonc
{
  "type": "memory",
  "memory_type": "fact" | "decision" | "preference" | "context" | "learning",
  "memory_key":   "user.preferred_language",    // [a-z0-9._-]+, dotted namespaces
  "memory_value": "python",                      // up to 4 KB
  "ttl": 86400,                                  // optional seconds, omit = permanent
  "supersedes": "<prior_record_id>"             // optional — same agent, replaces prior
  // ... standard fields: arc, agent, prev, memrefs, ts, ihash, ohash, action, sig
}
```

### Namespace convention

| Prefix     | Contents                                               |
| ---------- | ------------------------------------------------------ |
| `user.*`   | User preferences and profile info                      |
| `project.*`| Project-level decisions and context                    |
| `session.*`| Session summaries and key outcomes                     |
| `agent.*`  | Agent-specific learned behaviors                       |
| `task.*`   | Task-related context and findings                      |

### MCP tools

The `arc-mcp` server exposes three memory tools to any Goose agent:

- **`arc_memory_store`** — persist a new memory (signed + chained).
- **`arc_memory_recall`** — search past memories by key pattern.
- **`arc_memory_latest`** — current value for a key, walking the supersedes chain.

The MCP server keeps a TTL cache in front of SQLite so recall is cheap; writes
invalidate the cache so new memories are immediately visible. Supersedes chains
are bounded at 100 links.

### Goose skill

See [`mcp-server/goose-memory-skill/SKILL.md`](mcp-server/goose-memory-skill/SKILL.md)
for the instruction file that teaches Goose when to store memories, when to
skip them, and how to update them with `supersedes`.

**Do not store secrets, credentials, API keys, or PII as memories** — memories
are public, signed, and append-only. Once written, you can tombstone but never
redact; the original remains auditable on the DAG (and, if inscribed, on Bitcoin).

### Frontend

The `/memory` route is a dedicated memory browser with:

- Key-pattern search
- Timeline view per key (including the full supersedes chain)
- Agent-grouped view
- Memory stats (totals, top keys, by-type breakdown)

Memory records are also visually distinguished (purple) in the Memory DAG
explorer and appear as first-class biddable nodes in the Memory Market.

## Recipes — provenance-wrapped Goose workflows

Goose supports YAML-defined agentic workflows ("recipes"). ARC ships a
middleware layer that wraps every recipe step in a Schnorr-signed ARC
record. When a recipe runs, each step becomes a node in an append-only
provenance DAG; on completion the entire workflow is auditable, and the
final head can be Lightning-settled or Bitcoin-inscribed.

See [`orchestrator/README.md`](orchestrator/README.md) for the full recipe
docs. The shipped recipes under [`orchestrator/recipes/`](orchestrator/recipes/):

| Recipe                 | Steps                                                |
| ---------------------- | ---------------------------------------------------- |
| `arc-deep-research`    | scope → research → analyse → synthesise              |
| `arc-code-review`      | scan → analyse → report                              |
| `arc-legal-draft`      | template_load → draft → compliance_check → finalise  |
| `arc-data-analysis`    | ingest → clean → analyse → visualise → report        |
| `arc-content-pipeline` | ideate → research → draft → edit → publish           |

Every recipe declares an `arc:` block configuring the agent identity,
memref strategy (`full_chain` / `previous_only` / `none`), Lightning
settlement on completion, and optional Bitcoin inscription. Step execution
is async and idempotent — the `ihash` of `(step_name, resolved prompt,
params)` is the deduplication key across retries. Browse, parameterise,
and launch recipes from the `/recipes` page in the frontend.

Recipe REST endpoints (on the orchestrator service, default port 8100):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/recipes` | List available recipes |
| `GET`  | `/recipe/{name}` | Recipe summary |
| `POST` | `/recipe/run` | Kick off an async run |
| `GET`  | `/recipe/run/{id}` | Poll run status |
| `GET`  | `/recipe/run/{id}/report` | Provenance report (DAG ascii + settlement) |

## Distributions — ARC Goose

**ARC Goose** is a custom [Goose](https://github.com/aaif-goose/goose) distribution
where every agent action automatically produces a Bitcoin-anchored provenance record.
It's vanilla Goose + the ARC MCP server + a first-run keygen/genesis flow, packaged
as a one-command install.

```bash
cd distro/arc-goose
./install.sh            # idempotent: generates keypair + genesis record once
docker compose up -d    # full stack on localhost:3000 / :8000
goose session           # every significant turn is Schnorr-signed and chained
```

Docs live in [`distro/arc-goose/docs`](distro/arc-goose/docs):

- [QUICKSTART.md](distro/arc-goose/docs/QUICKSTART.md) — 3-step setup
- [ARCHITECTURE.md](distro/arc-goose/docs/ARCHITECTURE.md) — data flow, what gets recorded, security model
- [UPGRADING.md](distro/arc-goose/docs/UPGRADING.md) — upstream Goose sync policy + compatibility matrix

**Licensing:** ARC Goose is MIT (matching ARC Protocol). Upstream Goose is Apache-2.0.
Both are compatible; see [CONTRIBUTING-DISTRO.md](CONTRIBUTING-DISTRO.md) for details.

## Frontend Routes

Every route under `frontend/src/app/` maps to a page in the dashboard. Highlights:

| Route | Purpose |
|-------|---------|
| `/` | Landing + live stack status |
| `/dashboard-client` | Real-time network dashboard, activity, totals |
| `/explorer` | Record lookup + chain browser |
| `/dag` | React Flow DAG visualization |
| `/market` · `/marketplace` | Memory / work marketplace with bidding |
| `/memory` | Memory browser — search, timelines, supersedes chains, stats |
| `/recipes` | ARC-aware Goose recipes — browse, parameterize, launch |
| `/orchestrator` | Live agent dispatch, activity stream, manual triggers |
| `/research` · `/codegen` · `/trader` · `/legal` · `/design` · `/support` · `/compliance` · `/data` · `/content` | Per-agent consoles |
| `/bounties` · `/faucet` · `/badge` · `/create` | Virality + monetization surfaces |
| `/wallet` · `/settle` | Lightning settlement flows |

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

## Documentation map

| Topic | Where |
|-------|-------|
| Protocol spec & REST API | [This README](#protocol-specification-v10) |
| MCP server — tools, config, Goose wiring | [`mcp-server/README.md`](mcp-server/README.md) |
| Memory skill — when Goose should write / update memories | [`mcp-server/goose-memory-skill/SKILL.md`](mcp-server/goose-memory-skill/SKILL.md) |
| Orchestrator — agent YAMLs, recipes, HTTP/WS surface | [`orchestrator/README.md`](orchestrator/README.md) |
| ARC Goose distro — install, architecture, upgrades | [`distro/arc-goose/docs/`](distro/arc-goose/docs/) |
| Distro contributions | [`CONTRIBUTING-DISTRO.md`](CONTRIBUTING-DISTRO.md) |
| Security policy | [`SECURITY.md`](SECURITY.md) |

## License

MIT – see [LICENSE](LICENSE).
