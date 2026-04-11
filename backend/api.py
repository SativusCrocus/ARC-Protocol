"""ARC Protocol – REST API (FastAPI)"""

import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import arc

app = FastAPI(title="ARC Protocol", version=arc.ARC_VERSION, description="Agent Record Convention API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Models ──────────────────────────────────────────────────────────


class KeygenReq(BaseModel):
    alias: Optional[str] = None


class GenesisReq(BaseModel):
    alias: Optional[str] = None
    action: str
    input_data: str = "genesis"


class ActionReq(BaseModel):
    prev: str
    action: str
    memrefs: list[str] = []
    prompt: Optional[str] = None


class SettleReq(BaseModel):
    record_id: str
    amount: int


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "arc_version": arc.ARC_VERSION}


@app.post("/keygen")
def keygen(req: KeygenReq):
    secret, pub = arc.generate_keypair(req.alias)
    return {"pubkey": pub, "alias": req.alias or pub[:16], "secret": secret}


@app.get("/keys")
def keys():
    return arc.list_keys()


@app.post("/genesis")
def genesis(req: GenesisReq):
    try:
        key = arc.load_key()
    except Exception:
        # Auto-generate a key if none exist
        arc.generate_keypair("default")
        key = arc.load_key()
    rec = arc.build_record(
        "genesis", key, req.action,
        alias=req.alias,
        ihash=arc.sha256hex(req.input_data.encode()),
    )
    db = arc.get_db()
    rid = arc.store(db, rec)
    return {"id": rid, "record": rec}


@app.post("/action")
def action(req: ActionReq):
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
        "action", key, req.action,
        prev=req.prev, memrefs=req.memrefs,
        ihash=ihash, ohash=ohash,
    )
    rid = arc.store(db, rec)
    return {"id": rid, "record": rec}


@app.get("/validate/{record_id}")
def validate(record_id: str, deep: bool = True):
    errs = arc.validate(arc.get_db(), record_id, deep)
    return {"valid": len(errs) == 0, "errors": errs, "id": record_id}


@app.post("/settle")
def settle(req: SettleReq):
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
        "settlement", key, f"Settlement: {req.amount} sats",
        prev=req.record_id, settlement=settlement,
        ihash=arc.sha256hex(f"settle:{req.record_id}:{req.amount}".encode()),
        ohash=arc.sha256hex(f"paid:{phash}".encode()),
    )
    rid = arc.store(db, rec)
    return {"id": rid, "record": rec, "payment_hash": phash, "preimage": preimage.hex()}


@app.get("/record/{record_id}")
def get_record(record_id: str):
    record = arc.fetch(arc.get_db(), record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    return {"id": record_id, "record": record}


@app.get("/chain/{identifier}")
def get_chain(identifier: str):
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
def list_records():
    return [{"id": rid, "record": r} for rid, r in arc.all_records(arc.get_db())]


@app.get("/inscription/{record_id}")
def inscription(record_id: str):
    record = arc.fetch(arc.get_db(), record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    return {"command": arc.inscription_envelope(record), "record": record}
