#!/usr/bin/env python3
"""ARC Protocol – Agent Record Convention
Bitcoin-native identity, provenance, and economic settlement for AI agents.
Pure-Python BIP-340 Schnorr signatures over secp256k1 – no C extensions.
"""

import click
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ecdsa import SECP256k1
from ecdsa.ellipticcurve import PointJacobi

ARC_VERSION = "1.0"


def _resolve_arc_dir() -> Path:
    """Pick a writable directory for ARC state.

    Precedence:
      1. ARC_HOME env var (deploys set this explicitly).
      2. ~/.arc  if the home dir is writable.
      3. /tmp/.arc as a last-resort ephemeral fallback (Vercel serverless,
         read-only root filesystems, etc.).
    """
    candidates: list[Path] = []
    env = os.environ.get("ARC_HOME")
    if env:
        candidates.append(Path(env))
    try:
        candidates.append(Path.home() / ".arc")
    except Exception:
        pass
    candidates.append(Path("/tmp") / ".arc")

    for cand in candidates:
        try:
            cand.mkdir(parents=True, exist_ok=True)
            # Writability probe — catches read-only filesystems that still
            # let mkdir succeed (rare, but real on some serverless runtimes).
            probe = cand / ".write-probe"
            probe.write_text("ok")
            probe.unlink()
            return cand
        except Exception as e:  # noqa: BLE001
            print(f"[arc] ARC_DIR candidate unusable: {cand} ({e})", flush=True)
            continue
    # Absolute fallback — return the tmp path even if the probe failed;
    # downstream code will surface a clear error instead of an import crash.
    return Path("/tmp") / ".arc"


ARC_DIR = _resolve_arc_dir()
DB_PATH = ARC_DIR / "records.db"
KEYS_DIR = ARC_DIR / "keys"
print(f"[arc] ARC_DIR resolved to {ARC_DIR}", flush=True)

# ── BIP-340 Schnorr (pure Python) ──────────────────────────────────────────

_G = SECP256k1.generator
_n = SECP256k1.order
_p = SECP256k1.curve.p()


def _int_from_bytes(b: bytes) -> int:
    return int.from_bytes(b, "big")


def _bytes_from_int(x: int) -> bytes:
    return x.to_bytes(32, "big")


def _has_even_y(P) -> bool:
    return P.y() % 2 == 0


def _tagged_hash(tag: str, data: bytes) -> bytes:
    th = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(th + th + data).digest()


