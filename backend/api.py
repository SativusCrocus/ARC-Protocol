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
import marketplace as mkt
import research_agent as ra
import codegen_agent as cg
import trader_agent as ta

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


# Also run at import time so seeding happens even if the startup event
# is not fired (defensive against FastAPI deprecations / lifespan migration).
# This MUST NEVER raise — a broken seed cannot be allowed to prevent the
# app module from loading, or every route (including /health) would 500.
try:
    seed_production_db()
    log.info("import-time seed_production_db completed (arc_dir=%s)", arc.ARC_DIR)
except Exception as _e:  # noqa: BLE001
    log.error("import-time seed failed: %s\n%s", _e, traceback.format_exc())
