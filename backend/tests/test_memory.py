"""Tests for the ARC memory layer."""

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import arc
import memory as mem


@pytest.fixture(autouse=True)
def isolated_arc(tmp_path, monkeypatch):
    monkeypatch.setattr(arc, "ARC_DIR", tmp_path / ".arc")
    monkeypatch.setattr(arc, "DB_PATH", tmp_path / ".arc" / "records.db")
    monkeypatch.setattr(arc, "KEYS_DIR", tmp_path / ".arc" / "keys")
    arc.ensure_dirs()


def _new_agent(alias: str = "tester") -> tuple[bytes, str, str]:
    """Generate a keypair, create genesis, return (secret, pubkey, genesis_id)."""
    sec_hex, _ = arc.generate_keypair(alias)
    secret = bytes.fromhex(sec_hex)
    pub = arc.xonly_pubkey(secret).hex()
    db = arc.get_db()
    g = arc.build_record("genesis", secret, "init", alias=alias)
    gid = arc.store(db, g)
    return secret, pub, gid


# ── Key / value validation ────────────────────────────────────────────────


class TestFieldValidation:
    def test_valid_key(self):
        assert mem.validate_key("user.preferred_language") == "user.preferred_language"
        assert mem.validate_key("project.api.v2") == "project.api.v2"
        assert mem.validate_key("a-b_c.1") == "a-b_c.1"

    def test_rejects_uppercase_key(self):
        with pytest.raises(mem.MemoryError):
            mem.validate_key("User.X")

    def test_rejects_empty_key(self):
        with pytest.raises(mem.MemoryError):
            mem.validate_key("")

    def test_rejects_special_char_key(self):
        with pytest.raises(mem.MemoryError):
            mem.validate_key("user/x")

    def test_rejects_empty_value(self):
        with pytest.raises(mem.MemoryError):
            mem.validate_value("")

    def test_rejects_oversized_value(self):
        with pytest.raises(mem.MemoryError):
            mem.validate_value("x" * (mem.MEMORY_VALUE_MAX + 1))

    def test_rejects_unknown_type(self):
        with pytest.raises(mem.MemoryError):
            mem.validate_type("speculation")

    def test_accepts_all_known_types(self):
        for t in mem.MEMORY_TYPES:
            assert mem.validate_type(t) == t


# ── Record build & signature ──────────────────────────────────────────────


class TestMemoryRecord:
    def test_build_and_verify(self):
        secret, _, gid = _new_agent()
        rec = mem.build_memory_record(
            secret,
            prev=gid,
            memory_key="user.preferred_language",
            memory_value="python",
            memory_type="preference",
        )
        assert rec["type"] == "memory"
        assert rec["memory_key"] == "user.preferred_language"
        assert rec["memory_value"] == "python"
        assert rec["memory_type"] == "preference"
        assert arc.verify_sig(rec)

    def test_tamper_invalidates_sig(self):
        secret, _, gid = _new_agent()
        rec = mem.build_memory_record(
            secret,
            prev=gid,
            memory_key="user.foo",
            memory_value="bar",
            memory_type="fact",
        )
        rec["memory_value"] = "tampered"
        assert not arc.verify_sig(rec)

    def test_validate_memory_record_in_chain(self):
        secret, _, gid = _new_agent()
        db = arc.get_db()
        time.sleep(0.01)
        rec = mem.build_memory_record(
            secret, prev=gid, memory_key="x", memory_value="y", memory_type="fact",
        )
        rid = arc.store(db, rec)
        # arc.validate should now accept memory as a valid record type.
        assert arc.validate(db, rid) == []


# ── Search & latest ───────────────────────────────────────────────────────