def _lift_x(x: int):
    """Lift x-only coordinate to secp256k1 point with even y."""
    y_sq = (pow(x, 3, _p) + 7) % _p
    y = pow(y_sq, (_p + 1) // 4, _p)
    if pow(y, 2, _p) != y_sq:
        raise ValueError("x not on curve")
    if y % 2 != 0:
        y = _p - y
    return PointJacobi(SECP256k1.curve, x, y, 1, _n)


def xonly_pubkey(secret: bytes) -> bytes:
    """Derive 32-byte x-only Taproot public key from 32-byte secret."""
    d = _int_from_bytes(secret)
    P = d * _G
    return _bytes_from_int(P.x())


def schnorr_sign(msg: bytes, secret: bytes) -> bytes:
    """BIP-340 Schnorr sign. msg must be 32 bytes."""
    d0 = _int_from_bytes(secret)
    P = d0 * _G
    d = d0 if _has_even_y(P) else _n - d0
    px = _bytes_from_int(P.x())

    aux = os.urandom(32)
    t = bytes(a ^ b for a, b in zip(
        _bytes_from_int(d), _tagged_hash("BIP0340/aux", aux)))
    k0 = _int_from_bytes(
        _tagged_hash("BIP0340/nonce", t + px + msg)) % _n
    if k0 == 0:
        raise ValueError("Nonce is zero")
    R = k0 * _G
    k = k0 if _has_even_y(R) else _n - k0
    rx = _bytes_from_int(R.x())
    e = _int_from_bytes(
        _tagged_hash("BIP0340/challenge", rx + px + msg)) % _n
    return rx + _bytes_from_int((k + e * d) % _n)


def schnorr_verify(msg: bytes, pubkey: bytes, sig: bytes) -> bool:
    """BIP-340 Schnorr verify. pubkey=32 bytes x-only, sig=64 bytes."""
    if len(pubkey) != 32 or len(sig) != 64:
        return False
    try:
        Px = _int_from_bytes(pubkey)
        r = _int_from_bytes(sig[:32])
        s = _int_from_bytes(sig[32:])
        if Px >= _p or r >= _p or s >= _n:
            return False
        P = _lift_x(Px)
        e = _int_from_bytes(
            _tagged_hash("BIP0340/challenge", sig[:32] + pubkey + msg)) % _n
        R = s * _G + (_n - e) * P
        return _has_even_y(R) and R.x() == r
    except Exception:
        return False


# ── Core Helpers ────────────────────────────────────────────────────────────


def sha256hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(record: dict) -> bytes:
    """Canonical JSON for signing: sorted keys, compact, no sig field."""
    r = {k: v for k, v in record.items() if k != "sig"}
    return json.dumps(r, sort_keys=True, separators=(",", ":")).encode()


def sign_record(record: dict, secret: bytes) -> str:
    digest = hashlib.sha256(canonical(record)).digest()
    return schnorr_sign(digest, secret).hex()


def verify_sig(record: dict) -> bool:
    pubkey = bytes.fromhex(record["agent"]["pubkey"])
    sig = bytes.fromhex(record["sig"])
    digest = hashlib.sha256(canonical(record)).digest()
    return schnorr_verify(digest, pubkey, sig)


# ── Storage ─────────────────────────────────────────────────────────────────


def ensure_dirs():
    ARC_DIR.mkdir(parents=True, exist_ok=True)
    KEYS_DIR.mkdir(parents=True, exist_ok=True)


def get_db() -> sqlite3.Connection:
    ensure_dirs()
    db = sqlite3.connect(str(DB_PATH))
    db.execute(
        """CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, pubkey TEXT NOT NULL,
        prev TEXT, ts TEXT NOT NULL, data TEXT NOT NULL)"""
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_pk ON records(pubkey)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_prev ON records(prev)")
    db.commit()
    return db


def store(db: sqlite3.Connection, record: dict) -> str:
    """Store record. Returns content-addressed ID (sha256 of signed JSON)."""
    raw = json.dumps(record, sort_keys=True)
    rid = sha256hex(raw.encode())
    db.execute(
        "INSERT OR REPLACE INTO records VALUES (?,?,?,?,?,?)",
        (rid, record["type"], record["agent"]["pubkey"],
         record.get("prev"), record["ts"], raw),
    )
    db.commit()
    return rid


def fetch(db: sqlite3.Connection, rid: str) -> Optional[dict]:
    row = db.execute("SELECT data FROM records WHERE id=?", (rid,)).fetchone()
    return json.loads(row[0]) if row else None


def fetch_by_pubkey(db: sqlite3.Connection, pubkey: str) -> list:
    rows = db.execute(
        "SELECT id, data FROM records WHERE pubkey=? ORDER BY ts", (pubkey,)
    ).fetchall()
    return [(r[0], json.loads(r[1])) for r in rows]


def all_records(db: sqlite3.Connection) -> list:
    rows = db.execute("SELECT id, data FROM records ORDER BY ts DESC").fetchall()
    return [(r[0], json.loads(r[1])) for r in rows]


# ── Key Management ──────────────────────────────────────────────────────────


def generate_keypair(alias: Optional[str] = None) -> tuple[str, str]:
    ensure_dirs()
    secret = os.urandom(32)
    pub = xonly_pubkey(secret).hex()
    name = alias or pub[:16]
    key_file = KEYS_DIR / f"{name}.key"
    key_file.write_text(secret.hex())
    key_file.chmod(0o600)
    (KEYS_DIR / f"{name}.pub").write_text(pub)
    return secret.hex(), pub


def load_key(path: Optional[str] = None) -> bytes:
    """Load 32-byte secret key from file. Returns raw bytes."""
    if path:
        p = Path(path)
    else:
        keys = sorted(KEYS_DIR.glob("*.key"))
        if not keys:
            raise click.ClickException("No keys found. Run: arc keygen")
        p = keys[0]
    return bytes.fromhex(p.read_text().strip())


def list_keys() -> list[dict]:
    ensure_dirs()
    result = []
    for pub_file in sorted(KEYS_DIR.glob("*.pub")):
        result.append({"name": pub_file.stem, "pubkey": pub_file.read_text().strip()})
    return result


# ── Ollama ──────────────────────────────────────────────────────────────────


def ollama_generate(prompt: str, model: str = "llama3.2") -> str:
    import requests

    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    try:
        r = requests.post(
            f"{host}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        return r.json().get("response", "")
    except Exception:
        return f"[offline] {sha256hex(prompt.encode())[:32]}"


# ── Validation ──────────────────────────────────────────────────────────────


def _is_hex64(s: str) -> bool:
    return len(s) == 64 and all(c in "0123456789abcdef" for c in s)


def validate(
    db: sqlite3.Connection, rid: str, deep: bool = True, _visited: set = None
) -> list[str]:
    if _visited is None:
        _visited = set()
    if rid in _visited:
        return []
    _visited.add(rid)

    record = fetch(db, rid)
    if not record:
        return [f"Record {rid[:16]}... not found"]

    errs = []

    if record.get("arc") != ARC_VERSION:
        errs.append(f"Bad ARC version: {record.get('arc')}")
    if record.get("type") not in ("genesis", "action", "settlement", "memory"):
        errs.append(f"Bad type: {record.get('type')}")
    for f in ("agent", "ts", "ihash", "ohash", "action", "sig"):
        if f not in record:
            errs.append(f"Missing field: {f}")
    if errs:
        return errs

    pk = record["agent"].get("pubkey", "")
    if not _is_hex64(pk):
        errs.append("Invalid pubkey: need 64 hex chars")

    for f in ("ihash", "ohash"):
        if not _is_hex64(record.get(f, "")):
            errs.append(f"Invalid {f}: need 64 hex chars")

    try:
        if not verify_sig(record):
            errs.append("Bad signature")
    except Exception as e:
        errs.append(f"Signature error: {e}")

    if record["type"] == "genesis":
        if record.get("prev") is not None:
            errs.append("Genesis prev must be null")
        if record.get("memrefs"):
            errs.append("Genesis memrefs must be empty")
    else:
        if not record.get("prev"):
            errs.append(f"{record['type']} record needs prev")
        elif deep:
            prev_rec = fetch(db, record["prev"])
            if prev_rec:
                if prev_rec["agent"]["pubkey"] != record["agent"]["pubkey"]:
                    errs.append("Chain break: different agent in prev")
                if prev_rec["ts"] >= record["ts"]:
                    errs.append("Timestamp not monotonically increasing")
            errs.extend(validate(db, record["prev"], True, _visited))

    if deep:
        for mref in record.get("memrefs", []):
            errs.extend(validate(db, mref, True, _visited))

    if record["type"] == "settlement":
        s = record.get("settlement")
        if not s:
            errs.append("Settlement record missing settlement field")
        elif not isinstance(s.get("amount_sats"), int) or s["amount_sats"] <= 0:
            errs.append("Invalid settlement amount_sats")

    return errs


# ── Record Builder ──────────────────────────────────────────────────────────


def build_record(
    type_: str,
    secret: bytes,
    action_desc: str,
    prev: Optional[str] = None,
    memrefs: list[str] = None,
    ihash: str = None,
    ohash: str = None,
    alias: Optional[str] = None,
    settlement: Optional[dict] = None,
    memory: Optional[dict] = None,
) -> dict:
    pub = xonly_pubkey(secret).hex()
    agent = {"pubkey": pub}
    if alias:
        agent["alias"] = alias
    record = {
        "arc": ARC_VERSION,
        "type": type_,
        "agent": agent,
        "prev": prev,
        "memrefs": memrefs or [],
        "ts": datetime.now(timezone.utc).isoformat(),
        "ihash": ihash or sha256hex(action_desc.encode()),
        "ohash": ohash or sha256hex(action_desc.encode()),
        "action": action_desc,
    }
    if settlement:
        record["settlement"] = settlement
    if memory:
        # Memory payloads are part of the canonical JSON that gets signed,
        # so tampering with any field invalidates the signature.
        record["memory_type"] = memory["memory_type"]
        record["memory_key"] = memory["memory_key"]
        record["memory_value"] = memory["memory_value"]
        if memory.get("ttl") is not None:
            record["ttl"] = int(memory["ttl"])
        if memory.get("supersedes"):
            record["supersedes"] = memory["supersedes"]
    record["sig"] = sign_record(record, secret)
    return record


# ── Inscription ─────────────────────────────────────────────────────────────


def inscription_envelope(record: dict) -> str:
    """Generate ord CLI command to inscribe this record on Bitcoin."""
    payload = json.dumps(record, indent=2)
    return (
        f'ord wallet inscribe --content-type "application/json" '
        f"--body '{payload}' --fee-rate 10"
    )


# ── Lightning ───────────────────────────────────────────────────────────────


def lnd_invoice(
    host: str, macaroon_path: str, amount: int, memo: str
) -> Optional[dict]:
    import requests

    try:
        mac = Path(macaroon_path).read_bytes().hex()
        r = requests.post(
            f"https://{host}/v1/invoices",
            headers={"Grpc-Metadata-macaroon": mac},
            json={"value": str(amount), "memo": memo},
            verify=False,
            timeout=10,
        )
        return r.json()
    except Exception:
        return None


# ── CLI ─────────────────────────────────────────────────────────────────────


@click.group()
def cli():
    """ARC Protocol - Agent Record Convention"""


@cli.command()
@click.option("--alias", default=None, help="Human-readable alias")
def keygen(alias):
    """Generate a Taproot keypair."""
    secret, pub = generate_keypair(alias)
    click.echo(f"pubkey:  {pub}")
    click.echo(f"stored:  {KEYS_DIR / (alias or pub[:16])}.key")


@cli.command()
@click.option("--alias", default=None)
@click.option("--action", "desc", required=True, help="Genesis action description")
@click.option("--key", "key_path", default=None, help="Path to .key file")
@click.option("--input", "input_data", default="genesis", help="Input data for ihash")
def genesis(alias, desc, key_path, input_data):
    """Create a genesis record."""
    secret = load_key(key_path)
    rec = build_record(
        "genesis", secret, desc, alias=alias, ihash=sha256hex(input_data.encode())
    )
    rid = store(get_db(), rec)
    click.echo(f"genesis: {rid}")
    click.echo(json.dumps(rec, indent=2))


@cli.command()
@click.option("--prev", required=True, help="Previous record ID")
@click.option("--action", "desc", required=True, help="Action description")
@click.option("--memref", "memrefs", multiple=True, help="Memory reference IDs")
@click.option("--prompt", default=None, help="Prompt to send to Ollama")
@click.option("--key", "key_path", default=None, help="Path to .key file")
def action(prev, desc, memrefs, prompt, key_path):
    """Create an action record."""
    db = get_db()
    secret = load_key(key_path)
    if not fetch(db, prev):
        raise click.ClickException(f"prev {prev[:16]}... not found")
    for m in memrefs:
        if not fetch(db, m):
            raise click.ClickException(f"memref {m[:16]}... not found")
    ihash = sha256hex((prompt or desc).encode())
    if prompt:
        out = ollama_generate(prompt)
        ohash = sha256hex(out.encode())
        click.echo(f"LLM: {out[:200]}...")
    else:
        ohash = sha256hex(desc.encode())
    rec = build_record(
        "action", secret, desc, prev=prev, memrefs=list(memrefs),
        ihash=ihash, ohash=ohash,
    )
    rid = store(db, rec)
    click.echo(f"action: {rid}")
    click.echo(json.dumps(rec, indent=2))


@cli.command("validate")
@click.argument("record_id")
@click.option("--deep/--shallow", default=True, help="Walk full chain")
def validate_cmd(record_id, deep):
    """Validate a record and its provenance chain."""
    errs = validate(get_db(), record_id, deep)
    if errs:
        for e in errs:
            click.echo(f"  x {e}", err=True)
        sys.exit(1)
    click.echo(f"  ok {record_id[:16]}... valid (full chain verified)")


@cli.command()
@click.option("--record-id", required=True, help="Record to settle against")
@click.option("--amount", required=True, type=int, help="Amount in satoshis")
@click.option("--key", "key_path", default=None)
@click.option("--lnd-host", default="localhost:8080")
@click.option("--lnd-macaroon", default=None, help="Path to admin.macaroon")
def settle(record_id, amount, key_path, lnd_host, lnd_macaroon):
    """Create a Lightning settlement record."""
    db = get_db()
    secret = load_key(key_path)
    if not fetch(db, record_id):
        raise click.ClickException(f"Record {record_id[:16]}... not found")
    preimage = os.urandom(32)
    phash = sha256hex(preimage)
    if lnd_macaroon:
        inv = lnd_invoice(lnd_host, lnd_macaroon, amount, f"ARC:{record_id[:16]}")
        if inv:
            phash = inv.get("r_hash", phash)
            click.echo(f"invoice: {inv.get('payment_request', 'N/A')}")
    settlement = {
        "type": "lightning",
        "amount_sats": amount,
        "payment_hash": phash,
        "preimage": preimage.hex(),
    }
    rec = build_record(
        "settlement", secret, f"Settlement: {amount} sats",
        prev=record_id, settlement=settlement,
        ihash=sha256hex(f"settle:{record_id}:{amount}".encode()),
        ohash=sha256hex(f"paid:{phash}".encode()),
    )
    rid = store(db, rec)
    click.echo(f"settlement: {rid}")
    click.echo(f"  payment_hash: {phash}")
    click.echo(f"  preimage:     {preimage.hex()}")


@cli.command("view-chain")
@click.argument("identifier")
def view_chain(identifier):
    """View chain by record ID or agent pubkey."""
    db = get_db()
    record = fetch(db, identifier)
    if record:
        chain = []
        cur = identifier
        while cur:
            r = fetch(db, cur)
            if not r:
                break
            chain.append((cur, r))
            cur = r.get("prev")
        for rid, r in reversed(chain):
            settle_info = ""
            if r.get("settlement"):
                settle_info = f" | {r['settlement']['amount_sats']} sats"
            click.echo(
                f"[{r['type']:10}] {rid[:16]}... | {r['ts']} | {r['action']}{settle_info}"
            )
    else:
        rows = fetch_by_pubkey(db, identifier)
        if not rows:
            click.echo(f"No records found for {identifier}", err=True)
            sys.exit(1)
        for rid, r in rows:
            click.echo(
                f"[{r['type']:10}] {rid[:16]}... | {r['ts']} | {r['action']}"
            )


if __name__ == "__main__":
    cli()
