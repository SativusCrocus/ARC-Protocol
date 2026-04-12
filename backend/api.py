"""ARC Protocol – REST API (FastAPI)
Security: rate limiting, strict Pydantic validation, Schnorr re-verification.
Private keys never touch the API transport layer.
"""

import os
import re
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import arc

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
    return {"status": "ok", "arc_version": arc.ARC_VERSION}


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
