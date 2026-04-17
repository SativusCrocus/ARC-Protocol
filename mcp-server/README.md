# arc-mcp — ARC Protocol MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
[ARC Protocol](https://github.com/SativusCrocus/ARC-Protocol)'s core functionality
as callable MCP tools, so that [Goose](https://github.com/aaif-goose/goose) — or
any MCP-compatible AI agent — can:

- Generate BIP-340 Taproot identities for itself
- Write signed, hash-chained provenance records
- Validate chains and signatures
- Create Lightning Network settlements for completed work
- Inspect and traverse the DAG

The server is a standalone Python package. It communicates with ARC's FastAPI
backend **over HTTP only** — it does not import the backend Python package —
so the same binary can point at a local dev instance or a remote deployment.

## Tools exposed

| Tool | ARC endpoint | Purpose |
|------|--------------|---------|
| `arc_keygen` | `POST /keygen` | Generate a new BIP-340 Taproot keypair |
| `arc_genesis` | `POST /genesis` | Create the first record in an agent's chain |
| `arc_action` | `POST /action` | Record a signed, hash-chained action (with optional memrefs / LLM prompt) |
| `arc_validate` | `GET /validate/{id}` | Verify a record's signature and full chain integrity |
| `arc_settle` | `POST /settle` | Create a Lightning settlement record |
| `arc_chain` | `GET /chain/{id}` | Retrieve an agent's full provenance chain |
| `arc_list_records` | `GET /records` | List records, optionally filtered by agent or type |

Every tool has a Pydantic input schema and a rich description so the LLM
knows when and why to call it.

## Install

```bash
cd mcp-server
pip install -e .
```

Requires Python 3.11+ and a running ARC backend (see the root README for
`docker-compose up` or manual instructions).

## Configuration

All configuration is read from environment variables at startup:

| Variable | Default | Purpose |
|----------|---------|---------|
| `ARC_API_URL` | `http://localhost:8000` | Base URL of the ARC FastAPI backend |
| `ARC_API_KEY` | *(unset)* | Optional bearer token, sent as `Authorization: Bearer ...`. Reserved for future remote deployments. |
| `ARC_HTTP_TIMEOUT` | `30` | HTTP timeout in seconds |
| `ARC_LOG_LEVEL` | `INFO` | Python logging level |
| `ARC_MCP_SSE_HOST` | `0.0.0.0` | SSE bind host |
| `ARC_MCP_SSE_PORT` | `8765` | SSE bind port |

## Running

**stdio (default — used by Goose CLI):**

```bash
arc-mcp
```

**SSE (remote / web clients):**

```bash
pip install starlette uvicorn
arc-mcp-sse
```

## Goose integration

Goose discovers MCP servers via `~/.config/goose/config.yaml`. Add an entry
pointing at the `arc-mcp` stdio command:

```yaml
# ~/.config/goose/config.yaml
extensions:
  arc:
    type: stdio
    cmd: arc-mcp
    args: []
    envs:
      ARC_API_URL: http://localhost:8000
    description: |
      ARC Protocol — Bitcoin-native identity, provenance, and Lightning
      settlement for AI agents.
    enabled: true
```

Then launch Goose:

```bash
goose session
```

Inside the session you can prompt Goose with things like:

> "Generate an ARC identity for yourself, write a genesis record saying
> 'research session started', then record an action describing what you
> just learned."

Goose will invoke `arc_keygen`, `arc_genesis`, and `arc_action` via this
MCP server, and the resulting chain is queryable at
`GET /chain/{pubkey}` on the ARC backend.

### Remote ARC deployment

Point `ARC_API_URL` at your hosted ARC instance and (once your deployment
enforces it) supply `ARC_API_KEY`:

```yaml
envs:
  ARC_API_URL: https://arc.example.com
  ARC_API_KEY: "${ARC_API_KEY}"
```

## Development

```bash
pip install -e '.[dev]'
pytest
```

Tests mock the ARC HTTP API with `respx` — no live backend required.

## Error handling

If the ARC backend is unreachable or returns a non-2xx response, the MCP
server surfaces a structured error payload (`{"error": "..."}`) back to
the caller **without crashing the server process**. This keeps the
stdio/SSE transport alive across transient backend failures.

## Architecture

```
┌────────────┐  stdio / sse  ┌──────────────┐    HTTP     ┌──────────────┐
│   Goose    │ ─────────────▶│   arc-mcp    │────────────▶│ ARC backend  │
│  (or any   │  MCP proto    │  this server │  REST JSON  │  FastAPI     │
│  MCP app)  │               │              │             │  :8000       │
└────────────┘               └──────────────┘             └──────────────┘
```

## License

MIT — same as ARC Protocol.
