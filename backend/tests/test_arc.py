"""Tests for ARC Protocol – covers every validation rule."""

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import arc


@pytest.fixture(autouse=True)
def isolated_arc(tmp_path, monkeypatch):
    """Isolate all tests to a temp directory."""
    monkeypatch.setattr(arc, "ARC_DIR", tmp_path / ".arc")
    monkeypatch.setattr(arc, "DB_PATH", tmp_path / ".arc" / "records.db")
    monkeypatch.setattr(arc, "KEYS_DIR", tmp_path / ".arc" / "keys")
    arc.ensure_dirs()


# ── Crypto ──────────────────────────────────────────────────────────────────


class TestCrypto:
    def test_sha256hex(self):
        assert arc.sha256hex(b"hello") == hashlib.sha256(b"hello").hexdigest()

    def test_canonical_excludes_sig(self):
        data = {"z": 1, "a": 2, "sig": "remove_me"}
        result = json.loads(arc.canonical(data))
        assert "sig" not in result
        assert list(result.keys()) == ["a", "z"]

    def test_canonical_deterministic(self):
        a = {"b": 2, "a": {"y": 1, "x": 0}}
        b = {"a": {"x": 0, "y": 1}, "b": 2}
        assert arc.canonical(a) == arc.canonical(b)

    def test_xonly_pubkey_length(self):
        secret = os.urandom(32)
        pub = arc.xonly_pubkey(secret)
        assert len(pub) == 32

    def test_sign_verify_roundtrip(self):
        secret = os.urandom(32)
        rec = arc.build_record("genesis", secret, "test")
        assert arc.verify_sig(rec)

    def test_tampered_record_fails(self):
        secret = os.urandom(32)
        rec = arc.build_record("genesis", secret, "test")
        rec["action"] = "tampered"
        assert not arc.verify_sig(rec)

    def test_schnorr_sign_verify_raw(self):
        secret = os.urandom(32)
        msg = hashlib.sha256(b"test message").digest()
        sig = arc.schnorr_sign(msg, secret)
        pub = arc.xonly_pubkey(secret)
        assert len(sig) == 64
        assert arc.schnorr_verify(msg, pub, sig)

    def test_schnorr_wrong_message(self):
        secret = os.urandom(32)
        msg1 = hashlib.sha256(b"msg1").digest()
        msg2 = hashlib.sha256(b"msg2").digest()
        sig = arc.schnorr_sign(msg1, secret)
        pub = arc.xonly_pubkey(secret)
        assert not arc.schnorr_verify(msg2, pub, sig)


# ── Key Management ──────────────────────────────────────────────────────────


class TestKeys:
    def test_generate_keypair(self):
        secret, pub = arc.generate_keypair("test")
        assert len(pub) == 64
        assert all(c in "0123456789abcdef" for c in pub)

    def test_load_key(self):
        arc.generate_keypair("loadtest")
        key = arc.load_key()
        assert isinstance(key, bytes) and len(key) == 32

    def test_list_keys(self):
        arc.generate_keypair("k1")
        arc.generate_keypair("k2")
        keys = arc.list_keys()
        assert len(keys) >= 2


# ── Genesis ─────────────────────────────────────────────────────────────────


class TestGenesis:
    def test_valid_genesis(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "init")
        rid = arc.store(db, rec)
        assert arc.validate(db, rid) == []

    def test_genesis_has_null_prev(self):
        secret = os.urandom(32)
        rec = arc.build_record("genesis", secret, "init")
        assert rec["prev"] is None

    def test_genesis_has_empty_memrefs(self):
        secret = os.urandom(32)
        rec = arc.build_record("genesis", secret, "init")
        assert rec["memrefs"] == []

    def test_genesis_rejects_prev(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "init")
        rec["prev"] = "a" * 64
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("prev" in e.lower() for e in errs)

    def test_genesis_rejects_memrefs(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "init", memrefs=["a" * 64])
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("memref" in e.lower() for e in errs)


# ── Action ──────────────────────────────────────────────────────────────────


