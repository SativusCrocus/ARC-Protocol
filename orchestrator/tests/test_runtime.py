"""Tests for the runtime dispatch + Goose bridge dry-run path.

These exercise the end-to-end path without requiring Goose to be
installed — the bridge is forced into dry_run mode and the ARC backend
is mocked with respx.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from arc_orchestrator.api import create_app
from arc_orchestrator.goose_bridge import GooseBridge
from arc_orchestrator.registry import AgentRegistry
from arc_orchestrator.runtime import (
    OrchestratorRuntime,
    _extract_record_ids,
)
from arc_orchestrator.state import AgentStateStore

ARC_URL = "http://arc.test"
AGENTS_DIR = Path(__file__).resolve().parents[1] / "agents"
RECORD_ID = "a" * 64
OTHER_ID = "b" * 64


def _build_runtime(tmp_path: Path, dry_run: bool = True) -> OrchestratorRuntime:
    state = AgentStateStore(tmp_path / "state.json")
    bridge = GooseBridge(
        goose_bin="goose",
        arc_api_url=ARC_URL,
        arc_mcp_command="arc-mcp",
        dry_run=dry_run,
    )
    registry = AgentRegistry(AGENTS_DIR)
    return OrchestratorRuntime(
        registry=registry, bridge=bridge, state=state, arc_api_url=ARC_URL,
    )


def test_extract_record_ids_dedupes_and_preserves_order() -> None:
    text = f"foo {RECORD_ID} bar {OTHER_ID} baz {RECORD_ID.upper()}"
    ids = _extract_record_ids(text)
    assert ids == [RECORD_ID, OTHER_ID]


def test_extract_record_ids_empty() -> None:
    assert _extract_record_ids("") == []
    assert _extract_record_ids("no hex here") == []


async def test_dispatch_dry_run_emits_events(tmp_path: Path) -> None:
    rt = _build_runtime(tmp_path, dry_run=True)
    await rt.start()
    try:
        result = await rt.dispatch("arc-deep-research", task="summarize x")
        assert result.ok
        assert result.dry_run
        assert result.goose["dry_run"]
        # Two events: started + finished
        events = rt.activity()
        kinds = [e.kind for e in events]
        assert "dispatch.started" in kinds
        assert "dispatch.finished" in kinds
    finally:
        await rt.stop()


async def test_dispatch_unknown_agent_raises(tmp_path: Path) -> None:
    rt = _build_runtime(tmp_path)
    await rt.start()
    try:
        with pytest.raises(ValueError, match="unknown agent"):
            await rt.dispatch("nonexistent", task="x")
    finally:
        await rt.stop()


async def test_meta_route_picks_meta_agent(tmp_path: Path) -> None:
    rt = _build_runtime(tmp_path)
    await rt.start()
    try:
        result = await rt.meta_route("draft an NDA")
        assert result.agent == "arc-orchestrator"
    finally:
        await rt.stop()


@respx.mock
async def test_new_head_persists_when_record_verifies(tmp_path: Path) -> None:
    """When Goose output contains a record id that the ARC backend
    confirms exists, the runtime should persist it as the agent's head."""

    # Force non-dry-run so new_head verification path runs, then stub the
    # goose subprocess via a monkey-patched bridge.dispatch.
    rt = _build_runtime(tmp_path, dry_run=False)
    await rt.start()
    try:
        respx.get(f"{ARC_URL}/record/{RECORD_ID}").mock(
            return_value=httpx.Response(200, json={"id": RECORD_ID, "record": {}})
        )

        from arc_orchestrator.goose_bridge import GooseResult
        async def fake_dispatch(spec, *, task, prev_record=None, extra_context=None):
            return GooseResult(
                agent=spec.agent_name, task=task,
                started_at=0.0, finished_at=0.1, ok=True,
                stdout=f'{{"id":"{RECORD_ID}"}}',
                dry_run=False,
            )
        rt.bridge.dispatch = fake_dispatch  # type: ignore[assignment]

        result = await rt.dispatch("arc-codegen", task="write a hex parser")
        assert result.ok
        assert result.new_head == RECORD_ID
        assert rt.state.head("arc-codegen") == RECORD_ID
    finally:
        await rt.stop()


@respx.mock
async def test_new_head_dropped_when_record_missing(tmp_path: Path) -> None:
    rt = _build_runtime(tmp_path, dry_run=False)
    await rt.start()
    try:
        respx.get(f"{ARC_URL}/record/{OTHER_ID}").mock(
            return_value=httpx.Response(404, json={"detail": "not found"})
        )
        from arc_orchestrator.goose_bridge import GooseResult
        async def fake_dispatch(spec, *, task, prev_record=None, extra_context=None):
            return GooseResult(
                agent=spec.agent_name, task=task,
                started_at=0.0, finished_at=0.1, ok=True,
                stdout=f"spurious {OTHER_ID}",
                dry_run=False,
            )
        rt.bridge.dispatch = fake_dispatch  # type: ignore[assignment]

        result = await rt.dispatch("arc-codegen", task="x")
        assert result.new_head is None
        assert rt.state.head("arc-codegen") is None
    finally:
        await rt.stop()


# ── HTTP surface ─────────────────────────────────────────────────────


def test_http_agents_and_dispatch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARC_ORCH_DRY_RUN", "true")
    monkeypatch.setenv("ARC_ORCH_STATE", str(tmp_path / "s.json"))
    monkeypatch.setenv("ARC_API_URL", ARC_URL)
    rt = _build_runtime(tmp_path, dry_run=True)
    app = create_app(runtime=rt)

    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["agents"] == 10
        assert body["dry_run"] is True

        r = client.get("/orchestrator/agents")
        assert r.status_code == 200
        names = {a["agent_name"] for a in r.json()}
        assert "arc-orchestrator" in names and "arc-deep-research" in names

        r = client.post(
            "/orchestrator/dispatch",
            json={"agent": "arc-deep-research", "task": "summarize lightning"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["agent"] == "arc-deep-research"
        assert body["dry_run"] is True
        assert body["ok"] is True

        r = client.post(
            "/orchestrator/dispatch",
            json={"task": "route this generic task"},
        )
        assert r.status_code == 200
        assert r.json()["agent"] == "arc-orchestrator"

        r = client.get("/orchestrator/activity?limit=50")
        assert r.status_code == 200
        assert len(r.json()) >= 2


def test_http_trigger_unknown_returns_404(tmp_path: Path) -> None:
    rt = _build_runtime(tmp_path, dry_run=True)
    app = create_app(runtime=rt)
    with TestClient(app) as client:
        r = client.post(
            "/orchestrator/agent/nonexistent/trigger",
            json={"task": "nope"},
        )
        assert r.status_code == 404
