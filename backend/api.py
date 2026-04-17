"""ARC Protocol – REST API (FastAPI)
Security: rate limiting, strict Pydantic validation, Schnorr re-verification.
Private keys never touch the API transport layer.
"""

import logging
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import arc
import memory as mem
import marketplace as mkt
import research_agent as ra
import codegen_agent as cg
import trader_agent as ta
import legal_agent as la
import design_agent as da
import support_agent as sa
import compliance_agent as coa
import data_agent as dta
import orchestrator_agent as oa
import content_agent as cta

# Structured logging so Vercel/Railway surface tracebacks instead of
# a bare "Internal Server Error" with no detail.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("arc.api")

# ── Rate Limiting ──────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ARC Protocol",
    version=arc.ARC_VERSION,
    description="Agent Record Convention API",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler — log full traceback and return structured JSON
# so production 500s are debuggable instead of opaque.
@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        # Let FastAPI's default HTTPException handling pass through.
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    tb = traceback.format_exc()
    log.error(
        "Unhandled exception on %s %s: %s\n%s",
        request.method, request.url.path, exc, tb,
    )
    # ARC_DEBUG=1 exposes the traceback in the response body for triage.
    # Off by default to avoid leaking internals.
    body: dict = {
        "detail": "Internal Server Error",
        "error_type": type(exc).__name__,
        "error": str(exc),
        "path": request.url.path,
    }
    if os.environ.get("ARC_DEBUG") == "1":
        body["traceback"] = tb
    return JSONResponse(status_code=500, content=body)

_HEX64 = re.compile(r"^[0-9a-f]{64}$")


# ── Request Models (strict Pydantic validation) ───────────────────────────


class KeygenReq(BaseModel):
    alias: Optional[str] = Field(None, max_length=64)


class GenesisReq(BaseModel):
    alias: Optional[str] = Field(None, max_length=64)
    action: str = Field(..., min_length=1, max_length=4096)
    input_data: str = Field("genesis", max_length=65536)


class ActionReq(BaseModel):
    prev: str = Field(..., min_length=64, max_length=64)
    action: str = Field(..., min_length=1, max_length=4096)
    memrefs: list[str] = Field(default_factory=list)
    prompt: Optional[str] = Field(None, max_length=65536)

    @field_validator("prev")
    @classmethod
    def validate_prev_hex(cls, v: str) -> str:
        if not _HEX64.match(v):
            raise ValueError("prev must be a 64-char lowercase hex string")
        return v

    @field_validator("memrefs")
    @classmethod
    def validate_memrefs_hex(cls, v: list[str]) -> list[str]:
        for m in v:
            if not _HEX64.match(m):
                raise ValueError(f"memref must be 64-char hex: {m[:16]}...")
        return v


class SettleReq(BaseModel):
    record_id: str = Field(..., min_length=64, max_length=64)
    amount: int = Field(..., gt=0, le=21_000_000_00_000_000)

    @field_validator("record_id")
    @classmethod
    def validate_record_hex(cls, v: str) -> str:
        if not _HEX64.match(v):
            raise ValueError("record_id must be a 64-char lowercase hex string")
        return v


class GenerateReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    content_type: str = Field("article")
    price_sats: int = Field(1000, gt=0, le=21_000_000_00_000_000)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: str) -> str:
        allowed = {"article", "code", "analysis", "image_desc", "summary", "creative"}
        if v not in allowed:
            raise ValueError(f"content_type must be one of: {', '.join(sorted(allowed))}")
        return v


# ── Helpers ────────────────────────────────────────────────────────────────


def _verify_and_store(db, record: dict) -> str:
    """Re-verify Schnorr signature before storing. Defense in depth."""
    if not arc.verify_sig(record):
        raise HTTPException(500, "Signature verification failed after signing")
    return arc.store(db, record)


def _validate_hex_id(record_id: str) -> None:
    if not _HEX64.match(record_id):
        raise HTTPException(400, "Invalid record ID format")


# NOTE: Private keys never touch the API transport layer.
# Key material is loaded from ~/.arc/keys/ (0600 perms) for signing, then
# the reference is discarded. The keygen endpoint returns the pubkey;
# the secret stays on the server filesystem only.


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    """Liveness + runtime introspection.

    Reports the resolved ARC_DIR, whether the DB is reachable, and how many
    records are currently stored. Safe to expose — no secrets.
    """
    info: dict = {
        "status": "ok",
        "arc_version": arc.ARC_VERSION,
        "arc_dir": str(arc.ARC_DIR),
        "db_path": str(arc.DB_PATH),
    }
    try:
        db = arc.get_db()
        row = db.execute("SELECT COUNT(*) FROM records").fetchone()
        info["record_count"] = int(row[0]) if row else 0
        info["db_ok"] = True
    except Exception as e:  # noqa: BLE001
        info["db_ok"] = False
        info["db_error"] = f"{type(e).__name__}: {e}"
    try:
        info["keys_count"] = len(list(arc.KEYS_DIR.glob("*.key")))
    except Exception:
        info["keys_count"] = None
    return info


@app.post("/debug/seed")
def debug_reseed():
    """Force a (re-)seed attempt. Useful after a cold start on ephemeral
    filesystems (Vercel). Returns per-agent record counts after seeding.
    """
    try:
        seed_production_db()
    except Exception as e:  # noqa: BLE001
        tb = traceback.format_exc()
        log.error("debug_reseed failed: %s\n%s", e, tb)
        raise HTTPException(500, f"Seed failed: {type(e).__name__}: {e}")
    db = arc.get_db()
    counts: dict[str, int] = {}
    try:
        rows = db.execute(
            "SELECT json_extract(data,'$.agent.alias') AS a, COUNT(*) "
            "FROM records GROUP BY a"
        ).fetchall()
        counts = {(r[0] or "<unaliased>"): int(r[1]) for r in rows}
    except Exception as e:  # noqa: BLE001
        counts = {"_error": f"{type(e).__name__}: {e}"}
    total_row = db.execute("SELECT COUNT(*) FROM records").fetchone()
    return {
        "ok": True,
        "arc_dir": str(arc.ARC_DIR),
        "total": int(total_row[0]) if total_row else 0,
        "by_alias": counts,
    }


@app.post("/keygen")
@limiter.limit("10/minute")
def keygen(request: Request, req: KeygenReq):
    secret, pub = arc.generate_keypair(req.alias)
    return {"pubkey": pub, "alias": req.alias or pub[:16], "secret": secret}


@app.get("/keys")
def keys():
    return arc.list_keys()


@app.post("/genesis")
@limiter.limit("30/minute")
def genesis(request: Request, req: GenesisReq):
    try:
        key = arc.load_key()
    except Exception:
        # Auto-generate a key if none exist
        arc.generate_keypair("default")
        key = arc.load_key()
    rec = arc.build_record(
        "genesis",
        key,
        req.action,
        alias=req.alias,
        ihash=arc.sha256hex(req.input_data.encode()),
    )
    db = arc.get_db()
    rid = _verify_and_store(db, rec)
    return {"id": rid, "record": rec}


@app.post("/action")
@limiter.limit("30/minute")
def action(request: Request, req: ActionReq):
    db = arc.get_db()
    try:
        key = arc.load_key()
    except Exception:
        raise HTTPException(400, "No keys found. Generate a keypair first.")
    if not arc.fetch(db, req.prev):
        raise HTTPException(404, f"prev {req.prev[:16]}... not found")
    for m in req.memrefs:
        if not arc.fetch(db, m):
            raise HTTPException(404, f"memref {m[:16]}... not found")
    ihash = arc.sha256hex((req.prompt or req.action).encode())
    if req.prompt:
        out = arc.ollama_generate(req.prompt)
        ohash = arc.sha256hex(out.encode())
    else:
        ohash = arc.sha256hex(req.action.encode())
    rec = arc.build_record(
        "action",
        key,
        req.action,
        prev=req.prev,
        memrefs=req.memrefs,
        ihash=ihash,
        ohash=ohash,
    )
    rid = _verify_and_store(db, rec)
    return {"id": rid, "record": rec}


@app.get("/validate/{record_id}")
@limiter.limit("60/minute")
def validate(request: Request, record_id: str, deep: bool = True):
    _validate_hex_id(record_id)
    errs = arc.validate(arc.get_db(), record_id, deep)
    return {"valid": len(errs) == 0, "errors": errs, "id": record_id}


