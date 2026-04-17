# arc-orchestrator — Goose-powered ARC runtime

This package replaces the simulated cron orchestrator with a real
runtime where each ARC agent is a [Goose](https://github.com/aaif-goose/goose)
session wired into the [ARC MCP server](../mcp-server). Every action a
Goose agent takes produces a genuine, signed ARC record via its own
tool calls — no more synthetic timer records.

## What's inside

```
orchestrator/
├── agents/                     # 10 agent YAML definitions
│   ├── deep-research.yaml
│   ├── code-generator.yaml
│   ├── defi-trader.yaml
│   ├── legal-contracts.yaml
│   ├── design-images.yaml
│   ├── customer-support.yaml
│   ├── compliance-audit.yaml
│   ├── data-analysis.yaml
│   ├── content-creator.yaml
│   └── orchestrator.yaml       # meta-agent that dispatches to others
├── src/arc_orchestrator/
│   ├── registry.py             # YAML loader + in-memory registry
│   ├── goose_bridge.py         # short-lived Goose subprocess spawner
│   ├── runtime.py              # dispatch + scheduler + activity stream
│   ├── state.py                # per-agent chain-head persistence
│   └── api.py                  # FastAPI HTTP + WebSocket surface
├── legacy/                     # copy of the old cron orchestrator (fallback)
└── pyproject.toml
```

## Agent definition schema

Each YAML in `agents/` must define:

| Field | Required | Purpose |
|-------|----------|---------|
| `agent_name` | ✅ | Canonical ARC alias (used as `alias` in `arc_keygen`) |
| `display_name` | ✅ | Human-readable name for UI |
| `role` | ✅ | One-line role description |
| `color` | | Hex color for frontend badges |
| `trigger` | ✅ | `on_demand` \| `scheduled` \| `webhook` |
| `schedule` | (if scheduled) | Cron expression, e.g. `"0 */12 * * *"` |
| `webhook_path` | (if webhook) | Path the runtime listens on |
| `provider` | | Goose provider, e.g. `ollama/llama3.2` or `anthropic/claude-sonnet`. Supports `${VAR:-default}`. |
| `mcp_servers` | | List of MCP server names (always include `arc-mcp-server`) |
| `tools` | | Extra MCP/builtin tool names |
| `is_meta` | | `true` only for the dispatcher agent |
| `child_agents` | | List of agent_name values the meta-agent can route to |
| `system_prompt` | ✅ | Purpose-built prompt for this agent |

Secrets (API keys, tokens) are **never** committed here — they are read
from environment variables at runtime.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `ARC_API_URL` | `http://localhost:8000` | ARC FastAPI backend URL |
| `ARC_MCP_COMMAND` | `arc-mcp` | Command the runtime puts in the Goose recipe's MCP extension |
| `ARC_GOOSE_BIN` | `goose` | Goose CLI binary to exec |
| `ARC_ORCH_DRY_RUN` | `false` | If `true`, never spawn Goose — emit synthetic results |
| `ARC_ORCH_TIMEOUT` | `300` | Per-session timeout seconds |
| `ARC_ORCH_PORT` | `8100` | HTTP/WebSocket port |
| `ARC_ORCH_HOST` | `0.0.0.0` | Bind host |
| `ARC_ORCH_CORS` | `*` | Comma-separated CORS origins |
| `ARC_ORCH_STATE` | `orchestrator/state.json` | Per-agent chain-head state file |
| `ARC_DEFAULT_PROVIDER` | `ollama/llama3.2` | Fallback provider referenced from YAMLs |

## Quick start

```bash
# 1. install
cd orchestrator
pip install -e .

# 2. make sure ARC backend + ARC MCP server are reachable
export ARC_API_URL=http://localhost:8000
export ARC_MCP_COMMAND=arc-mcp        # from mcp-server/

# 3. dry run — works without Goose installed
export ARC_ORCH_DRY_RUN=true
arc-orchestrator
```

Without Goose installed or with `ARC_ORCH_DRY_RUN=true`, every dispatch
returns a synthetic result describing what would have been sent — the
rest of the surface (registry, scheduler, API, WebSocket, state) is
fully exercised.

## HTTP / WebSocket API

| Route | Purpose |
|-------|---------|
| `GET  /health` | Liveness + Goose availability + dry-run status |
| `GET  /orchestrator/agents` | List agents, their triggers, and known pubkeys |
| `GET  /orchestrator/agent/{name}/history?limit=25` | Recent activity for one agent (ARC chain if pubkey known, else local activity) |
| `POST /orchestrator/agent/{name}/trigger` | Manually trigger one agent with a task |
| `POST /orchestrator/dispatch` | Submit a task; if `agent` omitted, the meta-agent routes |
| `GET  /orchestrator/activity?limit=100` | Recent activity events |
| `WS   /orchestrator/stream` | Real-time stream of `ActivityEvent` JSON |
| `GET  /recipes` | List ARC-aware Goose recipes |
| `GET  /recipe/{name}` | Recipe detail (params, steps, arc config) |
| `POST /recipe/run` | Kick off an async recipe run (returns `run_id`) |
| `GET  /recipe/run/{id}` | Poll run status + per-step record ids |
| `GET  /recipe/run/{id}/report` | Provenance report (DAG ascii + settlement) |
| `GET  /recipe/runs?limit=25` | Recent recipe runs |

Example dispatch:

```bash
curl -s -X POST http://localhost:8100/orchestrator/dispatch \
  -H 'content-type: application/json' \
  -d '{"agent":"arc-deep-research","task":"Summarize Lightning HTLC timeouts"}'
```

Example meta-routing (orchestrator picks the child):

```bash
curl -s -X POST http://localhost:8100/orchestrator/dispatch \
  -H 'content-type: application/json' \
  -d '{"task":"Draft a 3-clause NDA for a sats-denominated services contract"}'
```

## Recipes — provenance-wrapped Goose workflows

An ARC-aware recipe is a Goose recipe with an optional `arc:` block. Every
step becomes a Schnorr-signed ARC action record; the whole run is a
hash-chained DAG with optional Lightning settlement on completion.

```yaml
name: arc-deep-research
arc:
  enabled: true
  agent: arc-deep-research
  settle_on_complete: true
  settlement_amount_sats: 500
  memref_strategy: full_chain      # full_chain | previous_only | none
  inscription: true
steps:
  - name: scope
    prompt: "Scope the research question around {topic}."
    arc:
      action_label: "Scope phase: {topic}"
  - name: research
    prompt: "Gather evidence for each sub-question."
    arc:
      action_label: "Research phase: {topic}"
      memrefs: [scope]
```

Shipped recipes (under `orchestrator/recipes/`):

- `arc-deep-research` — scope → research → analyse → synthesise
- `arc-code-review` — scan → analyse → report
- `arc-legal-draft` — template_load → draft → compliance_check → finalise
- `arc-data-analysis` — ingest → clean → analyse → visualise → report
- `arc-content-pipeline` — ideate → research → draft → edit → publish

Run one:

```bash
curl -s -X POST http://localhost:8100/recipe/run \
  -H 'content-type: application/json' \
  -d '{"recipe":"arc-deep-research","params":{"topic":"Lightning HTLC timeouts"}}'
# → {"run_id":"ab12…","status":"pending","recipe":"arc-deep-research"}

curl -s http://localhost:8100/recipe/run/ab12…/report
```

Design notes worth knowing:

- **Idempotent**: each step's `ihash` is deterministic over
  `(step_name, resolved prompt, params)`. Re-running the same inputs
  within a run reuses the cached `record_id` instead of double-posting;
  the step is flagged `cached: true, status: skipped`.
- **Async**: `/recipe/run` returns immediately; poll `/recipe/run/{id}`
  for progress. Long-running recipes don't block the HTTP loop.
- **Fail-fast validation**: recipes are validated against
  `recipe-schema/arc-recipe.schema.yaml` at load time. Bad memref
  strategies, forward step references, missing settlement amounts,
  duplicate step names — all fail with a clear error before execution.
- **Dry-run**: if `ARC_ORCH_DRY_RUN=1` or the ARC backend is
  unreachable, the runner synthesises record ids from the ihash so the
  pipeline plumbing stays exercisable in local dev / CI.

## Goose integration

For each dispatch, `goose_bridge` writes a temporary recipe YAML:

```yaml
version: "1.0.0"
title: arc:<agent_name>
provider: <from YAML>
system_prompt: |
  <agent system prompt + chain-continuity hint>
instructions: <task>
extensions:
  arc-mcp-server:
    type: stdio
    cmd: arc-mcp
    envs:
      ARC_API_URL: http://...
arc:
  agent_name: ...
  prev_record: <most-recent ARC record id for this agent>
```

then execs `goose run --recipe <file> --instructions <file> --no-session`.
Sessions are **short-lived** (one task per spawn). The runtime scrapes
64-char hex record ids from the session output, verifies each against
the ARC backend, and persists the new head so the next dispatch
continues the chain.

## Scheduling

Scheduled agents use a cron expression via APScheduler. The sample
`compliance-audit.yaml` runs `0 */12 * * *` (every 12h). When a tick
fires, the runtime dispatches the agent with a "scheduled duty-cycle"
task — the agent's system prompt defines what that means for its role.

If APScheduler is not installed, the runtime logs a warning and skips
scheduled agents; on-demand and webhook agents still work.

## Webhooks

Agents with `trigger: webhook` expose their `webhook_path` as a manual
trigger route (e.g. `arc-support` on `/support` is reachable as
`POST /orchestrator/agent/arc-support/trigger`). External services
post task bodies to that endpoint; the runtime spawns a session just
as it would for `on_demand`.

## Legacy fallback

The old cron orchestrator is preserved verbatim in
[`legacy/`](legacy/). Nothing in this runtime imports it; it is kept
as a reference and emergency fallback only.

## License

MIT — same as ARC Protocol.
