"""ARC Protocol — Memory Layer.

Memory records are a first-class ARC record type that turn the DAG into
cryptographically verifiable cross-session memory for Goose (or any)
AI agents. Every memory is Schnorr-signed, hash-chained, and append-only.

Schema (fields added on top of the standard ARC record):
    type:            "memory"
    memory_type:     "fact" | "decision" | "preference" | "context" | "learning"
    memory_key:      short searchable key, e.g. "user.preferred_language"
    memory_value:    string payload (up to 4 KB)
    ttl:             optional expiry in seconds (null = permanent)
    supersedes:      optional record_id of a previous memory this one replaces

Namespace convention (by convention, not enforcement):
    user.*     — user preferences / profile
    project.*  — project-level decisions and context
    session.*  — session summaries and key outcomes
    agent.*    — agent-specific learned behaviors
    task.*     — task-related context and findings
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional

import arc

MEMORY_TYPES = {"fact", "decision", "preference", "context", "learning"}
MEMORY_KEY_RE = re.compile(r"^[a-z0-9._-]+$")
MEMORY_VALUE_MAX = 4096
SUPERSEDES_CHAIN_MAX = 100
TOMBSTONE_MARKER = "__ARC_MEMORY_TOMBSTONE__"


class MemoryError(ValueError):
    """Raised for memory-specific validation failures."""


# ── Field validation ───────────────────────────────────────────────────────


def validate_key(key: str) -> str:
    if not isinstance(key, str) or not key:
        raise MemoryError("memory_key must be a non-empty string")
    if len(key) > 256:
        raise MemoryError("memory_key too long (max 256 chars)")
    if not MEMORY_KEY_RE.match(key):
        raise MemoryError(
            "memory_key must match [a-z0-9._-]+ (lowercase, dots for namespacing)"
        )
    return key


def validate_value(value: str) -> str:
    if not isinstance(value, str) or not value:
        raise MemoryError("memory_value must be a non-empty string")
    if len(value.encode("utf-8")) > MEMORY_VALUE_MAX:
        raise MemoryError(f"memory_value exceeds {MEMORY_VALUE_MAX} bytes")
    return value


def validate_type(mtype: str) -> str:
    if mtype not in MEMORY_TYPES:
        raise MemoryError(
            f"memory_type must be one of: {', '.join(sorted(MEMORY_TYPES))}"
        )
    return mtype


# ── DB queries ─────────────────────────────────────────────────────────────


def _iter_memory_rows(db: sqlite3.Connection) -> list[tuple[str, dict]]:
    rows = db.execute(
        "SELECT id, data FROM records WHERE type='memory' ORDER BY ts DESC"
    ).fetchall()
    return [(r[0], json.loads(r[1])) for r in rows]


def all_memories(db: sqlite3.Connection) -> list[dict]:
    return [{"id": rid, "record": rec} for rid, rec in _iter_memory_rows(db)]


def search_memories(
    db: sqlite3.Connection,
    query: str,
    agent: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """Search memory records by key prefix/substring. Most-recent first.

    `query` is treated as a case-insensitive substring against memory_key;
    a trailing "*" is ignored (prefix-style). Use empty string to list all.
    """
    q = (query or "").strip().lower().rstrip("*")
    results: list[dict] = []
    for rid, rec in _iter_memory_rows(db):
        if agent and rec.get("agent", {}).get("pubkey") != agent:
            continue
        key = (rec.get("memory_key") or "").lower()
        if q and q not in key:
            continue
        if _is_expired(rec):
            continue
        results.append({"id": rid, "record": rec})
        if len(results) >= limit:
            break
    return results


def memories_for_agent(db: sqlite3.Connection, pubkey: str) -> list[dict]:
    """All non-expired memories authored by a specific agent, newest first."""
    rows = db.execute(
        "SELECT id, data FROM records WHERE type='memory' AND pubkey=? ORDER BY ts DESC",
        (pubkey,),
    ).fetchall()
    out: list[dict] = []
    for rid, raw in rows:
        rec = json.loads(raw)
        if _is_expired(rec):
            continue
        out.append({"id": rid, "record": rec})
    return out


def latest_for_key(
    db: sqlite3.Connection, key: str, agent: Optional[str] = None
) -> Optional[dict]:
    """Return the current value for a memory key.

    "Current" = most recent (by ts) memory record with memory_key=key that
    hasn't been tombstoned and isn't expired. The supersedes chain is walked
    to confirm the head is reachable and reasonable.
    """
    validate_key(key)
    rows = _iter_memory_rows(db)
    candidates = [
        (rid, rec)
        for rid, rec in rows
        if rec.get("memory_key") == key
        and (agent is None or rec.get("agent", {}).get("pubkey") == agent)
    ]
    if not candidates:
        return None
    # rows already sorted by ts DESC, but re-sort defensively
    candidates.sort(key=lambda x: x[1].get("ts", ""), reverse=True)
    head_id, head_rec = candidates[0]
    if _is_expired(head_rec):
        return None
    if head_rec.get("memory_value") == TOMBSTONE_MARKER:
        return None
    timeline = _walk_supersedes(db, head_rec)
    return {"id": head_id, "record": head_rec, "timeline": timeline}


def timeline_for_key(db: sqlite3.Connection, key: str) -> list[dict]:
    """Every memory record for a key, newest first — the full audit history."""
    validate_key(key)
    rows = _iter_memory_rows(db)
    return [
        {"id": rid, "record": rec}
        for rid, rec in rows
        if rec.get("memory_key") == key
    ]


def _walk_supersedes(
    db: sqlite3.Connection, head: dict, _depth: int = 0
) -> list[dict]:
    """Walk backward along the supersedes chain for audit/timeline view.

    Bounded by SUPERSEDES_CHAIN_MAX to guard against abuse (malicious chains
    that would blow up memory on a GET).
    """
    chain: list[dict] = []
    current = head
    seen: set[str] = set()
    depth = 0
    while current and depth < SUPERSEDES_CHAIN_MAX:
        sup_id = current.get("supersedes")
        if not sup_id or sup_id in seen:
            break
        seen.add(sup_id)
        prev_rec = arc.fetch(db, sup_id)
        if not prev_rec:
            break
        chain.append({"id": sup_id, "record": prev_rec})
        current = prev_rec
        depth += 1
    return chain


# ── TTL ────────────────────────────────────────────────────────────────────


def _is_expired(rec: dict) -> bool:
    ttl = rec.get("ttl")
    if not ttl:
        return False
    try:
        ts = datetime.fromisoformat(rec["ts"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    age = (datetime.now(timezone.utc) - ts).total_seconds()
    return age > float(ttl)


# ── Write-side checks ──────────────────────────────────────────────────────


def validate_supersedes(
    db: sqlite3.Connection, supersedes_id: str, agent_pubkey: str
) -> dict:
    """Supersedes target must: exist, be of type 'memory', belong to same
    agent, and not be the head of a chain already longer than the max.
    """
    if not re.match(r"^[0-9a-f]{64}$", supersedes_id):
        raise MemoryError("supersedes must be a 64-char hex record id")
    target = arc.fetch(db, supersedes_id)
    if not target:
        raise MemoryError(f"supersedes target {supersedes_id[:16]}... not found")
    if target.get("type") != "memory":
        raise MemoryError("supersedes must reference a record of type 'memory'")
    if target.get("agent", {}).get("pubkey") != agent_pubkey:
        raise MemoryError("supersedes target must belong to the same agent")
    # Bound the resulting chain length.
    depth = 0
    current = target
    seen = {supersedes_id}
    while current and depth < SUPERSEDES_CHAIN_MAX + 1:
        sup = current.get("supersedes")
        if not sup or sup in seen:
            break
        seen.add(sup)
        current = arc.fetch(db, sup)
        depth += 1
    if depth >= SUPERSEDES_CHAIN_MAX:
        raise MemoryError(
            f"supersedes chain would exceed {SUPERSEDES_CHAIN_MAX} links"
        )
    return target


# ── Record builder ─────────────────────────────────────────────────────────


def build_memory_record(
    secret: bytes,
    *,
    prev: str,
    memory_key: str,
    memory_value: str,
    memory_type: str,
    alias: Optional[str] = None,
    ttl: Optional[int] = None,
    supersedes: Optional[str] = None,
    memrefs: Optional[list[str]] = None,
) -> dict:
    """Assemble and sign a memory record. Caller is responsible for prev/supersedes
    existence checks (the API layer does them before calling this).
    """
    validate_key(memory_key)
    validate_value(memory_value)
    validate_type(memory_type)
    action_desc = f"memory/{memory_type}: {memory_key}"
    return arc.build_record(
        "memory",
        secret,
        action_desc,
        prev=prev,
        memrefs=memrefs or [],
        alias=alias,
        ihash=arc.sha256hex(f"{memory_key}={memory_value}".encode()),
        ohash=arc.sha256hex(memory_value.encode()),
        memory={
            "memory_type": memory_type,
            "memory_key": memory_key,
            "memory_value": memory_value,
            "ttl": ttl,
            "supersedes": supersedes,
        },
    )


def build_tombstone_record(
    secret: bytes,
    *,
    prev: str,
    supersedes_id: str,
    memory_key: str,
    alias: Optional[str] = None,
) -> dict:
    """Soft-delete a memory by superseding it with a tombstone record."""
    return build_memory_record(
        secret,
        prev=prev,
        memory_key=memory_key,
        memory_value=TOMBSTONE_MARKER,
        memory_type="context",
        alias=alias,
        supersedes=supersedes_id,
    )


# ── Stats ──────────────────────────────────────────────────────────────────


def stats(db: sqlite3.Connection) -> dict[str, Any]:
    rows = _iter_memory_rows(db)
    by_type: dict[str, int] = {}
    by_key: dict[str, int] = {}
    by_agent: dict[str, int] = {}
    tombstoned = 0
    expired = 0
    for _rid, rec in rows:
        t = rec.get("memory_type", "?")
        by_type[t] = by_type.get(t, 0) + 1
        k = rec.get("memory_key", "?")
        by_key[k] = by_key.get(k, 0) + 1
        pk = rec.get("agent", {}).get("pubkey", "?")
        by_agent[pk] = by_agent.get(pk, 0) + 1
        if rec.get("memory_value") == TOMBSTONE_MARKER:
            tombstoned += 1
        if _is_expired(rec):
            expired += 1
    top_keys = sorted(by_key.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return {
        "total": len(rows),
        "by_type": by_type,
        "by_agent_count": len(by_agent),
        "top_keys": [{"key": k, "count": n} for k, n in top_keys],
        "tombstoned": tombstoned,
        "expired": expired,
    }