class TestAction:
    def test_valid_chain(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        a = arc.build_record("action", secret, "act", prev=gid)
        aid = arc.store(db, a)
        assert arc.validate(db, aid) == []

    def test_action_requires_prev(self):
        secret = os.urandom(32)
        db = arc.get_db()
        rec = arc.build_record("action", secret, "act")
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("prev" in e.lower() for e in errs)

    def test_chain_break_different_agent(self):
        s1, _ = arc.generate_keypair("a1")
        s2, _ = arc.generate_keypair("a2")
        k1 = bytes.fromhex(s1)
        k2 = bytes.fromhex(s2)
        db = arc.get_db()
        g = arc.build_record("genesis", k1, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        a = arc.build_record("action", k2, "act", prev=gid)
        aid = arc.store(db, a)
        errs = arc.validate(db, aid)
        assert any("chain break" in e.lower() or "different agent" in e.lower() for e in errs)

    def test_three_deep_chain(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        prev = arc.store(db, g)
        for i in range(3):
            time.sleep(0.01)
            a = arc.build_record("action", secret, f"act-{i}", prev=prev)
            prev = arc.store(db, a)
        assert arc.validate(db, prev) == []


# ── Signature ───────────────────────────────────────────────────────────────


class TestSignature:
    def test_bad_signature(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "gen")
        rec["sig"] = "00" * 64
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("sig" in e.lower() for e in errs)


# ── Timestamp ───────────────────────────────────────────────────────────────


class TestTimestamp:
    def test_monotonic_violation(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        gid = arc.store(db, g)
        a = arc.build_record("action", secret, "act", prev=gid)
        a["ts"] = "2000-01-01T00:00:00+00:00"
        a["sig"] = arc.sign_record(a, secret)
        aid = arc.store(db, a)
        errs = arc.validate(db, aid)
        assert any("timestamp" in e.lower() or "monotonic" in e.lower() for e in errs)


# ── Hash Format ─────────────────────────────────────────────────────────────


class TestHashFormat:
    def test_invalid_ihash(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "gen")
        rec["ihash"] = "not-valid"
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("ihash" in e.lower() for e in errs)

    def test_invalid_ohash(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "gen")
        rec["ohash"] = "xyz"
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("ohash" in e.lower() for e in errs)


# ── Settlement ──────────────────────────────────────────────────────────────


class TestSettlement:
    def test_valid_settlement(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        stl = {"type": "lightning", "amount_sats": 1000,
               "payment_hash": "ab" * 32, "preimage": "cd" * 32}
        s = arc.build_record("settlement", secret, "1000 sats", prev=gid,
                             settlement=stl, ihash=arc.sha256hex(b"s"),
                             ohash=arc.sha256hex(b"p"))
        sid = arc.store(db, s)
        assert arc.validate(db, sid) == []

    def test_invalid_amount(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        stl = {"type": "lightning", "amount_sats": -1,
               "payment_hash": "ab" * 32, "preimage": "cd" * 32}
        s = arc.build_record("settlement", secret, "bad", prev=gid,
                             settlement=stl, ihash=arc.sha256hex(b"s"),
                             ohash=arc.sha256hex(b"p"))
        sid = arc.store(db, s)
        errs = arc.validate(db, sid)
        assert any("amount" in e.lower() for e in errs)

    def test_missing_settlement_field(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        s = arc.build_record("settlement", secret, "bad", prev=gid,
                             ihash=arc.sha256hex(b"s"), ohash=arc.sha256hex(b"p"))
        sid = arc.store(db, s)
        errs = arc.validate(db, sid)
        assert any("settlement" in e.lower() for e in errs)


# ── Memrefs ─────────────────────────────────────────────────────────────────


class TestMemrefs:
    def test_valid_memref(self):
        s1, _ = arc.generate_keypair("a1")
        s2, _ = arc.generate_keypair("a2")
        k1 = bytes.fromhex(s1)
        k2 = bytes.fromhex(s2)
        db = arc.get_db()
        ref = arc.build_record("genesis", k2, "reference")
        ref_id = arc.store(db, ref)
        g = arc.build_record("genesis", k1, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        a = arc.build_record("action", k1, "act", prev=gid, memrefs=[ref_id])
        aid = arc.store(db, a)
        assert arc.validate(db, aid) == []

    def test_missing_memref(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        g = arc.build_record("genesis", secret, "gen")
        gid = arc.store(db, g)
        time.sleep(0.01)
        a = arc.build_record("action", secret, "act", prev=gid, memrefs=["dead" * 16])
        aid = arc.store(db, a)
        errs = arc.validate(db, aid)
        assert any("not found" in e.lower() for e in errs)


# ── Storage ─────────────────────────────────────────────────────────────────


class TestStorage:
    def test_store_and_fetch(self):
        secret = os.urandom(32)
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "test")
        rid = arc.store(db, rec)
        fetched = arc.fetch(db, rid)
        assert fetched["action"] == "test"
        assert fetched["type"] == "genesis"

    def test_all_records(self):
        secret = os.urandom(32)
        db = arc.get_db()
        arc.store(db, arc.build_record("genesis", secret, "gen"))
        assert len(arc.all_records(db)) >= 1

    def test_fetch_by_pubkey(self):
        s, pub = arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        arc.store(db, arc.build_record("genesis", secret, "gen"))
        assert len(arc.fetch_by_pubkey(db, pub)) >= 1

    def test_missing_record(self):
        errs = arc.validate(arc.get_db(), "nonexistent" * 4)
        assert len(errs) > 0

    def test_content_addressed_id(self):
        secret = os.urandom(32)
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "test")
        rid1 = arc.store(db, rec)
        rid2 = arc.store(db, rec)
        assert rid1 == rid2


# ── Inscription ─────────────────────────────────────────────────────────────


class TestInscription:
    def test_envelope_format(self):
        secret = os.urandom(32)
        rec = arc.build_record("genesis", secret, "gen")
        cmd = arc.inscription_envelope(rec)
        assert "ord wallet inscribe" in cmd
        assert "application/json" in cmd
        assert '"arc"' in cmd


# ── Schema ──────────────────────────────────────────────────────────────────


class TestSchema:
    def test_bad_arc_version(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "gen")
        rec["arc"] = "99.0"
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("version" in e.lower() for e in errs)

    def test_bad_type(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "gen")
        rec["type"] = "invalid"
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("type" in e.lower() for e in errs)

    def test_invalid_pubkey(self):
        arc.generate_keypair("t")
        secret = arc.load_key()
        db = arc.get_db()
        rec = arc.build_record("genesis", secret, "gen")
        rec["agent"]["pubkey"] = "short"
        rec["sig"] = arc.sign_record(rec, secret)
        rid = arc.store(db, rec)
        errs = arc.validate(db, rid)
        assert any("pubkey" in e.lower() for e in errs)
