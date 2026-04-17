"""ARC Protocol MCP server.

Exposes ARC's core operations (keygen, genesis, action, validate, settle,
chain, list records) as MCP tools so that Goose — or any MCP-compatible
AI agent — can call them natively.

The server talks to a running ARC FastAPI backend over HTTP; it does not
import the backend Python package directly, so the same server binary
can point at localhost or a remote ARC deployment.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Literal

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool
from pydantic import BaseModel, Field, ValidationError, field_validator

from .client import ArcApiError, ArcClient
from .config import ArcMcpConfig, configure_logging

logger = logging.getLogger(__name__)

_HEX64 = r"^[0-9a-fA-F]{64}$"
_MEMORY_KEY_RE = r"^[a-z0-9._-]+$"
_MEMORY_TYPES = ("fact", "decision", "preference", "context", "learning")


# ── In-memory TTL cache for memory reads ──────────────────────────────
# Memory recall must be fast — recalling on every prompt would otherwise
# hit SQLite every time. Writes invalidate the cache so freshly-stored
# memories appear immediately on subsequent reads.


class _TTLCache:
    def __init__(self, ttl_seconds: float = 15.0, max_entries: int = 512):
        self._ttl = ttl_seconds
        self._max = max_entries
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        if len(self._store) >= self._max:
            # Evict oldest by expiry — cheap enough at this size.
            oldest = min(self._store.items(), key=lambda kv: kv[1][0])[0]
            self._store.pop(oldest, None)
        self._store[key] = (time.monotonic() + self._ttl, value)

    def clear(self) -> None:
        self._store.clear()


_memory_cache = _TTLCache()

# ── Pydantic input schemas ─────────────────────────────────────────────


class KeygenInput(BaseModel):
    alias: str | None = Field(
        default=None,
        max_length=64,
        description="Optional human-readable alias for the agent (stored locally).",
    )


class GenesisInput(BaseModel):
    action: str = Field(
        ...,
        min_length=1,
        max_length=4096,
        description="Human-readable description of the agent's initial action.",
    )
    alias: str | None = Field(
        default=None,
        max_length=64,
        description="Optional alias; falls back to the default stored key's alias.",
    )
    input_data: str | None = Field(
        default=None,
        max_length=65536,
        description="Optional seed string hashed into the genesis record's ihash.",
    )


class ActionInput(BaseModel):
    prev: str = Field(
        ...,
        pattern=_HEX64,
        description="Record ID of the previous record in this agent's chain (64-hex).",
    )
    action: str = Field(
        ..., min_length=1, max_length=4096,
        description="Human-readable description of the action being recorded.",
    )
    memrefs: list[str] = Field(
        default_factory=list,
        description="Optional list of cross-agent record IDs referenced by this action.",
    )
    prompt: str | None = Field(
        default=None,
        max_length=65536,
        description="Optional LLM prompt; when provided, the backend runs it through Ollama and hashes the output.",
    )

    @field_validator("memrefs")
    @classmethod
    def _validate_memrefs(cls, v: list[str]) -> list[str]:
        import re

        pattern = re.compile(_HEX64)
        for m in v:
            if not pattern.match(m):
                raise ValueError(f"memref {m!r} is not a 64-char hex record id")
        return v


class ValidateInput(BaseModel):
    record_id: str = Field(..., pattern=_HEX64, description="Record ID to validate.")
    depth: Literal["deep", "shallow"] = Field(
        default="deep",
        description="'deep' validates the full chain; 'shallow' only the single record.",
    )


class SettleInput(BaseModel):
    record_id: str = Field(
        ..., pattern=_HEX64,
        description="Record ID to settle against (typically the action record being paid for).",
    )
    amount_sats: int = Field(
        ..., gt=0, le=21_000_000_00_000_000,
        description="Lightning payment amount in satoshis.",
    )


class ChainInput(BaseModel):
    identifier: str = Field(
        ...,
        description="Either a 64-hex record ID or a 64-hex agent pubkey.",
        pattern=_HEX64,
    )


class MemoryStoreInput(BaseModel):
    memory_key: str = Field(
        ..., min_length=1, max_length=256, pattern=_MEMORY_KEY_RE,
        description=(
            "Searchable dotted key — e.g. 'user.preferred_language', "
            "'project.api.auth_flow'. Lowercase [a-z0-9._-] only."
        ),
    )
    memory_value: str = Field(
        ..., min_length=1, max_length=4096,
        description="The memory payload. Strings only; JSON-encode structured data.",
    )
    memory_type: Literal["fact", "decision", "preference", "context", "learning"] = Field(
        "context",
        description="Classification of the memory for downstream filtering.",
    )
    ttl: int | None = Field(
        default=None, ge=1, le=60 * 60 * 24 * 365 * 10,
        description="Optional expiry in seconds. Omit for permanent.",
    )
    supersedes: str | None = Field(
        default=None, pattern=_HEX64,
        description="Record ID of a prior memory this one replaces (same agent).",
    )
    alias: str | None = Field(default=None, max_length=64)


class MemoryRecallInput(BaseModel):
    query: str = Field(
        "",
        description=(
            "Key pattern — prefix or substring against memory_key. "
            "Empty string returns the newest memories across all keys."
        ),
        max_length=256,
    )
    agent: str | None = Field(
        default=None, pattern=_HEX64,
        description="Optional agent pubkey to filter by.",
    )
    limit: int = Field(default=20, ge=1, le=200)


class MemoryLatestInput(BaseModel):
    key: str = Field(..., min_length=1, max_length=256, pattern=_MEMORY_KEY_RE)


class ListRecordsInput(BaseModel):
    agent: str | None = Field(
        default=None,
        pattern=_HEX64,
        description="Optional agent pubkey (64-hex) to filter records by.",
    )
    type: Literal["genesis", "action", "settlement"] | None = Field(
        default=None,
        description="Optional record type filter.",
    )


# ── Tool registry ──────────────────────────────────────────────────────


TOOL_DESCRIPTIONS: dict[str, str] = {
    "arc_keygen": (
        "Generate a new BIP-340 Taproot keypair for an AI agent. Use this once per "
        "agent to establish a persistent, self-sovereign identity on ARC Protocol. "
        "Returns the x-only public key and alias. The private key stays on the ARC "
        "backend's disk and is never transmitted."
    ),
    "arc_genesis": (
        "Create the first (genesis) record in an agent's provenance chain. Call this "
        "exactly once per agent lifetime, immediately after arc_keygen. The resulting "
        "record_id is the root of that agent's hash-chained DAG and must be passed as "
        "'prev' to the next arc_action call."
    ),
    "arc_action": (
        "Record a signed, hash-chained agent action with optional cross-agent memory "
        "references. Use this for every meaningful operation the agent performs "
        "(inference, tool call, decision). 'prev' must be the most recent record ID "
        "in the agent's own chain. 'memrefs' can point to records authored by other "
        "agents the action depends on. When 'prompt' is supplied, the backend runs it "
        "through its local LLM and hashes the output into ohash."
    ),
    "arc_validate": (
        "Validate a record's BIP-340 Schnorr signature and — in 'deep' mode — the "
        "integrity of its entire provenance chain. Use this before trusting a record "
        "from another agent, before paying a settlement, or to audit your own chain. "
        "Returns {valid, errors, id}."
    ),
    "arc_settle": (
        "Create a Lightning Network settlement record against a prior action. Use "
        "this to cryptographically memorialize a payment for completed agent work. "
        "The returned preimage proves payment; the payment_hash anchors it in the "
        "record."
    ),
    "arc_chain": (
        "Retrieve an agent's complete provenance chain. 'identifier' can be any "
        "record ID (returns the chain ending at that record) or an agent pubkey "
        "(returns all records by that agent). Use this to audit an agent's history "
        "or to reconstruct context before taking a dependent action."
    ),
    "arc_list_records": (
        "List ARC records, optionally filtered by agent pubkey or type "
        "(genesis/action/settlement). Use this for discovery — e.g. to find all "
        "settlements owed to an agent, or every genesis record in the system."
    ),
    "arc_memory_store": (
        "Store a verifiable memory in the ARC DAG. Use this when you learn "
        "something important that should persist across sessions — user "
        "preferences, project decisions, research findings, or any context "
        "future sessions need. Every memory is Schnorr-signed and hash-chained. "
        "Use dotted keys for namespacing (user.*, project.*, session.*, "
        "agent.*, task.*). Pass 'supersedes' when updating a value. "
        "Do NOT store secrets, credentials, API keys, or PII — memories are "
        "public, signed, and append-only."
    ),
    "arc_memory_recall": (
        "Recall memories from the ARC DAG. Search by key pattern "
        "(e.g. 'user.' for all user preferences, 'project.api.' for API "
        "decisions). Returns verified, Schnorr-signed memories, newest first. "
        "Call this at the start of a task to pick up prior context."
    ),
    "arc_memory_latest": (
        "Get the current value of a specific memory key, following any "
        "supersedes chain to return the latest version. Returns 404 if the "
        "key has never been set or the latest record is a tombstone."
    ),
}


def _build_tools() -> list[Tool]:
    schemas: dict[str, type[BaseModel]] = {
        "arc_keygen": KeygenInput,
        "arc_genesis": GenesisInput,
        "arc_action": ActionInput,
        "arc_validate": ValidateInput,
        "arc_settle": SettleInput,
        "arc_chain": ChainInput,
        "arc_list_records": ListRecordsInput,
        "arc_memory_store": MemoryStoreInput,
        "arc_memory_recall": MemoryRecallInput,
        "arc_memory_latest": MemoryLatestInput,
    }
    tools: list[Tool] = []
    for name, model in schemas.items():
        tools.append(
            Tool(
                name=name,
                description=TOOL_DESCRIPTIONS[name],
                inputSchema=model.model_json_schema(),
            )
        )
    return tools


# ── Tool handlers ──────────────────────────────────────────────────────


async def _dispatch(client: ArcClient, name: str, arguments: dict[str, Any]) -> Any:
    """Validate input with Pydantic, then call the matching ARC endpoint."""

    if name == "arc_keygen":
        args = KeygenInput(**arguments)
        return await client.keygen(args.alias)

    if name == "arc_genesis":
        args = GenesisInput(**arguments)
        return await client.genesis(
            action=args.action, alias=args.alias, input_data=args.input_data
        )

    if name == "arc_action":
        args = ActionInput(**arguments)
        return await client.action(
            prev=args.prev,
            action=args.action,
            memrefs=args.memrefs,
            prompt=args.prompt,
        )

    if name == "arc_validate":
        args = ValidateInput(**arguments)
        return await client.validate(args.record_id, deep=args.depth == "deep")

    if name == "arc_settle":
        args = SettleInput(**arguments)
        return await client.settle(
            record_id=args.record_id, amount_sats=args.amount_sats
        )

    if name == "arc_chain":
        args = ChainInput(**arguments)
        return await client.chain(args.identifier)

    if name == "arc_list_records":
        args = ListRecordsInput(**arguments)
        return await client.list_records(agent=args.agent, record_type=args.type)

    if name == "arc_memory_store":
        args = MemoryStoreInput(**arguments)
        result = await client.memory_store(
            memory_key=args.memory_key,
            memory_value=args.memory_value,
            memory_type=args.memory_type,
            alias=args.alias,
            ttl=args.ttl,
            supersedes=args.supersedes,
        )
        # Writes invalidate the read cache so freshly-stored memories are
        # visible on the very next recall.
        _memory_cache.clear()
        return result

    if name == "arc_memory_recall":
        args = MemoryRecallInput(**arguments)
        cache_key = f"recall::{args.query}::{args.agent or ''}::{args.limit}"
        cached = _memory_cache.get(cache_key)
        if cached is not None:
            return cached
        result = await client.memory_search(
            q=args.query, agent=args.agent, limit=args.limit
        )
        _memory_cache.set(cache_key, result)
        return result

    if name == "arc_memory_latest":
        args = MemoryLatestInput(**arguments)
        cache_key = f"latest::{args.key}"
        cached = _memory_cache.get(cache_key)
        if cached is not None:
            return cached
        result = await client.memory_latest(args.key)
        _memory_cache.set(cache_key, result)
        return result

    raise ValueError(f"Unknown tool: {name}")


def _format_result(payload: Any) -> list[TextContent]:
    text = json.dumps(payload, indent=2, sort_keys=True, default=str)
    return [TextContent(type="text", text=text)]


def _format_error(message: str) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps({"error": message}, indent=2))]


# ── Server factory ─────────────────────────────────────────────────────


def build_server(config: ArcMcpConfig | None = None) -> tuple[Server, ArcClient]:
    cfg = config or ArcMcpConfig.from_env()
    client = ArcClient(cfg)
    server: Server = Server("arc-mcp")

    tools = _build_tools()

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return tools

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any] | None) -> list[TextContent]:
        args = arguments or {}
        logger.info("tool call: %s args_keys=%s", name, sorted(args.keys()))
        try:
            result = await _dispatch(client, name, args)
        except ValidationError as exc:
            return _format_error(f"invalid arguments for {name}: {exc.errors()}")
        except ArcApiError as exc:
            return _format_error(str(exc))
        except Exception as exc:  # noqa: BLE001 - surface as MCP error, don't crash server
            logger.exception("tool %s failed", name)
            return _format_error(f"unexpected error in {name}: {exc}")
        return _format_result(result)

    return server, client


# ── Transports ─────────────────────────────────────────────────────────


async def _serve_stdio(config: ArcMcpConfig) -> None:
    server, client = build_server(config)
    try:
        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream, write_stream, server.create_initialization_options()
            )
    finally:
        await client.aclose()


def run_stdio() -> None:
    """Entry point for stdio transport (primary, used by Goose CLI)."""
    config = ArcMcpConfig.from_env()
    configure_logging(config.log_level)
    logger.info("starting arc-mcp (stdio) -> %s", config.api_url)
    asyncio.run(_serve_stdio(config))


def run_sse() -> None:
    """Entry point for SSE transport (remote/web clients)."""
    config = ArcMcpConfig.from_env()
    configure_logging(config.log_level)

    try:
        import uvicorn
        from mcp.server.sse import SseServerTransport
        from starlette.applications import Starlette
        from starlette.routing import Mount, Route
    except ImportError as exc:  # pragma: no cover - only hit when extras missing
        raise SystemExit(
            "SSE transport requires 'starlette' and 'uvicorn'. Install with: "
            "pip install starlette uvicorn"
        ) from exc

    server, client = build_server(config)
    transport = SseServerTransport("/messages/")

    async def handle_sse(request):  # type: ignore[no-untyped-def]
        async with transport.connect_sse(
            request.scope, request.receive, request._send
        ) as (read_stream, write_stream):
            await server.run(
                read_stream, write_stream, server.create_initialization_options()
            )

    app = Starlette(
        routes=[
            Route("/sse", endpoint=handle_sse),
            Mount("/messages/", app=transport.handle_post_message),
        ],
        on_shutdown=[client.aclose],
    )

    logger.info(
        "starting arc-mcp (sse) on %s:%s -> %s",
        config.sse_host,
        config.sse_port,
        config.api_url,
    )
    uvicorn.run(app, host=config.sse_host, port=config.sse_port, log_level=config.log_level.lower())


if __name__ == "__main__":
    run_stdio()
