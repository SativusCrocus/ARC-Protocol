# ARC Goose — Architecture

## How ARC Goose differs from vanilla Goose

Vanilla Goose is a general-purpose agent CLI with an MCP extension system.
ARC Goose is a **pre-configured distribution** of Goose with:

1. The `arc-protocol` MCP server wired in by default
2. A system-prompt append that teaches the agent when to record actions
3. A first-run flow that mints a BIP-340 Taproot keypair + genesis record
4. Branding (logo, banner, color tokens) and docs
5. A one-command `docker compose` bringing up the full ARC stack

No Goose internals are forked. The distribution is **configuration +
packaging**, tracking upstream Goose releases via weekly sync.

## Data flow

```
   ┌─────────┐   stdin/stdout   ┌────────────┐    MCP (stdio/SSE)   ┌──────────────┐
   │  User   │ ───────────────▶ │   Goose    │ ───────────────────▶ │  arc-mcp     │
   └─────────┘                  │   (CLI)    │                      │  server      │
                                └─────┬──────┘                      └──────┬───────┘
                                      │                                    │
                                      │ tool calls                         │ HTTP (REST)
                                      ▼                                    ▼
                             ┌──────────────┐                      ┌──────────────┐
                             │ Anthropic /  │                      │  ARC Backend │
                             │ Ollama LLM   │                      │   FastAPI    │
                             └──────────────┘                      └──────┬───────┘
                                                                          │
                                                            ┌─────────────┼─────────────┐
                                                            ▼             ▼             ▼
                                                        SQLite        ord/LND      Memory DAG
                                                      (local state)  (Bitcoin)     (append-only)
```

Flow of a single "record this action" turn:

1. User sends a message to `goose session`
2. Goose calls the LLM; the LLM emits a tool_call for `arc_action`
3. Goose routes the call to the `arc-mcp` server (stdio)
4. `arc-mcp` POSTs to ARC Backend `/action`
5. Backend computes the payload hash, fetches `prev`, signs with the agent key,
   writes to SQLite, and (optionally) queues an ord inscription
6. Record ID returned up the chain to the agent, which references it in its
   next response

## What gets recorded

| Event                               | Recorded? | Record type           |
| ----------------------------------- | --------- | --------------------- |
| Session start                       | Yes (lazy)| `session.started`     |
| LLM message (routine)               | No        | —                     |
| Task completion                     | Yes       | `task.completed`      |
| Artifact produced (file, PR, doc)   | Yes       | `artifact.created`    |
| Decision / plan adopted             | Yes       | `decision.made`       |
| Memory write                        | Yes       | `memory.stored`       |
| Economic settlement (Lightning)     | Yes       | `settle.paid`         |
| Cross-agent reference               | Yes       | `memref.linked`       |
| Tool call failure                   | Optional  | `action.failed`       |

The agent decides — the system prompt asks for judgment, not exhaustive
logging. "Record things that matter" is the rule.

## Security model

**Where keys live.** The private key is written to `~/.arc-goose/identity.json`
with mode `0600`. It never leaves the local machine and is not transmitted to
the LLM provider. The ARC backend receives only the public key plus
signatures.

**What is signed.** Every record commits to:

- the agent's pubkey
- the SHA-256 of the payload
- the `prev` record_id (chain linkage)
- a UTC timestamp
- the record type

The signature is BIP-340 Schnorr over the record hash.

**What is verified.** Any third party with the pubkey and chain can:

- re-derive each record hash
- verify each Schnorr signature
- verify chain linkage (`prev` → current)
- optionally confirm ord inscription on mainnet

**Trust boundary.** The only trusted component is the local key file.
Backend compromise cannot forge records (signatures would not verify).
LLM-provider compromise cannot forge records (it never holds the key).
Even the user cannot rewrite history without invalidating the chain.

**What's not protected.** Content confidentiality is out of scope — payload
hashes are signed, but payloads themselves live in SQLite and are readable
by whoever controls the backend. Use `arc_memory_store` only for data you
are willing to expose at the chosen privacy tier.
