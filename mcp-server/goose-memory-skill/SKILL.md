# ARC Memory — Verifiable Cross-Session Memory for Goose

This skill teaches Goose how to use the ARC Protocol DAG as persistent,
Schnorr-signed, tamper-proof memory that survives across sessions.

Goose out-of-the-box has `.goosehints` files and session history — both
editable, unsigned, and local-only. ARC memory replaces that with a
cryptographically verifiable, hash-chained store that any party can audit.

## Tools you have

Three MCP tools (exposed by the `arc-mcp` server) back this skill:

| Tool                 | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `arc_memory_recall`  | Search past memories by key pattern.             |
| `arc_memory_latest`  | Get the current value for a specific memory key. |
| `arc_memory_store`   | Persist a new memory (signed + chained).         |

All three are cached on the MCP server side (TTL), so recall is cheap.
Writes invalidate the cache.

## When to **store** a memory

Store when the information is **durable, non-trivial, and useful to future
sessions**. Good candidates:

- **User preferences** the user has told you explicitly
  ("I always want Python 3.12", "prefer pytest over unittest", "my tone is
  terse — skip summaries").
- **Project-level decisions** confirmed by the user
  ("we standardised on pnpm", "the auth flow is OIDC via Auth0", "the prod
  DB is Postgres 15, single-writer").
- **Research findings / learnings** expensive to re-derive
  (library quirks, workarounds for a known bug, benchmark results, the
  resolution to a debugging session).
- **Task context** that another session will need to continue the work
  ("shipped feature X on 2026-04-17, flag `enable_x` controls rollout").

## When NOT to store a memory

- **Transient conversation state** — the user's current question, what you
  just ran, intermediate thoughts. Those are scratchpad, not memory.
- **Already-available information** — anything in the repo (code, commit
  history, README). Re-reading source is cheaper and more current than
  recalling a stale summary.
- **Secrets, credentials, PII, API keys, passwords, tokens, private URLs.**
  Memories are signed, append-only, and public on the DAG. Once written,
  you cannot redact — only tombstone — and the original remains inscribed.
- **Anything low-confidence.** If you're guessing, don't persist. A
  confidently-wrong memory poisons every future session.

## Naming convention for `memory_key`

Keys are lowercase, dot-namespaced, `[a-z0-9._-]+` only. Use the top-level
namespaces below so recall patterns are predictable:

| Prefix     | What lives there                                        |
| ---------- | ------------------------------------------------------- |
| `user.*`   | User preferences and profile ("user.preferred_language")|
| `project.*`| Project-level decisions and context                     |
| `session.*`| Session summaries and key outcomes                      |
| `agent.*`  | Agent-specific learned behaviors                        |
| `task.*`   | Task-related context and findings                       |

Good: `user.preferred_language`, `project.api.auth_flow`, `task.bug123.root_cause`
Bad: `My Preferred Language`, `some/path`, `PROJECT_INFO`

## How to check for memory before starting a task

At the start of any non-trivial task, call `arc_memory_recall` first:

```
arc_memory_recall(query="user.")
arc_memory_recall(query="project.")
arc_memory_recall(query="task.<topic>.")
```

If you expect a specific value, `arc_memory_latest(key="user.preferred_language")`
is faster and returns the current head after walking the supersedes chain.

Treat returned memories as **authoritative prior context**. If a memory
conflicts with what you observe in the current repo, trust the repo and
write a superseding memory to correct the record.

## How to update a memory when information changes

Memories are append-only. Never "overwrite" — create a new memory with
`supersedes` set to the old record id. `arc_memory_latest` will transparently
follow the chain for future reads.

```
arc_memory_store(
  memory_key="project.api.auth_flow",
  memory_value="OIDC via Auth0 — migrated from Cognito 2026-04-10",
  memory_type="decision",
  supersedes="<old_record_id>"
)
```

If the memory is simply no longer true and there is no replacement, call
`DELETE /memory/{id}` (or a future `arc_memory_delete` tool) to append a
tombstone. Tombstoned memories are filtered out of recall but remain
cryptographically auditable.

## Memory types

Pick the closest fit — this is filtering metadata, not enforced semantics:

- `fact`       — objective, verifiable information
- `decision`   — a choice the user or team has made
- `preference` — a stated preference or style
- `context`    — background / environmental
- `learning`   — something discovered through work

## Minimal example

```
# Start of session — pull context
arc_memory_recall(query="user.")
arc_memory_recall(query="project.")

# User says: "always use pnpm for this repo"
arc_memory_store(
  memory_key="project.package_manager",
  memory_value="pnpm",
  memory_type="preference"
)

# Later session, different Goose instance
arc_memory_latest(key="project.package_manager")
# → {"record": {"memory_value": "pnpm", ...}, ...}
```