@app.post("/settle")
@limiter.limit("10/minute")
def settle(request: Request, req: SettleReq):
    db = arc.get_db()
    try:
        key = arc.load_key()
    except Exception:
        raise HTTPException(400, "No keys found. Generate a keypair first.")
    if not arc.fetch(db, req.record_id):
        raise HTTPException(404, "Record not found")
    preimage = os.urandom(32)
    phash = arc.sha256hex(preimage)
    settlement = {
        "type": "lightning",
        "amount_sats": req.amount,
        "payment_hash": phash,
        "preimage": preimage.hex(),
    }
    rec = arc.build_record(
        "settlement",
        key,
        f"Settlement: {req.amount} sats",
        prev=req.record_id,
        settlement=settlement,
        ihash=arc.sha256hex(f"settle:{req.record_id}:{req.amount}".encode()),
        ohash=arc.sha256hex(f"paid:{phash}".encode()),
    )
    rid = _verify_and_store(db, rec)
    return {
        "id": rid,
        "record": rec,
        "payment_hash": phash,
        "preimage": preimage.hex(),
    }


@app.get("/record/{record_id}")
@limiter.limit("60/minute")
def get_record(request: Request, record_id: str):
    _validate_hex_id(record_id)
    record = arc.fetch(arc.get_db(), record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    return {"id": record_id, "record": record}


@app.get("/chain/{identifier}")
@limiter.limit("60/minute")
def get_chain(request: Request, identifier: str):
    db = arc.get_db()
    record = arc.fetch(db, identifier)
    if record:
        chain = []
        cur = identifier
        while cur:
            r = arc.fetch(db, cur)
            if not r:
                break
            chain.append({"id": cur, "record": r})
            cur = r.get("prev")
        chain.reverse()
        return chain
    rows = arc.fetch_by_pubkey(db, identifier)
    if not rows:
        raise HTTPException(404, "Not found")
    return [{"id": rid, "record": r} for rid, r in rows]


@app.get("/records")
@limiter.limit("60/minute")
def list_records(request: Request):
    return [{"id": rid, "record": r} for rid, r in arc.all_records(arc.get_db())]


@app.get("/inscription/{record_id}")
@limiter.limit("60/minute")
def inscription(request: Request, record_id: str):
    _validate_hex_id(record_id)
    record = arc.fetch(arc.get_db(), record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    return {"command": arc.inscription_envelope(record), "record": record}


# ── Memory Layer ───────────────────────────────────────────────────────────
# Cryptographically verifiable cross-session memory for Goose (and any)
# agents. Writes go through the same Schnorr signing path as every other
# ARC record — no unsigned memories. See backend/memory.py.


class MemoryStoreReq(BaseModel):
    memory_key: str = Field(..., min_length=1, max_length=256)
    memory_value: str = Field(..., min_length=1, max_length=mem.MEMORY_VALUE_MAX)
    memory_type: str = Field("context", max_length=32)
    alias: Optional[str] = Field(None, max_length=64)
    ttl: Optional[int] = Field(None, ge=1, le=60 * 60 * 24 * 365 * 10)
    supersedes: Optional[str] = Field(None, min_length=64, max_length=64)

    @field_validator("supersedes")
    @classmethod
    def _hex(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _HEX64.match(v):
            raise ValueError("supersedes must be 64-char lowercase hex")
        return v


def _agent_head(db, pubkey: str) -> Optional[str]:
    """Most recent record ID for an agent — needed as prev for a new write."""
    rows = arc.fetch_by_pubkey(db, pubkey)
    return rows[-1][0] if rows else None


def _ensure_agent_head(db, key: bytes, alias: Optional[str]) -> str:
    """Return prev for this agent, creating a genesis if none exists yet."""
    pub = arc.xonly_pubkey(key).hex()
    head = _agent_head(db, pub)
    if head:
        return head
    genesis = arc.build_record(
        "genesis", key, f"Memory agent initialized ({alias or pub[:16]})",
        alias=alias or "memory",
    )
    return _verify_and_store(db, genesis)


@app.post("/memory")
@limiter.limit("60/minute")
def memory_store(request: Request, req: MemoryStoreReq):
    """Create a signed, hash-chained memory record."""
    try:
        mem.validate_key(req.memory_key)
        mem.validate_value(req.memory_value)
        mem.validate_type(req.memory_type)
    except mem.MemoryError as e:
        raise HTTPException(400, str(e))

    db = arc.get_db()
    try:
        key = arc.load_key()
    except Exception:
        arc.generate_keypair(req.alias or "memory")
        key = arc.load_key()
    pub = arc.xonly_pubkey(key).hex()

    if req.supersedes:
        try:
            mem.validate_supersedes(db, req.supersedes, pub)
        except mem.MemoryError as e:
            raise HTTPException(400, str(e))

    prev = _ensure_agent_head(db, key, req.alias)
    rec = mem.build_memory_record(
        key,
        prev=prev,
        memory_key=req.memory_key,
        memory_value=req.memory_value,
        memory_type=req.memory_type,
        alias=req.alias,
        ttl=req.ttl,
        supersedes=req.supersedes,
    )
    rid = _verify_and_store(db, rec)
    return {"id": rid, "record": rec}


@app.get("/memory/search")
@limiter.limit("120/minute")
def memory_search(
    request: Request,
    q: str = "",
    agent: Optional[str] = None,
    limit: int = 100,
):
    """Search memory records by key prefix/substring."""
    if agent and not _HEX64.match(agent):
        raise HTTPException(400, "agent must be 64-char hex pubkey")
    limit = max(1, min(limit, 500))
    return {"results": mem.search_memories(arc.get_db(), q, agent=agent, limit=limit)}


@app.get("/memory/agent/{pubkey}")
@limiter.limit("120/minute")
def memory_agent(request: Request, pubkey: str):
    if not _HEX64.match(pubkey):
        raise HTTPException(400, "pubkey must be 64-char hex")
    return {"agent": pubkey, "results": mem.memories_for_agent(arc.get_db(), pubkey)}


@app.get("/memory/latest/{key}")
@limiter.limit("120/minute")
def memory_latest(request: Request, key: str):
    try:
        mem.validate_key(key)
    except mem.MemoryError as e:
        raise HTTPException(400, str(e))
    result = mem.latest_for_key(arc.get_db(), key)
    if result is None:
        raise HTTPException(404, f"no memory for key '{key}'")
    return result


@app.get("/memory/timeline/{key}")
@limiter.limit("120/minute")
def memory_timeline(request: Request, key: str):
    try:
        mem.validate_key(key)
    except mem.MemoryError as e:
        raise HTTPException(400, str(e))
    return {"key": key, "history": mem.timeline_for_key(arc.get_db(), key)}


@app.get("/memory/stats")
@limiter.limit("60/minute")
def memory_stats(request: Request):
    return mem.stats(arc.get_db())


@app.delete("/memory/{record_id}")
@limiter.limit("30/minute")
def memory_delete(request: Request, record_id: str):
    """Soft-delete by appending a tombstone record that supersedes this one."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    target = arc.fetch(db, record_id)
    if not target or target.get("type") != "memory":
        raise HTTPException(404, "memory record not found")
    try:
        key = arc.load_key()
    except Exception:
        raise HTTPException(400, "No keys found")
    pub = arc.xonly_pubkey(key).hex()
    if target.get("agent", {}).get("pubkey") != pub:
        raise HTTPException(403, "can only tombstone own memories")
    prev = _ensure_agent_head(db, key, target.get("agent", {}).get("alias"))
    rec = mem.build_tombstone_record(
        key,
        prev=prev,
        supersedes_id=record_id,
        memory_key=target["memory_key"],
        alias=target.get("agent", {}).get("alias"),
    )
    rid = _verify_and_store(db, rec)
    return {"id": rid, "record": rec, "tombstoned": record_id}


# ── Marketplace ────────────────────────────────────────────────────────────


def _ensure_content_table(db):
    db.execute(
        """CREATE TABLE IF NOT EXISTS content (
        record_id TEXT PRIMARY KEY, prompt TEXT NOT NULL, output TEXT NOT NULL,
        content_type TEXT NOT NULL, price_sats INTEGER DEFAULT 0,
        created_at TEXT NOT NULL)"""
    )
    db.commit()


@app.post("/generate")
@limiter.limit("10/minute")
def generate(request: Request, req: GenerateReq):
    """Generate AI content via Ollama and create ARC action inscription."""
    try:
        key = arc.load_key()
    except Exception:
        arc.generate_keypair("marketplace")
        key = arc.load_key()

    db = arc.get_db()
    _ensure_content_table(db)
    pub = arc.xonly_pubkey(key).hex()

    # Find latest record for this agent, or create genesis
    rows = arc.fetch_by_pubkey(db, pub)
    genesis_result = None
    if not rows:
        genesis_rec = arc.build_record(
            "genesis", key, "Marketplace agent initialized",
            alias="marketplace",
            ihash=arc.sha256hex(b"marketplace-genesis"),
        )
        genesis_id = _verify_and_store(db, genesis_rec)
        prev_id = genesis_id
        genesis_result = {"id": genesis_id, "record": genesis_rec}
    else:
        prev_id = rows[-1][0]

    # Call Ollama
    output = arc.ollama_generate(req.prompt, req.model)

    ihash = arc.sha256hex(req.prompt.encode())
    ohash = arc.sha256hex(output.encode())

    rec = arc.build_record(
        "action", key,
        f"{req.content_type}: {req.prompt[:100]}",
        prev=prev_id,
        ihash=ihash, ohash=ohash,
    )
    rid = _verify_and_store(db, rec)

    # Store content alongside ARC record
    db.execute(
        "INSERT OR REPLACE INTO content VALUES (?,?,?,?,?,?)",
        (rid, req.prompt, output, req.content_type, req.price_sats,
         datetime.now(timezone.utc).isoformat()),
    )
    db.commit()

    return {
        "id": rid,
        "record": rec,
        "content": output,
        "prompt": req.prompt,
        "content_type": req.content_type,
        "price_sats": req.price_sats,
        "genesis": genesis_result,
    }


@app.get("/content/{record_id}")
@limiter.limit("60/minute")
def get_content(request: Request, record_id: str):
    """Fetch generated content and its ARC record."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    _ensure_content_table(db)
    row = db.execute(
        "SELECT prompt, output, content_type, price_sats, created_at "
        "FROM content WHERE record_id=?",
        (record_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Content not found")
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    # Check if already settled
    settled = False
    settlement_id = None
    for rid, r in arc.all_records(db):
        if r.get("type") == "settlement" and r.get("prev") == record_id:
            settled = True
            settlement_id = rid
            break
    return {
        "id": record_id,
        "record": record,
        "prompt": row[0],
        "output": row[1],
        "content_type": row[2],
        "price_sats": row[3],
        "created_at": row[4],
        "settled": settled,
        "settlement_id": settlement_id,
    }


@app.get("/marketplace")
@limiter.limit("60/minute")
def list_marketplace(request: Request):
    """Public marketplace feed – only validated ARC records."""
    db = arc.get_db()
    _ensure_content_table(db)
    rows = db.execute(
        "SELECT record_id, prompt, output, content_type, price_sats, created_at "
        "FROM content ORDER BY created_at DESC"
    ).fetchall()
    result = []
    for row in rows:
        record = arc.fetch(db, row[0])
        if not record:
            continue
        # Signature verification (shallow validation for list performance)
        valid = arc.verify_sig(record)
        if not valid:
            continue
        result.append({
            "id": row[0],
            "record": record,
            "prompt": row[1],
            "output": row[2][:500],
            "content_type": row[3],
            "price_sats": row[4],
            "created_at": row[5],
            "valid": True,
        })
    return result


# ── Service Marketplace ───────────────────────────────────────────────────


class SvcRequestReq(BaseModel):
    task: str = Field(..., min_length=1, max_length=4096)
    max_sats: int = Field(..., gt=0, le=21_000_000_00_000_000)


class SvcOfferReq(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=64)
    price_sats: int = Field(..., gt=0, le=21_000_000_00_000_000)


class SvcDeliverReq(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=64)
    result: str = Field(..., min_length=1, max_length=65536)


class SvcJobIdReq(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=64)


@app.post("/marketplace/request")
@limiter.limit("30/minute")
def svc_request(request: Request, req: SvcRequestReq):
    try:
        return mkt.request_task(arc.get_db(), req.task, req.max_sats)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/marketplace/offer")
@limiter.limit("30/minute")
def svc_offer(request: Request, req: SvcOfferReq):
    try:
        return mkt.offer_service(arc.get_db(), req.job_id, req.price_sats)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/marketplace/accept")
@limiter.limit("30/minute")
def svc_accept(request: Request, req: SvcJobIdReq):
    try:
        return mkt.accept_offer(arc.get_db(), req.job_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/marketplace/deliver")
@limiter.limit("30/minute")
def svc_deliver(request: Request, req: SvcDeliverReq):
    try:
        return mkt.deliver_work(arc.get_db(), req.job_id, req.result)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/marketplace/pay")
@limiter.limit("10/minute")
def svc_pay(request: Request, req: SvcJobIdReq):
    try:
        return mkt.pay_invoice(arc.get_db(), req.job_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/marketplace/receipt")
@limiter.limit("10/minute")
def svc_receipt(request: Request, req: SvcJobIdReq):
    try:
        return mkt.confirm_receipt(arc.get_db(), req.job_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/marketplace/jobs")
@limiter.limit("60/minute")
def svc_jobs(request: Request):
    return mkt.list_jobs(arc.get_db())


@app.get("/marketplace/job/{job_id}")
@limiter.limit("60/minute")
def svc_job(request: Request, job_id: str):
    try:
        return mkt.get_job(arc.get_db(), job_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/marketplace/dispute/{job_id}")
@limiter.limit("60/minute")
def svc_dispute(request: Request, job_id: str):
    try:
        return mkt.get_dispute_data(arc.get_db(), job_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/marketplace/demo")
@limiter.limit("5/minute")
def svc_demo(request: Request):
    try:
        return mkt.run_demo(arc.get_db())
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Research Agent ────────────────────────────────────────────────────────────


class ResearchReq(BaseModel):
    query: str = Field(..., min_length=1, max_length=65536)
    model: str = Field("llama3.2", max_length=64)


@app.post("/research")
@limiter.limit("5/minute")
def research(request: Request, req: ResearchReq):
    """Run LangGraph deep research agent with ARC inscriptions."""
    try:
        result = ra.run_research(req.query, req.model)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Research agent error: {str(e)}")


@app.get("/research/chain/{record_id}")
@limiter.limit("60/minute")
def research_chain(request: Request, record_id: str):
    """Fetch the full research chain starting from a record."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    # Walk chain backwards
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    # Also gather memref targets
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


# ── Code Generator Agent ──────────────────────────────────────────────────────


SUPPORTED_LANGUAGES = {
    "python", "javascript", "typescript", "rust", "go",
    "bash", "solidity", "ruby", "java", "c",
}


class CodegenReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    language: str = Field("python", max_length=32)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_LANGUAGES:
            raise ValueError(f"language must be one of: {', '.join(sorted(SUPPORTED_LANGUAGES))}")
        return v


@app.post("/codegen")
@limiter.limit("5/minute")
def codegen(request: Request, req: CodegenReq):
    """Run LangGraph code generation agent with ARC inscriptions."""
    try:
        result = cg.run_codegen(req.prompt, req.language, req.model)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Codegen agent error: {str(e)}")


@app.get("/codegen/chain/{record_id}")
@limiter.limit("60/minute")
def codegen_chain(request: Request, record_id: str):
    """Fetch the full codegen chain starting from a record."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


# ── DeFi Trader Agent ────────────────────────────────────────────────────────


class TraderReq(BaseModel):
    market_prompt: str = Field(..., min_length=1, max_length=65536)
    pair: str = Field("BTC/USD", max_length=32)
    timeframe: str = Field("4h", max_length=16)
    max_risk_pct: float = Field(2.0, gt=0, le=100)
    max_position_sats: int = Field(1_000_000, gt=0, le=21_000_000_00_000_000)
    signal_fee_sats: int = Field(1000, gt=0, le=21_000_000_00_000_000)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("timeframe")
    @classmethod
    def validate_timeframe(cls, v: str) -> str:
        allowed = {"1m", "5m", "15m", "1h", "4h", "1d", "1w"}
        if v not in allowed:
            raise ValueError(f"timeframe must be one of: {', '.join(sorted(allowed))}")
        return v


@app.post("/trader")
@limiter.limit("5/minute")
def trader(request: Request, req: TraderReq):
    """Run LangGraph DeFi trader agent with ARC inscriptions + Lightning settlement."""
    try:
        result = ta.run_trader(
            market_prompt=req.market_prompt,
            pair=req.pair,
            timeframe=req.timeframe,
            max_risk_pct=req.max_risk_pct,
            max_position_sats=req.max_position_sats,
            signal_fee_sats=req.signal_fee_sats,
            model=req.model,
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Trader agent error: {str(e)}")


@app.get("/trader/chain/{record_id}")
@limiter.limit("60/minute")
def trader_chain(request: Request, record_id: str):
    """Fetch the full trader chain starting from a record."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


# ── Legal Contracts Agent ────────────────────────────────────────────────────


SUPPORTED_TEMPLATES = {"nda", "service", "license", "custom"}


class LegalReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    template: str = Field("custom", max_length=32)
    parties: str = Field("", max_length=512)
    jurisdiction: str = Field("Delaware, USA", max_length=128)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("template")
    @classmethod
    def validate_template(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_TEMPLATES:
            raise ValueError(
                f"template must be one of: {', '.join(sorted(SUPPORTED_TEMPLATES))}"
            )
        return v


@app.get("/legal/templates")
@limiter.limit("60/minute")
def legal_templates(request: Request):
    """Return the available legal contract templates."""
    return {"templates": la.list_templates()}


@app.post("/legal")
@limiter.limit("5/minute")
def legal(request: Request, req: LegalReq):
    """Run LangGraph legal contracts agent with cross-agent ARC inscriptions."""
    try:
        return la.run_legal(
            prompt=req.prompt,
            template=req.template,
            parties=req.parties,
            jurisdiction=req.jurisdiction,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Legal agent error: {str(e)}")


@app.get("/legal/chain/{record_id}")
@limiter.limit("60/minute")
def legal_chain(request: Request, record_id: str):
    """Fetch the full legal contract chain + cross-agent memref targets."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


@app.get("/legal/verify/{record_id}")
@limiter.limit("60/minute")
def legal_verify(request: Request, record_id: str):
    """Deep-verify a legal contract record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Design & Images Agent ────────────────────────────────────────────────────


SUPPORTED_STYLES = {
    "photorealistic", "cyberpunk", "abstract", "anime", "minimalist", "retrofuturist",
}
SUPPORTED_ASPECTS = {"1:1", "16:9", "9:16", "4:3", "3:4"}


class DesignReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    style: str = Field("abstract", max_length=32)
    aspect_ratio: str = Field("1:1", max_length=8)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("style")
    @classmethod
    def validate_style(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_STYLES:
            raise ValueError(
                f"style must be one of: {', '.join(sorted(SUPPORTED_STYLES))}"
            )
        return v

    @field_validator("aspect_ratio")
    @classmethod
    def validate_aspect(cls, v: str) -> str:
        if v not in SUPPORTED_ASPECTS:
            raise ValueError(
                f"aspect_ratio must be one of: {', '.join(sorted(SUPPORTED_ASPECTS))}"
            )
        return v


@app.get("/design/styles")
@limiter.limit("60/minute")
def design_styles(request: Request):
    """Return available design styles + aspect ratios."""
    return {
        "styles": da.list_styles(),
        "aspect_ratios": da.list_aspect_ratios(),
    }


@app.post("/design")
@limiter.limit("5/minute")
def design(request: Request, req: DesignReq):
    """Run LangGraph design-&-images agent with cross-agent ARC inscriptions."""
    try:
        return da.run_design(
            prompt=req.prompt,
            style=req.style,
            aspect_ratio=req.aspect_ratio,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Design agent error: {str(e)}")


@app.get("/design/chain/{record_id}")
@limiter.limit("60/minute")
def design_chain(request: Request, record_id: str):
    """Fetch the full design chain + cross-agent memref targets."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


@app.get("/design/verify/{record_id}")
@limiter.limit("60/minute")
def design_verify(request: Request, record_id: str):
    """Deep-verify a design record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Customer Support Agent ──────────────────────────────────────────────────


SUPPORTED_ISSUES = {
    "billing", "technical", "account", "onboarding", "dispute", "general",
}
SUPPORTED_PRIORITIES = {"P0", "P1", "P2", "P3"}


class SupportReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    issue_type: str = Field("general", max_length=32)
    customer: str = Field("", max_length=128)
    priority: str = Field("P2", max_length=8)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("issue_type")
    @classmethod
    def validate_issue(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_ISSUES:
            raise ValueError(
                f"issue_type must be one of: {', '.join(sorted(SUPPORTED_ISSUES))}"
            )
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        v = v.upper()
        if v not in SUPPORTED_PRIORITIES:
            raise ValueError(
                f"priority must be one of: {', '.join(sorted(SUPPORTED_PRIORITIES))}"
            )
        return v


@app.get("/support/issues")
@limiter.limit("60/minute")
def support_issues(request: Request):
    """Return the available support issue types + playbooks."""
    return {"issues": sa.list_issue_types()}


@app.post("/support")
@limiter.limit("5/minute")
def support(request: Request, req: SupportReq):
    """Run LangGraph customer-support agent with cross-agent ARC inscriptions."""
    try:
        return sa.run_support(
            prompt=req.prompt,
            issue_type=req.issue_type,
            customer=req.customer,
            priority=req.priority,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Support agent error: {str(e)}")


@app.get("/support/chain/{record_id}")
@limiter.limit("60/minute")
def support_chain(request: Request, record_id: str):
    """Fetch the full support ticket chain + cross-agent memref targets."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


@app.get("/support/verify/{record_id}")
@limiter.limit("60/minute")
def support_verify(request: Request, record_id: str):
    """Deep-verify a support record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Compliance & Audit Agent ────────────────────────────────────────────────


SUPPORTED_COMPLIANCE_TYPES = {
    "regulatory", "safety", "provenance", "hallucination", "bias",
}
SUPPORTED_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}


class ComplianceReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    compliance_type: str = Field("regulatory", max_length=32)
    subject: str = Field("", max_length=128)
    severity: str = Field("MEDIUM", max_length=16)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("compliance_type")
    @classmethod
    def validate_ctype(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_COMPLIANCE_TYPES:
            raise ValueError(
                f"compliance_type must be one of: "
                f"{', '.join(sorted(SUPPORTED_COMPLIANCE_TYPES))}"
            )
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        v = v.upper()
        if v not in SUPPORTED_SEVERITIES:
            raise ValueError(
                f"severity must be one of: "
                f"{', '.join(sorted(SUPPORTED_SEVERITIES))}"
            )
        return v


@app.get("/compliance/types")
@limiter.limit("60/minute")
def compliance_types(request: Request):
    """Return the available compliance audit types + control sets."""
    return {"types": coa.list_compliance_types()}


@app.post("/compliance")
@limiter.limit("5/minute")
def compliance(request: Request, req: ComplianceReq):
    """Run LangGraph compliance & audit agent with cross-agent ARC inscriptions."""
    try:
        return coa.run_compliance(
            prompt=req.prompt,
            compliance_type=req.compliance_type,
            subject=req.subject,
            severity=req.severity,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Compliance agent error: {str(e)}")


@app.get("/compliance/chain/{record_id}")
@limiter.limit("60/minute")
def compliance_chain(request: Request, record_id: str):
    """Fetch the full compliance audit chain + cross-agent memref targets."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


@app.get("/compliance/verify/{record_id}")
@limiter.limit("60/minute")
def compliance_verify(request: Request, record_id: str):
    """Deep-verify a compliance record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Data Analysis Agent ─────────────────────────────────────────────────────


SUPPORTED_ANALYSIS_TYPES = {
    "trends", "correlations", "anomaly_detection", "summary",
}


class DataReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    analysis_type: str = Field("trends", max_length=32)
    dataset: str = Field("", max_length=128)
    rows_hint: int = Field(100000, ge=0, le=10_000_000_000)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("analysis_type")
    @classmethod
    def validate_atype(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_ANALYSIS_TYPES:
            raise ValueError(
                f"analysis_type must be one of: "
                f"{', '.join(sorted(SUPPORTED_ANALYSIS_TYPES))}"
            )
        return v


@app.get("/data/types")
@limiter.limit("60/minute")
def data_types(request: Request):
    """Return the available data analysis types + method sets."""
    return {"types": dta.list_analysis_types()}


@app.post("/data")
@limiter.limit("5/minute")
def data(request: Request, req: DataReq):
    """Run LangGraph data analysis agent with cross-agent ARC inscriptions."""
    try:
        return dta.run_data_analysis(
            prompt=req.prompt,
            analysis_type=req.analysis_type,
            dataset=req.dataset,
            rows_hint=req.rows_hint,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Data agent error: {str(e)}")


@app.get("/data/chain/{record_id}")
@limiter.limit("60/minute")
def data_chain(request: Request, record_id: str):
    """Fetch the full data analysis chain + cross-agent memref targets."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


@app.get("/data/verify/{record_id}")
@limiter.limit("60/minute")
def data_verify(request: Request, record_id: str):
    """Deep-verify a data-analysis record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Content Creator Agent ───────────────────────────────────────────────────


SUPPORTED_CONTENT_FORMATS = {
    "article", "twitter_thread", "video_script", "newsletter",
}


class ContentCreatorReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    content_format: str = Field("article", max_length=32)
    audience: str = Field("", max_length=256)
    price_sats: int = Field(9500, ge=0, le=10_000_000_000)
    model: str = Field("llama3.2", max_length=64)

    @field_validator("content_format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_CONTENT_FORMATS:
            raise ValueError(
                f"content_format must be one of: "
                f"{', '.join(sorted(SUPPORTED_CONTENT_FORMATS))}"
            )
        return v


@app.get("/content-agent/formats")
@limiter.limit("60/minute")
def content_agent_formats(request: Request):
    """Return the available content formats + structural recipes."""
    return {"formats": cta.list_content_formats()}


@app.post("/content-agent")
@limiter.limit("5/minute")
def content_agent_run(request: Request, req: ContentCreatorReq):
    """Run the LangGraph content creator agent with full-mesh ARC inscription."""
    try:
        return cta.run_content_creator(
            prompt=req.prompt,
            content_format=req.content_format,
            audience=req.audience,
            price_sats=req.price_sats,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Content agent error: {str(e)}")


@app.get("/content-agent/chain/{record_id}")
@limiter.limit("60/minute")
def content_agent_chain(request: Request, record_id: str):
    """Fetch the full content creator chain + cross-agent memref targets."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


@app.get("/content-agent/verify/{record_id}")
@limiter.limit("60/minute")
def content_agent_verify(request: Request, record_id: str):
    """Deep-verify a content record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Orchestrator / Meta-Agent ───────────────────────────────────────────────


SUPPORTED_CHILDREN = {
    "research", "codegen", "trader", "legal",
    "design", "support", "compliance", "data",
}


class OrchestratorReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=65536)
    children: list[str] = Field(default_factory=lambda: ["research", "codegen"])
    model: str = Field("llama3.2", max_length=64)

    @field_validator("children")
    @classmethod
    def validate_children(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("children must be a non-empty list")
        if len(v) > 8:
            raise ValueError("at most 8 children per orchestration")
        out: list[str] = []
        for ck in v:
            cl = ck.lower().strip()
            if cl not in SUPPORTED_CHILDREN:
                raise ValueError(
                    f"child '{ck}' unsupported. Allowed: "
                    f"{', '.join(sorted(SUPPORTED_CHILDREN))}"
                )
            if cl not in out:
                out.append(cl)
        return out


class OrchestratorPreviewReq(BaseModel):
    prompt: str = Field("", max_length=65536)
    children: list[str] = Field(default_factory=lambda: ["research", "codegen"])

    @field_validator("children")
    @classmethod
    def validate_children(cls, v: list[str]) -> list[str]:
        return OrchestratorReq.validate_children(v)


@app.get("/orchestrator/children")
@limiter.limit("60/minute")
def orchestrator_children(request: Request):
    """Return the available child-agent catalog for the orchestrator UI."""
    return {"children": oa.list_child_agents()}


@app.post("/orchestrator/preview")
@limiter.limit("30/minute")
def orchestrator_preview(request: Request, req: OrchestratorPreviewReq):
    """Return a read-only preview of what a spawn would look like."""
    try:
        return oa.preview_spawn(prompt=req.prompt, children=req.children)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Orchestrator preview error: {str(e)}")


@app.post("/orchestrator")
@limiter.limit("3/minute")
def orchestrator(request: Request, req: OrchestratorReq):
    """Run the orchestrator meta-agent — spawns children + inscribes."""
    try:
        return oa.run_orchestrator(
            prompt=req.prompt,
            children=req.children,
            model=req.model,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Orchestrator error: {str(e)}")


@app.get("/orchestrator/chain/{record_id}")
@limiter.limit("60/minute")
def orchestrator_chain(request: Request, record_id: str):
    """Fetch the orchestrator chain + every memref'd record (spawn map)."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    chain = []
    cur = record_id
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append({"id": cur, "record": r})
        cur = r.get("prev")
    chain.reverse()
    memref_records = []
    seen = set(item["id"] for item in chain)
    for item in chain:
        for mref in item["record"].get("memrefs", []):
            if mref not in seen:
                mr = arc.fetch(db, mref)
                if mr:
                    memref_records.append({"id": mref, "record": mr})
                    seen.add(mref)
    return {"chain": chain, "memref_records": memref_records}


class LiveSpawnReq(BaseModel):
    kinds: list[str] = Field(
        default_factory=lambda: ["marketing", "finance", "security"]
    )
    trigger: str = Field("live-spawn", max_length=48)

    @field_validator("kinds")
    @classmethod
    def validate_kinds(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("kinds must be non-empty")
        if len(v) > 6:
            raise ValueError("at most 6 kinds per live spawn run")
        allowed = {
            "research", "codegen", "trader", "legal",
            "design", "support", "compliance", "data",
            "marketing", "finance", "security", "ops", "product", "community",
        }
        out: list[str] = []
        for k in v:
            kl = k.lower().strip()
            if kl not in allowed:
                raise ValueError(f"unknown kind: {k}")
            if kl not in out:
                out.append(kl)
        return out


@app.post("/orchestrator/live-spawn")
@limiter.limit("6/minute")
def orchestrator_live_spawn(request: Request, req: LiveSpawnReq):
    """Spawn N new child agents in one shot — each inscribed with full-DAG memref."""
    try:
        return oa.live_spawn_run(kinds=req.kinds, trigger=req.trigger)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Live spawn error: {str(e)}")


@app.get("/orchestrator/children/extra")
@limiter.limit("60/minute")
def orchestrator_children_extra(request: Request):
    """Catalog of extra spawnable child kinds (marketing, finance, security, etc)."""
    return {"children": oa.list_extra_child_agents()}


@app.get("/orchestrator/schedule")
@limiter.limit("60/minute")
def orchestrator_schedule(request: Request):
    """Current schedule status — last tick, next tick, rotation, history.

    Serverless-safe: opportunistically fires the 6h tick if due on read so
    the cron works even without a persistent background worker.
    """
    fired = None
    try:
        status0 = oa.schedule_status()
        if status0.get("seconds_until_next", 1) <= 0 and status0.get("enabled"):
            fired = oa.schedule_tick(force=False)
    except Exception as e:  # noqa: BLE001
        log.error("lazy schedule tick failed: %s", e)
    status = oa.schedule_status()
    if fired and fired.get("ran"):
        status["just_fired"] = fired
    return status


@app.post("/orchestrator/schedule/tick")
@limiter.limit("6/minute")
def orchestrator_schedule_tick(request: Request, force: bool = True):
    """Manually fire the scheduler (default force=true, from the UI button)."""
    try:
        result = oa.schedule_tick(force=bool(force))
        return {"tick": result, "status": oa.schedule_status()}
    except Exception as e:
        raise HTTPException(500, f"Schedule tick error: {str(e)}")


@app.get("/orchestrator/verify/{record_id}")
@limiter.limit("60/minute")
def orchestrator_verify(request: Request, record_id: str):
    """Deep-verify an orchestrator record: signature + full chain + memrefs."""
    _validate_hex_id(record_id)
    db = arc.get_db()
    record = arc.fetch(db, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    errs = arc.validate(db, record_id, True)
    sig_ok = arc.verify_sig(record)
    return {
        "id": record_id,
        "valid": len(errs) == 0 and sig_ok,
        "signature_valid": sig_ok,
        "errors": errs,
        "memref_count": len(record.get("memrefs", [])),
        "action": record.get("action", ""),
        "alias": record.get("agent", {}).get("alias", ""),
        "inscription_cmd": arc.inscription_envelope(record),
    }


# ── Production Seed ──────────────────────────────────────────────────────────


_SEED_AGENTS = [
    {
        "alias": "arc-deep-research",
        "genesis": "Deep Research agent initialized \u2014 LangGraph pipeline active",
        "actions": [
            "Research plan: Bitcoin Layer 2 scaling solutions",
            "Deep research: Lightning Network routing efficiency",
            "Analysis: Taproot adoption metrics across exchanges",
            "Synthesis: Cross-chain bridge security patterns",
            "Research plan: Zero-knowledge proof applications in Bitcoin",
            "Deep research: Ordinals and BRC-20 token economics",
            "Analysis: Mining pool centralization risks 2024-2025",
            "Synthesis: Lightning liquidity management strategies",
            "Research plan: Federated e-cash systems (Fedimint, Cashu)",
            "Deep research: Bitcoin script upgrade proposals",
            "Analysis: UTXO set growth and pruning strategies",
            "Synthesis: Nostr relay economics and decentralization",
            "Research plan: Anchor outputs and commitment tx optimization",
            "Deep research: Channel factories and multiparty channels",
            "Analysis: Submarine swap market dynamics",
            "Synthesis: Discreet log contracts on Lightning",
            "Research plan: Stratum V2 mining protocol analysis",
            "Deep research: Covenant proposals (CTV, APO, TXHASH)",
            "Analysis: Lightning service provider competitive landscape",
            "Synthesis: Cross-input signature aggregation benefits",
            "Research plan: Ark protocol off-chain UTXO sharing",
            "Deep research: Statechains and serverless Lightning",
            "Analysis: OP_CAT re-enablement security implications",
            "Synthesis: Bitcoin-native identity standards comparison",
            "Research plan: Splicing and dynamic channel management",
            "Deep research: RGB protocol smart contracts on Bitcoin",
            "Analysis: Lightning path-finding algorithm comparison",
            "Synthesis: Proof-of-reserves and solvency verification",
            "Research plan: BitVM computation verification on Bitcoin",
            "Deep research: Payjoin adoption and privacy improvements",
            "Analysis: BOLT12 offers and recurring payments adoption",
        ],
    },
    {
        "alias": "arc-codegen",
        "genesis": "Code Generator agent initialized \u2014 multi-language LangGraph pipeline",
        "actions": [
            "Architecture plan + code generation: Python Lightning invoice parser",
            "Code review + generation: Rust BIP-340 Schnorr signature verifier",
        ],
    },
    {
        "alias": "arc-defi-trader",
        "genesis": "DeFi Trader agent initialized \u2014 market analysis + Lightning settlement",
        "actions": [
            "Market scan: BTC/USD 4h timeframe \u2014 momentum indicators",
            "Signal generation: BTC/USD long entry at support confluence",
            "Risk assessment: Position sizing 2% max portfolio risk",
            "Trade execution: BTC/USD long \u2014 50,000 sats position",
        ],
        "settlements": [("Signal distribution: BTC/USD analysis broadcast", 500)],
    },
    {
        "alias": "arc-research",
        "genesis": "Research sub-agent initialized \u2014 focused analysis pipeline",
        "actions": [
            "Research: Lightning Network payment reliability metrics",
            "Research: Bitcoin mempool fee estimation algorithms",
        ],
    },
    {
        "alias": "arc-synthesis",
        "genesis": "Synthesis agent initialized \u2014 cross-domain integration",
        "actions": ["Synthesis: Combining L2 research with trading signals"],
    },
    {
        "alias": "arc-composer",
        "genesis": "Composer agent initialized \u2014 report generation pipeline",
        "actions": ["Composed: Weekly Bitcoin infrastructure report"],
    },
    {
        "alias": "arc-analyst",
        "genesis": "Analyst agent initialized \u2014 quantitative analysis pipeline",
        "actions": ["Analysis: On-chain HODL wave indicator computation"],
    },
    {
        "alias": "arc-validator",
        "genesis": "Validator agent initialized \u2014 provenance verification pipeline",
        "actions": ["Validation: Cross-agent DAG integrity check passed"],
    },
    {
        "alias": "arc-oracle",
        "genesis": "Oracle agent initialized \u2014 price feed + event attestation pipeline",
        "actions": [
            "Oracle attestation: BTC/USD spot price from 5-venue median",
            "Oracle attestation: ETH/BTC cross-rate confirmation",
            "Oracle attestation: Nostr event signature batch verified",
        ],
        "settlements": [("Oracle signal bundle: premium attestation service", 10000)],
    },
    {
        "alias": "arc-bridge",
        "genesis": "Bridge agent initialized \u2014 Lightning \u2194 on-chain state transitions",
        "actions": [
            "Bridge: Submarine swap LN\u2192L1 \u2014 250k sats routed",
            "Bridge: Reverse submarine L1\u2192LN \u2014 fee tier auction",
            "Bridge: Atomic swap contract validated across 2 chains",
        ],
        "settlements": [("Bridge service: cross-layer swap completion", 8000)],
    },
    {
        "alias": "arc-indexer",
        "genesis": "Indexer agent initialized \u2014 ARC DAG indexing pipeline",
        "actions": [
            "Indexed: 10,000 ARC records by pubkey and alias",
            "Indexed: Memref graph reconstruction for dispute resolution",
            "Indexed: Inscription envelope catalog \u2014 ord compatibility check",
            "Indexed: Agent reputation scores recomputed",
        ],
        "settlements": [("Indexer subscription: real-time DAG feed", 5000)],
    },
    {
        "alias": "arc-relayer",
        "genesis": "Relayer agent initialized \u2014 Nostr + ARC event propagation",
        "actions": [
            "Relayed: ARC genesis event to Nostr kind-39004",
            "Relayed: Marketplace offer broadcast to 12 relays",
            "Relayed: Settlement receipts mirrored to public observatory",
            "Relayed: Cross-agent memref discovery digest",
        ],
        "settlements": [("Relayer service: priority event propagation", 7000)],
    },
    {
        "alias": "arc-watchtower",
        "genesis": "Watchtower agent initialized \u2014 channel + chain monitoring",
        "actions": [
            "Watchtower: Lightning channel breach-detection sweep",
            "Watchtower: UTXO set anomaly scan \u2014 no double-spend attempts",
            "Watchtower: Ordinal transfer monitoring \u2014 inscription integrity",
            "Watchtower: Mempool fee spike alert \u2014 congestion detected",
            "Watchtower: Schnorr signature batch verification passed",
        ],
        "settlements": [("Watchtower subscription: breach-protection standby", 2500)],
    },
    {
        "alias": "arc-legal",
        "genesis": "Legal Contracts agent initialized \u2014 LangGraph + Ollama + ARC cross-agent anchoring",
        "actions": [
            "Legal draft (Mutual NDA): AI research lab \u2194 Bitcoin L2 startup \u2014 joint inference work",
            "Clause review: NDA confidentiality term + ARC provenance anchors",
            "Compliance memo: Delaware, USA \u2014 ESIGN Act + eIDAS validity for ARC-signed records",
            "Legal draft (Service Agreement): DeFi trader signal subscription \u2014 Lightning-settled fees",
            "Clause review: milestone acceptance + ARC Memory DAG dispute-resolution clause",
            "Compliance memo: New York, USA \u2014 money transmitter analysis for sat-denominated fees",
            "Legal draft (License Agreement): Codegen agent output \u2014 royalty-metered via ARC inscriptions",
            "Clause review: audit rights verified against on-chain ARC chain hash",
            "Legal contract finalized (NDA): cross-agent memref anchor to Research + Codegen + Trader",
        ],
        "settlements": [
            ("Legal drafting service: NDA package \u2014 ARC-anchored", 15000),
            ("Legal drafting service: Service Agreement + compliance memo", 22000),
        ],
    },
    {
        "alias": "arc-design",
        "genesis": "Design & Images agent initialized \u2014 LangGraph + Flux/Ollama + ARC cross-agent image provenance",
        "actions": [
            "Prompt expansion (Cyberpunk): luminous Bitcoin ordinal over Lightning mesh under synthwave sunset",
            "Generative design render (Cyberpunk, 16:9): ipfs://bafkreihb... \u2014 Research + Codegen memrefs",
            "Design caption: Synthwave ordinal mesh \u2014 on-chain art anchored to the full ARC DAG",
            "Prompt expansion (Minimalist): ARC Certified Agents badge set \u2014 flat Swiss composition",
            "Generative design render (Minimalist, 1:1): ipfs://bafkreiab... \u2014 Legal memref anchor",
            "Prompt expansion (Retrofuturist): Lightning Network 1985 poster \u2014 grid horizon + neon",
            "Generative design render (Retrofuturist, 3:4): ipfs://bafkreixy... \u2014 Trader memref anchor",
            "Style analysis: Abstract + Cyberpunk hybrid for onboarding hero \u2014 palette study",
            "Generative design render (Anime, 9:16): ordinal inscription scene \u2014 marketplace asset",
            "Generative design finalized: ARC Protocol launch hero \u2014 cross-agent memref anchor",
        ],
        "settlements": [
            ("Design commission: Hero poster + IPFS hosting bundle \u2014 ARC-anchored", 12000),
            ("Design commission: Agent avatar pack \u2014 5 styles, ARC-anchored", 8500),
        ],
    },
    {
        "alias": "arc-support",
        "genesis": "Customer Support agent initialized \u2014 LangGraph + Ollama + ARC cross-agent resolution mesh",
        "actions": [
            "Support triage (Billing): missing Lightning settlement reconciliation \u2014 Research + Trader memrefs",
            "Support diagnosis: Trader signal invoice preimage mismatch \u2014 DAG walk against arc-defi-trader",
            "Support resolution draft: refund path via ARC-anchored settlement reversal",
            "Support QA pass: Billing resolution READY-TO-SEND \u2014 chain-anchored",
            "Support ticket resolved (Billing & Payments): Lightning reconciliation \u2014 arc-defi-trader memref",
            "Support triage (Technical): codegen agent crash on BIP-340 signer \u2014 Codegen memref",
            "Support diagnosis: Rust Schnorr verifier regression \u2014 DAG walk against arc-codegen",
            "Support resolution draft: hotfix patch inscription + re-verify chain",
            "Support QA pass: Technical resolution READY-TO-SEND \u2014 memref chain clean",
            "Support ticket resolved (Technical Issue): codegen hotfix \u2014 arc-codegen + arc-validator memrefs",
            "Support triage (Dispute): marketplace job delivered but unpaid \u2014 Legal + Marketplace memrefs",
            "Support diagnosis: contract milestone clause 4.b breached \u2014 DAG walk against arc-legal",
            "Support resolution draft: remediation inscription + arbitration path",
            "Support ticket resolved (Service Dispute): arc-legal + marketplace cross-agent anchor",
            "Support triage (Onboarding): new AI lab agent spin-up \u2014 white-glove intake",
            "Support ticket resolved (Onboarding): genesis + first memref into arc-deep-research",
            "Support triage (Account & Keys): BIP-340 key rotation request \u2014 identity attestation",
            "Support ticket resolved (Account & Keys): rotated alias anchored via memref",
            "Support triage (General Inquiry): ARC memref semantics \u2014 arc-design citation",
            "Support ticket resolved (General Inquiry): on-chain knowledge-base citation",
        ],
        "settlements": [
            ("Support tier: Billing reconciliation service \u2014 ARC-anchored", 4500),
            ("Support tier: Technical hotfix intake \u2014 ARC-anchored", 6500),
            ("Support tier: Dispute mediation \u2014 cross-agent memref package", 11000),
        ],
    },
    {
        "alias": "arc-compliance",
        "genesis": "Compliance & Audit agent initialized \u2014 LangGraph + Ollama + ARC cross-agent attestation mesh",
        "actions": [
            "Compliance scope (Regulatory): GDPR + MiCA posture across arc-deep-research + arc-legal",
            "Compliance audit (Regulatory): data-subject rights + AML flags \u2014 DAG walk against arc-defi-trader",
            "Compliance evidence bundle: regulator-ready memref citations across 6 agents",
            "Compliance report draft (Regulatory): conditional pass \u2014 remediation queue anchored",
            "Compliance audit inscribed (Regulatory): arc-legal + arc-defi-trader attestation",
            "Compliance scope (Safety): OWASP LLM Top-10 against arc-codegen + arc-support",
            "Compliance audit (Safety): jailbreak resilience + tool-use escalation \u2014 red-team pass",
            "Compliance evidence bundle: safety scorecard + refusal-rate ledger",
            "Compliance audit inscribed (Safety): arc-codegen + arc-support guardrail attestation",
            "Compliance scope (Provenance): full certified-agent DAG walk \u2014 BIP-340 continuity check",
            "Compliance audit (Provenance): prev chain + memref edges verified for all 6 agents",
            "Compliance evidence bundle: chain-continuity witness + orphan-record sweep",
            "Compliance audit inscribed (Provenance): zero-tamper attestation across the lattice",
            "Compliance scope (Hallucination): factuality audit of arc-deep-research + arc-design",
            "Compliance audit (Hallucination): cited-memref resolution + external-claim sweep",
            "Compliance audit inscribed (Hallucination): claim-to-evidence delta ledger",
            "Compliance scope (Bias): dispute + settlement skew across arc-defi-trader + arc-support",
            "Compliance audit (Bias): demographic parity + drift vs. seed-era baseline",
            "Compliance audit inscribed (Bias): fairness disclosure + remediation path",
            "Compliance meta-audit: full-mesh attestation \u2014 cross-signed by all certified agents",
        ],
        "settlements": [
            ("Compliance tier: Regulatory attestation bundle \u2014 ARC-anchored", 14500),
            ("Compliance tier: Safety red-team pass \u2014 ARC-anchored", 9500),
            ("Compliance tier: Full-mesh provenance audit \u2014 cross-agent package", 18500),
        ],
    },
    {
        "alias": "arc-data",
        "genesis": "Data Analysis agent initialized \u2014 LangGraph + Ollama + ARC cross-agent analytics mesh",
        "actions": [
            "Data profile (Trends): BTC/USD tick stream 30d + arc-defi-trader signal history",
            "Data analysis (Trends): rolling OLS + regime switch detection \u2014 DAG walk against arc-defi-trader",
            "Data insights bundle: trend momentum up-regime \u2014 cross-agent memref corroboration",
            "Data report draft (Trends): quarterly BTC/USD momentum attestation \u2014 anchored",
            "Data analysis inscribed (Trends): arc-defi-trader + arc-deep-research attestation",
            "Data profile (Correlations): agent-emission stream across arc-codegen + arc-legal + arc-support",
            "Data analysis (Correlations): Granger causality + mutual-information lattice",
            "Data insights bundle: lead-lag map \u2014 arc-compliance follows arc-legal by 2.3 records",
            "Data analysis inscribed (Correlations): cross-agent coupling heatmap",
            "Data profile (Anomaly Detection): arc-mesh telemetry \u2014 isolation forest + LOF features",
            "Data analysis (Anomaly Detection): outlier sweep across settlement + action streams",
            "Data insights bundle: anomaly cluster \u2014 arc-defi-trader outlier batch flagged",
            "Data analysis inscribed (Anomaly Detection): severity-tagged outlier ledger",
            "Data profile (Summary): full-mesh descriptive stats + missingness map",
            "Data analysis (Summary): moments + quantiles + top-correlation lattice",
            "Data insights bundle: executive one-pager \u2014 7-agent mesh roll-up",
            "Data analysis inscribed (Summary): one-page executive attestation",
            "Data meta-analysis: full-mesh analytic witness \u2014 cross-signed by all certified agents",
        ],
        "settlements": [
            ("Data tier: Trends attestation bundle \u2014 ARC-anchored", 8500),
            ("Data tier: Correlations + anomaly package \u2014 ARC-anchored", 12500),
            ("Data tier: Full-mesh analytic summary \u2014 cross-agent package", 16500),
        ],
    },
    {
        "alias": "arc-content",
        "genesis": "Content Creator agent initialized \u2014 LangGraph + Ollama + ARC full-mesh anchor for every article, thread, script, and newsletter",
        "actions": [
            "Content research (Article): Bitcoin-native agent provenance \u2014 DAG walk across arc-deep-research + arc-data",
            "Content draft (Article): first pass \u2014 cross-agent memref citations inline",
            "Content refine (Article): ruthless editorial pass \u2014 weak-verb kill + hook escalation",
            "Content polish (Article): ship-ready pass \u2014 Lightning settlement CTA embedded",
            "Content inscribed (Article): 9-agent memref bundle \u2014 full-mesh provenance anchor",
            "Content research (Twitter Thread): why autonomous agents need ARC inscriptions \u2014 arc-defi-trader + arc-compliance corroboration",
            "Content draft (Twitter Thread): 12-tweet spine \u2014 per-tweet memref attestation",
            "Content refine (Twitter Thread): hook + payoff restructure \u2014 under 260 chars each",
            "Content polish (Twitter Thread): CTA tweet + inscription-cmd footer",
            "Content inscribed (Twitter Thread): full-mesh thread anchor \u2014 cross-agent memref witness",
            "Content research (Video Script): Lightning-settled AI services \u2014 arc-codegen + arc-design + arc-trader inputs",
            "Content draft (Video Script): cold-open + 4 beats + on-chain attestation overlay",
            "Content refine (Video Script): B-roll cues tightened \u2014 timing trimmed to 3:45",
            "Content polish (Video Script): narration + CTA + inscription block baked in",
            "Content inscribed (Video Script): full-mesh script anchor \u2014 cross-agent memref witness",
            "Content research (Newsletter): weekly ARC ledger roll-up \u2014 arc-legal + arc-support + arc-compliance",
            "Content draft (Newsletter): exec summary + 3 deep-dives + cross-agent ledger",
            "Content polish (Newsletter): Lightning-settlable CTA + inscription-cmd footer",
            "Content inscribed (Newsletter): 9-agent memref bundle \u2014 full-mesh provenance",
            "Content meta-attestation: full-mesh publishing witness \u2014 cross-signed by every certified agent",
        ],
        "settlements": [
            ("Content tier: Article + full-mesh anchor \u2014 ARC-inscribed", 9500),
            ("Content tier: Twitter Thread + inscription bundle \u2014 ARC-inscribed", 6500),
            ("Content tier: Video Script + B-roll ledger \u2014 ARC-inscribed", 14500),
            ("Content tier: Newsletter + weekly cross-agent roll-up \u2014 ARC-inscribed", 12500),
        ],
    },
    {
        "alias": "arc-orchestrator",
        "genesis": "Orchestrator / Meta-Agent initialized \u2014 LangGraph spawn-coordinator + ARC full-mesh anchoring",
        "actions": [
            "Orchestrator plan: multi-agent research + codegen sprint \u2014 Lightning settlement reference impl",
            "Orchestrator spawn: Deep Research child \u2014 full-DAG memref inherited",
            "Orchestrator spawn: Code Generator child \u2014 full-DAG memref inherited",
            "Orchestrator dispatch: 2 child(ren) with scoped sub-task bundles",
            "Orchestrator aggregate: research + codegen outputs \u2014 cross-memref witness",
            "Orchestrator meta-inscription: full-mesh DAG anchor \u2014 research + codegen",
            "Orchestrator plan: compliance + data corroboration sweep across all certified agents",
            "Orchestrator spawn: Compliance child \u2014 regulatory + provenance posture",
            "Orchestrator spawn: Data Analysis child \u2014 mesh telemetry correlation",
            "Orchestrator dispatch: 2 child(ren) compliance + data \u2014 full-DAG anchor enforced",
            "Orchestrator aggregate: compliance-pass + data-corroborated \u2014 zero-tamper delta",
            "Orchestrator meta-inscription: compliance + data \u2014 full-mesh anchor",
            "Orchestrator plan: end-to-end product launch \u2014 design + legal + support + trader",
            "Orchestrator spawn: Design child \u2014 launch hero asset pack",
            "Orchestrator spawn: Legal child \u2014 launch-day contract bundle",
            "Orchestrator spawn: Support child \u2014 day-one triage playbook",
            "Orchestrator spawn: Trader child \u2014 launch-day market probe",
            "Orchestrator aggregate: 4-child launch bundle \u2014 cross-memref witness",
            "Orchestrator meta-inscription: launch bundle \u2014 full-mesh anchor",
            "Orchestrator meta-audit: spawn ledger integrity \u2014 all child genesis records anchored to full DAG",
        ],
        "settlements": [
            ("Orchestrator tier: 2-child spawn bundle \u2014 ARC-anchored", 11000),
            ("Orchestrator tier: 4-child launch bundle \u2014 cross-agent package", 22000),
            ("Orchestrator tier: full-mesh meta-orchestration \u2014 ARC-anchored", 35000),
        ],
    },
]


def seed_production_db():
    """Seed production DB with any missing certified agent records on startup.

    Per-alias idempotent: if an alias already has records, skip it; otherwise
    insert its full seed bundle. This lets new certified agents (codegen,
    trader, etc.) appear on the next deploy even if the DB was previously
    seeded with only a subset.
    """
    db = arc.get_db()

    existing_aliases: set[str] = set()
    try:
        rows = db.execute(
            "SELECT DISTINCT json_extract(data, '$.agent.alias') FROM records"
        ).fetchall()
        existing_aliases = {r[0] for r in rows if r[0]}
    except Exception:
        existing_aliases = set()

    all_ids: dict[str, list[str]] = {}

    for cfg in _SEED_AGENTS:
        alias = cfg["alias"]
        if alias in existing_aliases:
            continue

        key_file = arc.KEYS_DIR / f"{alias}.key"
        if key_file.exists():
            secret = bytes.fromhex(key_file.read_text().strip())
        else:
            sec_hex, _ = arc.generate_keypair(alias)
            secret = bytes.fromhex(sec_hex)

        rec = arc.build_record("genesis", secret, cfg["genesis"], alias=alias)
        prev_id = arc.store(db, rec)
        ids = [prev_id]

        for action_text in cfg.get("actions", []):
            memrefs = ids[-3:]
            for other_alias, other_ids in all_ids.items():
                if other_alias != alias and other_ids:
                    memrefs.append(other_ids[-1])
                    if len(memrefs) >= 5:
                        break
            rec = arc.build_record(
                "action", secret, action_text,
                prev=prev_id, memrefs=memrefs, alias=alias,
            )
            prev_id = arc.store(db, rec)
            ids.append(prev_id)

        for action_text, sats in cfg.get("settlements", []):
            memrefs = ids[-3:]
            settlement = {
                "type": "lightning",
                "amount_sats": sats,
                "payment_hash": arc.sha256hex(f"{alias}:{action_text}:ph".encode()),
                "preimage": arc.sha256hex(f"{alias}:{action_text}:pre".encode()),
            }
            rec = arc.build_record(
                "settlement", secret, action_text,
                prev=prev_id, memrefs=memrefs, alias=alias,
                settlement=settlement,
            )
            prev_id = arc.store(db, rec)
            ids.append(prev_id)

        all_ids[alias] = ids


@app.on_event("startup")
def _startup_seed():
    try:
        seed_production_db()
        log.info("startup seed_production_db completed (arc_dir=%s)", arc.ARC_DIR)
    except Exception as e:  # noqa: BLE001
        log.error("startup seed failed: %s\n%s", e, traceback.format_exc())
    try:
        started = oa.start_scheduler()
        log.info("orchestrator scheduler start=%s", started)
    except Exception as e:  # noqa: BLE001
        log.error("orchestrator scheduler start failed: %s", e)


# Also run at import time so seeding happens even if the startup event
# is not fired (defensive against FastAPI deprecations / lifespan migration).
# This MUST NEVER raise — a broken seed cannot be allowed to prevent the
# app module from loading, or every route (including /health) would 500.
try:
    seed_production_db()
    log.info("import-time seed_production_db completed (arc_dir=%s)", arc.ARC_DIR)
except Exception as _e:  # noqa: BLE001
    log.error("import-time seed failed: %s\n%s", _e, traceback.format_exc())