class TestSearchAndLatest:
    def _store(self, secret, prev, key, val, mtype="fact", supersedes=None):
        time.sleep(0.001)
        db = arc.get_db()
        rec = mem.build_memory_record(
            secret,
            prev=prev,
            memory_key=key,
            memory_value=val,
            memory_type=mtype,
            supersedes=supersedes,
        )
        return arc.store(db, rec), rec

    def test_search_by_prefix(self):
        secret, _, gid = _new_agent()
        prev = gid
        prev, _ = self._store(secret, prev, "user.lang", "python")
        prev, _ = self._store(secret, prev, "user.editor", "vim")
        prev, _ = self._store(secret, prev, "project.pm", "pnpm")
        db = arc.get_db()
        results = mem.search_memories(db, "user.")
        assert len(results) == 2
        keys = {r["record"]["memory_key"] for r in results}
        assert keys == {"user.lang", "user.editor"}

    def test_latest_returns_newest(self):
        secret, _, gid = _new_agent()
        prev = gid
        prev, _ = self._store(secret, prev, "user.lang", "python")
        prev, _ = self._store(secret, prev, "user.lang", "typescript")
        db = arc.get_db()
        latest = mem.latest_for_key(db, "user.lang")
        assert latest is not None
        assert latest["record"]["memory_value"] == "typescript"

    def test_latest_returns_none_for_unknown_key(self):
        _new_agent()
        assert mem.latest_for_key(arc.get_db(), "does.not.exist") is None

    def test_supersedes_builds_timeline(self):
        secret, _, gid = _new_agent()
        prev = gid
        rid1, _ = self._store(secret, prev, "x.y", "v1", mtype="decision")
        prev = rid1
        rid2, _ = self._store(
            secret, prev, "x.y", "v2", mtype="decision", supersedes=rid1,
        )
        latest = mem.latest_for_key(arc.get_db(), "x.y")
        assert latest["id"] == rid2
        assert latest["record"]["memory_value"] == "v2"
        assert len(latest["timeline"]) == 1
        assert latest["timeline"][0]["id"] == rid1

    def test_tombstone_hides_from_latest(self):
        secret, _, gid = _new_agent()
        prev = gid
        rid1, _ = self._store(secret, prev, "user.foo", "keep")
        prev = rid1
        # Tombstone = supersedes + TOMBSTONE_MARKER value
        db = arc.get_db()
        tomb = mem.build_tombstone_record(
            secret, prev=prev, supersedes_id=rid1, memory_key="user.foo",
        )
        arc.store(db, tomb)
        assert mem.latest_for_key(db, "user.foo") is None


# ── Supersedes validation ─────────────────────────────────────────────────


class TestSupersedesValidation:
    def test_rejects_nonexistent_target(self):
        secret, pub, _ = _new_agent()
        with pytest.raises(mem.MemoryError):
            mem.validate_supersedes(arc.get_db(), "0" * 64, pub)

    def test_rejects_non_memory_target(self):
        secret, pub, gid = _new_agent()
        # gid is a genesis record, not a memory record
        with pytest.raises(mem.MemoryError):
            mem.validate_supersedes(arc.get_db(), gid, pub)

    def test_rejects_wrong_agent(self):
        s1, _, gid1 = _new_agent("a1")
        s2, pub2, _ = _new_agent("a2")
        db = arc.get_db()
        rec = mem.build_memory_record(
            s1, prev=gid1, memory_key="x.y", memory_value="v", memory_type="fact",
        )
        rid = arc.store(db, rec)
        with pytest.raises(mem.MemoryError):
            # pub2 tries to supersede a memory authored by s1 — must fail
            mem.validate_supersedes(db, rid, pub2)


# ── Stats ─────────────────────────────────────────────────────────────────


class TestStats:
    def test_empty_stats(self):
        s = mem.stats(arc.get_db())
        assert s["total"] == 0

    def test_stats_counts_by_type(self):
        secret, _, gid = _new_agent()
        db = arc.get_db()
        for mtype, key, val in [
            ("fact", "a.1", "v"),
            ("fact", "a.2", "v"),
            ("preference", "p.1", "v"),
        ]:
            time.sleep(0.001)
            rec = mem.build_memory_record(
                secret, prev=gid, memory_key=key, memory_value=val, memory_type=mtype,
            )
            gid = arc.store(db, rec)
        s = mem.stats(db)
        assert s["total"] == 3
        assert s["by_type"]["fact"] == 2
        assert s["by_type"]["preference"] == 1


# ── TTL ───────────────────────────────────────────────────────────────────


class TestTTL:
    def test_expired_is_hidden(self):
        secret, _, gid = _new_agent()
        db = arc.get_db()
        rec = mem.build_memory_record(
            secret,
            prev=gid,
            memory_key="ephemeral.key",
            memory_value="v",
            memory_type="context",
            ttl=1,
        )
        # Backdate the record so TTL has already expired.
        rec["ts"] = "2000-01-01T00:00:00+00:00"
        rec["sig"] = arc.sign_record(rec, secret)
        arc.store(db, rec)
        assert mem.latest_for_key(db, "ephemeral.key") is None
        assert mem.search_memories(db, "ephemeral.") == []
