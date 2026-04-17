# ARC Goose — Quickstart

Get from zero to a signed agent action in three steps.

## 1. Install

```bash
git clone https://github.com/SativusCrocus/ARC-Protocol.git
cd ARC-Protocol/distro/arc-goose
./install.sh
```

The installer will:

- Verify Python 3.11+ and Node 20+
- Install Goose if missing
- Install the `arc-mcp` server (from `../../mcp-server`)
- Start the ARC backend (via `docker compose`)
- Write `~/.config/goose/config.yaml` with the ARC extension wired in
- Generate your BIP-340 Taproot keypair and a genesis record (once)

Re-running is safe. Your identity at `~/.arc-goose/identity.json` is never
regenerated if it exists.

## 2. Configure

Set your provider API key (once):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or use the local fallback
ollama pull llama3.2
```

Optional environment knobs:

| Variable         | Default                  | Meaning                         |
| ---------------- | ------------------------ | ------------------------------- |
| `ARC_API_URL`    | `http://localhost:8000`  | ARC backend endpoint            |
| `ARC_HOME`       | `~/.arc-goose`           | Identity + local state          |
| `ARC_EXPLORER_URL` | `http://localhost:3000/chain` | DAG explorer base           |

## 3. First session

```bash
goose session
```

What happens on first turn:

```
[arc-goose] loaded identity pubkey=9f2a… genesis=rec_0001
[arc-goose] calling arc_chain(pubkey=9f2a…) → 1 record
You> help me draft a changelog for v0.3

(goose thinks, produces output)

[arc-goose] calling arc_action(
    type="artifact.created",
    payload_hash=sha256(...),
    prev="rec_0001"
  ) → rec_0002 (Schnorr-signed)
```

Every significant turn appends a signed record to your chain.

## View your provenance chain

- **Web DAG:** `http://localhost:3000/chain/<your-pubkey>`
- **CLI:** `curl http://localhost:8000/chain/<your-pubkey> | jq`
- **Verify:** `python -m arc.verify <record_id>`

## Explore the Memory DAG

Memory records are a specialized subgraph of the provenance chain. Any
`arc_memory_store` call produces a record whose `memrefs` link it to
predecessors — forming a DAG the agent can traverse at session start.

- Web: `http://localhost:3000/memory`
- CLI: `arc-mcp memory-list --pubkey <your-pubkey>`

## Next steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand what gets recorded
- Read [UPGRADING.md](UPGRADING.md) when vanilla Goose ships a release
- Browse the recipes in `../orchestrator/recipes/`
