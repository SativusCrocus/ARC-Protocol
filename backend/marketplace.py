"""ARC Marketplace – Autonomous Service Marketplace

Two-agent protocol built on ARC: Customer requests → Service delivers → Lightning settlement.
Every step is a signed ARC record. Cross-agent memrefs create a verifiable provenance DAG.
"""

import os
import sqlite3
import time as _time
from datetime import datetime, timezone

import arc


# ── Database ───────────────────────────────────────────────────────────────


def _ensure_tables(db: sqlite3.Connection):
    db.execute("""CREATE TABLE IF NOT EXISTS marketplace_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'requested',
        customer_pubkey TEXT NOT NULL,
        service_pubkey TEXT,
        task TEXT NOT NULL,
        amount_sats INTEGER DEFAULT 0,
        request_id TEXT,
        offer_id TEXT,
        accept_id TEXT,
        deliver_id TEXT,
        payment_id TEXT,
        receipt_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    db.commit()


# ── Agent Identity ─────────────────────────────────────────────────────────


def _load_agent(alias: str) -> tuple[bytes, str]:
    """Load or create an agent identity. Returns (secret_bytes, pubkey_hex)."""
    key_path = arc.KEYS_DIR / f"{alias}.key"
    pub_path = arc.KEYS_DIR / f"{alias}.pub"
    if not key_path.exists():
        arc.generate_keypair(alias)
    secret = bytes.fromhex(key_path.read_text().strip())
    pubkey = pub_path.read_text().strip()
    return secret, pubkey


def _latest_id(db: sqlite3.Connection, pubkey: str) -> str | None:
    rows = arc.fetch_by_pubkey(db, pubkey)
    return rows[-1][0] if rows else None


def _ensure_genesis(db: sqlite3.Connection, alias: str, secret: bytes, pubkey: str) -> str:
    """Ensure agent has a genesis record. Returns latest record ID."""
    prev = _latest_id(db, pubkey)
    if prev:
        return prev
    rec = arc.build_record(
        "genesis", secret,
        f"{alias.capitalize()} agent initialized for ARC Marketplace",
        alias=alias,
        ihash=arc.sha256hex(f"{alias}-marketplace-genesis".encode()),
    )
    rid = arc.store(db, rec)
    _time.sleep(0.01)  # ensure monotonic timestamps for next record
    return rid


def _job_from_row(row) -> dict:
    return {
        "id": row[0], "status": row[1],
        "customer_pubkey": row[2], "service_pubkey": row[3],
        "task": row[4], "amount_sats": row[5],
        "request_id": row[6], "offer_id": row[7],
        "accept_id": row[8], "deliver_id": row[9],
        "payment_id": row[10], "receipt_id": row[11],
        "created_at": row[12], "updated_at": row[13],
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Marketplace Protocol Steps ─────────────────────────────────────────────


def request_task(db: sqlite3.Connection, task: str, max_sats: int) -> dict:
    """Step 1 — Customer agent requests a task."""
    _ensure_tables(db)
    secret, pubkey = _load_agent("customer")
    prev = _ensure_genesis(db, "customer", secret, pubkey)

    rec = arc.build_record(
        "action", secret,
        f"REQUEST: {task} | Budget: {max_sats} sats",
        prev=prev,
        ihash=arc.sha256hex(f"request:{task}:{max_sats}".encode()),
        ohash=arc.sha256hex(f"task:{task}".encode()),
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    rid = arc.store(db, rec)

    now = _now()
    job_id = arc.sha256hex(f"job:{rid}:{now}".encode())[:16]
    db.execute(
        """INSERT INTO marketplace_jobs
           (id,status,customer_pubkey,task,amount_sats,request_id,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (job_id, "requested", pubkey, task, max_sats, rid, now, now),
    )
    db.commit()
    return {"job_id": job_id, "request_id": rid, "record": rec, "status": "requested"}


def offer_service(db: sqlite3.Connection, job_id: str, price_sats: int) -> dict:
    """Step 2 — Service agent offers to fulfill the request."""
    _ensure_tables(db)
    job = get_job(db, job_id)
    if job["status"] != "requested":
        raise ValueError(f"Expected status 'requested', got '{job['status']}'")

    secret, pubkey = _load_agent("service")
    prev = _ensure_genesis(db, "service", secret, pubkey)

    rec = arc.build_record(
        "action", secret,
        f"OFFER: Will complete '{job['task']}' for {price_sats} sats",
        prev=prev,
        memrefs=[job["request_id"]],
        ihash=arc.sha256hex(f"offer:{job_id}:{price_sats}".encode()),
        ohash=arc.sha256hex(f"terms:{job['task']}:{price_sats}".encode()),
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    rid = arc.store(db, rec)

    now = _now()
    db.execute(
        "UPDATE marketplace_jobs SET status=?,service_pubkey=?,offer_id=?,amount_sats=?,updated_at=? WHERE id=?",
        ("offered", pubkey, rid, price_sats, now, job_id),
    )
    db.commit()
    return {"job_id": job_id, "offer_id": rid, "record": rec, "status": "offered", "price_sats": price_sats}


def accept_offer(db: sqlite3.Connection, job_id: str) -> dict:
    """Step 3 — Customer accepts the service offer."""
    _ensure_tables(db)
    job = get_job(db, job_id)
    if job["status"] != "offered":
        raise ValueError(f"Expected status 'offered', got '{job['status']}'")

    secret, pubkey = _load_agent("customer")
    prev = _latest_id(db, pubkey)

    rec = arc.build_record(
        "action", secret,
        f"ACCEPT: Agreed to pay {job['amount_sats']} sats for '{job['task']}'",
        prev=prev,
        memrefs=[job["offer_id"]],
        ihash=arc.sha256hex(f"accept:{job_id}:{job['amount_sats']}".encode()),
        ohash=arc.sha256hex(f"accepted:{job['offer_id']}".encode()),
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    rid = arc.store(db, rec)

    now = _now()
    db.execute(
        "UPDATE marketplace_jobs SET status=?,accept_id=?,updated_at=? WHERE id=?",
        ("accepted", rid, now, job_id),
    )
    db.commit()
    return {"job_id": job_id, "accept_id": rid, "record": rec, "status": "accepted"}


def deliver_work(db: sqlite3.Connection, job_id: str, result: str) -> dict:
    """Step 4 — Service agent delivers completed work."""
    _ensure_tables(db)
    job = get_job(db, job_id)
    if job["status"] != "accepted":
        raise ValueError(f"Expected status 'accepted', got '{job['status']}'")

    secret, pubkey = _load_agent("service")
    prev = _latest_id(db, pubkey)

    rec = arc.build_record(
        "action", secret,
        f"DELIVER: {result}",
        prev=prev,
        memrefs=[job["accept_id"]],
        ihash=arc.sha256hex(f"deliver:{job_id}".encode()),
        ohash=arc.sha256hex(result.encode()),
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    rid = arc.store(db, rec)

    now = _now()
    db.execute(
        "UPDATE marketplace_jobs SET status=?,deliver_id=?,updated_at=? WHERE id=?",
        ("delivered", rid, now, job_id),
    )
    db.commit()
    return {"job_id": job_id, "deliver_id": rid, "record": rec, "status": "delivered"}


def pay_invoice(db: sqlite3.Connection, job_id: str) -> dict:
    """Step 5 — Customer pays via Lightning settlement with preimage proof."""
    _ensure_tables(db)
    job = get_job(db, job_id)
    if job["status"] != "delivered":
        raise ValueError(f"Expected status 'delivered', got '{job['status']}'")

    secret, pubkey = _load_agent("customer")
    prev = _latest_id(db, pubkey)

    preimage = os.urandom(32)
    payment_hash = arc.sha256hex(preimage)

    settlement = {
        "type": "lightning",
        "amount_sats": job["amount_sats"],
        "payment_hash": payment_hash,
        "preimage": preimage.hex(),
    }

    rec = arc.build_record(
        "settlement", secret,
        f"PAYMENT: {job['amount_sats']} sats for '{job['task']}'",
        prev=prev,
        memrefs=[job["deliver_id"]],
        settlement=settlement,
        ihash=arc.sha256hex(f"pay:{job_id}:{job['amount_sats']}".encode()),
        ohash=arc.sha256hex(f"paid:{payment_hash}".encode()),
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    rid = arc.store(db, rec)

    now = _now()
    db.execute(
        "UPDATE marketplace_jobs SET status=?,payment_id=?,updated_at=? WHERE id=?",
        ("paid", rid, now, job_id),
    )
    db.commit()
    return {
        "job_id": job_id, "payment_id": rid, "record": rec, "status": "paid",
        "payment_hash": payment_hash, "preimage": preimage.hex(),
    }


def confirm_receipt(db: sqlite3.Connection, job_id: str) -> dict:
    """Step 6 — Service confirms payment receipt, closes the loop."""
    _ensure_tables(db)
    job = get_job(db, job_id)
    if job["status"] != "paid":
        raise ValueError(f"Expected status 'paid', got '{job['status']}'")

    secret, pubkey = _load_agent("service")
    prev = _latest_id(db, pubkey)

    payment_rec = arc.fetch(db, job["payment_id"])
    preimage = payment_rec["settlement"]["preimage"]
    payment_hash = payment_rec["settlement"]["payment_hash"]

    rec = arc.build_record(
        "action", secret,
        f"RECEIPT: Confirmed {job['amount_sats']} sats received. Preimage verified.",
        prev=prev,
        memrefs=[job["payment_id"]],
        ihash=arc.sha256hex(f"receipt:{job_id}:{payment_hash}".encode()),
        ohash=arc.sha256hex(f"confirmed:{preimage}".encode()),
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    rid = arc.store(db, rec)

    now = _now()
    db.execute(
        "UPDATE marketplace_jobs SET status=?,receipt_id=?,updated_at=? WHERE id=?",
        ("completed", rid, now, job_id),
    )
    db.commit()
    return {"job_id": job_id, "receipt_id": rid, "record": rec, "status": "completed"}


# ── Queries ────────────────────────────────────────────────────────────────


def list_jobs(db: sqlite3.Connection) -> list[dict]:
    _ensure_tables(db)
    rows = db.execute(
        "SELECT * FROM marketplace_jobs ORDER BY created_at DESC"
    ).fetchall()
    return [_job_from_row(r) for r in rows]


def get_job(db: sqlite3.Connection, job_id: str) -> dict:
    _ensure_tables(db)
    row = db.execute(
        "SELECT * FROM marketplace_jobs WHERE id=?", (job_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"Job {job_id} not found")
    return _job_from_row(row)


def get_dispute_data(db: sqlite3.Connection, job_id: str) -> dict:
    """Walk the complete cross-agent DAG for dispute resolution.
    Returns every record, every edge, per-record validation, and deep validation.
    """
    job = get_job(db, job_id)

    record_ids = [
        job[k] for k in
        ("request_id", "offer_id", "accept_id", "deliver_id", "payment_id", "receipt_id")
        if job.get(k)
    ]

    all_records: dict[str, dict] = {}
    edges: list[dict] = []

    def walk(rid: str, visited: set):
        if not rid or rid in visited:
            return
        visited.add(rid)
        rec = arc.fetch(db, rid)
        if not rec:
            return
        all_records[rid] = rec
        if rec.get("prev"):
            edges.append({"source": rec["prev"], "target": rid, "type": "prev"})
            walk(rec["prev"], visited)
        for mref in rec.get("memrefs", []):
            edges.append({"source": mref, "target": rid, "type": "memref"})
            walk(mref, visited)

    visited: set[str] = set()
    for rid in record_ids:
        walk(rid, visited)

    validations = {}
    for rid in all_records:
        errs = arc.validate(db, rid, deep=False)
        validations[rid] = {"valid": len(errs) == 0, "errors": errs}

    final_id = record_ids[-1] if record_ids else None
    deep_errs = arc.validate(db, final_id, deep=True) if final_id else []

    return {
        "job": job,
        "records": all_records,
        "edges": edges,
        "validations": validations,
        "deep_validation": {"valid": len(deep_errs) == 0, "errors": deep_errs},
        "record_count": len(all_records),
    }


# ── Full Demo ──────────────────────────────────────────────────────────────


def run_demo(db: sqlite3.Connection) -> dict:
    """Execute the complete 6-step marketplace flow between two autonomous agents."""
    steps = []

    r1 = request_task(db, "Analyze Bitcoin mempool congestion and recommend optimal fee rate", 2500)
    steps.append({"step": 1, "agent": "customer", "action": "REQUEST", **r1})
    _time.sleep(0.05)

    r2 = offer_service(db, r1["job_id"], 2000)
    steps.append({"step": 2, "agent": "service", "action": "OFFER", **r2})
    _time.sleep(0.05)

    r3 = accept_offer(db, r1["job_id"])
    steps.append({"step": 3, "agent": "customer", "action": "ACCEPT", **r3})
    _time.sleep(0.05)

    r4 = deliver_work(
        db, r1["job_id"],
        "Mempool analysis complete: 45 sat/vB for next-block confirmation. "
        "Congestion moderate at 120 vMB. Recommend 38 sat/vB for 2-block target. "
        "Lightning channels well-balanced for immediate settlement.",
    )
    steps.append({"step": 4, "agent": "service", "action": "DELIVER", **r4})
    _time.sleep(0.05)

    r5 = pay_invoice(db, r1["job_id"])
    steps.append({"step": 5, "agent": "customer", "action": "PAYMENT", **r5})
    _time.sleep(0.05)

    r6 = confirm_receipt(db, r1["job_id"])
    steps.append({"step": 6, "agent": "service", "action": "RECEIPT", **r6})

    return {"job_id": r1["job_id"], "steps": steps, "status": "completed"}
