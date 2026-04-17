"""Tests for the ARC recipe middleware — loading, validation, execution,
idempotency, memref strategies, provenance report, HTTP surface."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
import respx
import yaml
from fastapi.testclient import TestClient

from arc_orchestrator.api import create_app
from arc_orchestrator.goose_bridge import GooseBridge
from arc_orchestrator.provenance_report import build_report, render_dag_ascii
from arc_orchestrator.recipe_middleware import (
    RecipeError,
    RecipeRegistry,
    RecipeRunner,
    RecipeSpec,
    RecipeStep,
    build_runner_from_env,
    compute_ihash,
    default_recipes_dir,
    load_recipe,
    resolve_memrefs,
    validate_recipe,
)
from arc_orchestrator.registry import AgentRegistry
from arc_orchestrator.runtime import OrchestratorRuntime
from arc_orchestrator.state import AgentStateStore


ARC_URL = "http://arc.test"
RECIPES_DIR = Path(__file__).resolve().parents[1] / "recipes"
AGENTS_DIR = Path(__file__).resolve().parents[1] / "agents"


# ── Schema / loader validation ────────────────────────────────────────


def _write_yaml(path: Path, data: dict) -> Path:
    path.write_text(yaml.safe_dump(data, sort_keys=False))
    return path


def test_all_shipped_recipes_validate() -> None:
    """Every bundled recipe YAML must pass validation on import."""
    for path in sorted(RECIPES_DIR.glob("*.yaml")):
        spec = load_recipe(path)
        assert validate_recipe(spec) == [], f"{path.name} failed validation"
        assert spec.steps, f"{path.name} has no steps"
        assert spec.arc_enabled, f"{path.name} should have arc enabled"


def test_load_recipe_rejects_bad_memref(tmp_path: Path) -> None:
    bad = {
        "name": "bad",
        "steps": [
            {"name": "a", "prompt": "x", "arc": {"memrefs": ["b"]}},
            {"name": "b", "prompt": "y"},
        ],
    }
    with pytest.raises(RecipeError, match="unknown/forward step"):
        load_recipe(_write_yaml(tmp_path / "r.yaml", bad))


def test_load_recipe_rejects_duplicate_step_name(tmp_path: Path) -> None:
    bad = {
        "name": "dup",
        "steps": [
            {"name": "a", "prompt": "x"},
            {"name": "a", "prompt": "y"},
        ],
    }
    with pytest.raises(RecipeError, match="duplicated"):
        load_recipe(_write_yaml(tmp_path / "r.yaml", bad))


def test_load_recipe_rejects_bad_memref_strategy(tmp_path: Path) -> None:
    bad = {
        "name": "strat",
        "steps": [{"name": "a", "prompt": "x"}],
        "arc": {"memref_strategy": "nonsense"},
    }
    with pytest.raises(RecipeError, match="memref_strategy"):
        load_recipe(_write_yaml(tmp_path / "r.yaml", bad))


def test_settle_requires_amount(tmp_path: Path) -> None:
    bad = {
        "name": "s",
        "steps": [{"name": "a", "prompt": "x"}],
        "arc": {"settle_on_complete": True, "settlement_amount_sats": 0},
    }
    with pytest.raises(RecipeError, match="settlement_amount_sats"):
        load_recipe(_write_yaml(tmp_path / "r.yaml", bad))


# ── memref resolution ─────────────────────────────────────────────────


def _spec(strategy: str) -> RecipeSpec:
    return RecipeSpec(
        name="t",
        description="",
        parameters=[],
        arc_enabled=True,
        arc_agent=None,
        settle_on_complete=False,
        settlement_amount_sats=0,
        memref_strategy=strategy,
        inscription=False,
        steps=[],
    )


def _step(name: str, memrefs=None) -> RecipeStep:
    return RecipeStep(name=name, prompt="x", action_label=name, memrefs=memrefs or [])


def _exec(name, rid) -> "StepExecution":  # type: ignore[name-defined]
    from arc_orchestrator.recipe_middleware import StepExecution

    return StepExecution(name=name, action_label=name, prompt="x", ihash="00" * 32, record_id=rid)


def test_full_chain_strategy() -> None:
    spec = _spec("full_chain")
    prior = [_exec("a", "r1"), _exec("b", "r2")]
    assert resolve_memrefs(spec, _step("c"), prior) == ["r1", "r2"]


def test_previous_only_strategy() -> None:
    spec = _spec("previous_only")
    prior = [_exec("a", "r1"), _exec("b", "r2")]
    assert resolve_memrefs(spec, _step("c"), prior) == ["r2"]


def test_none_strategy() -> None:
    spec = _spec("none")
    prior = [_exec("a", "r1"), _exec("b", "r2")]
    assert resolve_memrefs(spec, _step("c"), prior) == []


def test_explicit_step_memrefs_override_strategy() -> None:
    spec = _spec("none")  # strategy says none
    prior = [_exec("a", "r1"), _exec("b", "r2")]
    # Explicit list should still resolve.
    assert resolve_memrefs(spec, _step("c", memrefs=["a"]), prior) == ["r1"]


# ── ihash determinism / idempotency ───────────────────────────────────


def test_ihash_deterministic() -> None:
    s = _step("a")
    h1 = compute_ihash(s, "hello", {"topic": "x"})
    h2 = compute_ihash(s, "hello", {"topic": "x"})
    assert h1 == h2


def test_ihash_changes_with_inputs() -> None:
    s = _step("a")
    h1 = compute_ihash(s, "hello", {"topic": "x"})
    h2 = compute_ihash(s, "hello", {"topic": "y"})
    assert h1 != h2


# ── End-to-end runner (dry-run path) ──────────────────────────────────


async def test_runner_dry_run_executes_all_steps(tmp_path: Path) -> None:
    registry = RecipeRegistry(RECIPES_DIR)
    registry.load()
    runner = RecipeRunner(
        registry=registry, arc_api_url=ARC_URL, dry_run=True,
    )
    run = runner.submit("arc-deep-research", {"topic": "bitcoin"})
    # Wait for the background task to finish.
    for _ in range(50):
        if run.status in ("completed", "failed"):
            break
        await asyncio.sleep(0.01)
    assert run.status == "completed", run.error
    assert run.dry_run is True
    assert len(run.steps) == 4
    for s in run.steps:
        assert s.status in ("ok", "skipped")
        assert s.record_id is not None
        assert s.ihash
        assert s.ohash  # capture_output_hash defaults true
    # Chain head moves forward through the run.
    assert run.chain_head_after == run.steps[-1].record_id


async def test_runner_missing_required_param_rejected(tmp_path: Path) -> None:
    registry = RecipeRegistry(RECIPES_DIR)
    registry.load()
    runner = RecipeRunner(
        registry=registry, arc_api_url=ARC_URL, dry_run=True,
    )
    with pytest.raises(RecipeError, match="missing required parameters"):
        runner.submit("arc-deep-research", {})


async def test_runner_unknown_recipe_rejected(tmp_path: Path) -> None:
    registry = RecipeRegistry(RECIPES_DIR)
    registry.load()
    runner = RecipeRunner(
        registry=registry, arc_api_url=ARC_URL, dry_run=True,
    )
    with pytest.raises(RecipeError, match="unknown recipe"):
        runner.submit("nonexistent", {})


# ── Idempotency: re-running same inputs caches ihash → record_id ─────


async def test_idempotency_within_run_shares_record(tmp_path: Path) -> None:
    """If a step is retried with the same ihash, the cached record_id is reused
    and the step is marked skipped."""
    calls: list[str] = []

    async def repeating_executor(step, ctx):
        calls.append(step.name)
        return f"output-{step.name}"

    # Construct a synthetic recipe with a duplicate step-name via manual spec.
    bad = {
        "name": "dup-prompt-retry",
        "steps": [
            {"name": "first", "prompt": "fixed prompt"},
            {"name": "second", "prompt": "fixed prompt"},
        ],
        "arc": {"memref_strategy": "full_chain"},
    }
    p = tmp_path / "r.yaml"
    p.write_text(yaml.safe_dump(bad, sort_keys=False))

    # Monkey-patch compute_ihash so two different steps hash identically —
    # simulating a retry scenario in-process.
    from arc_orchestrator import recipe_middleware as rm

    original = rm.compute_ihash
    try:
        rm.compute_ihash = lambda step, prompt, ctx: "c" * 64  # type: ignore
        reg = RecipeRegistry(tmp_path)
        reg.load()
        runner = RecipeRunner(
            registry=reg,
            arc_api_url=ARC_URL,
            dry_run=True,
            step_executor=repeating_executor,
        )
        run = runner.submit("dup-prompt-retry", {})
        for _ in range(50):
            if run.status in ("completed", "failed"):
                break
            await asyncio.sleep(0.01)
        assert run.status == "completed"
        # First step is stored; second is cached / skipped.
        assert run.steps[0].cached is False
        assert run.steps[1].cached is True
        assert run.steps[1].status == "skipped"
        assert run.steps[0].record_id == run.steps[1].record_id
    finally:
        rm.compute_ihash = original


# ── Non-dry-run path with mocked ARC backend ──────────────────────────


@respx.mock
async def test_runner_posts_to_arc_backend(tmp_path: Path) -> None:
    # Stub ARC endpoints so the runner can walk a real HTTP path.
    respx.get(f"{ARC_URL}/records").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": "h" * 64,
                    "record": {
                        "agent": {"alias": "arc-deep-research"},
                        "ts": "2026-01-01T00:00:00+00:00",
                    },
                }
            ],
        )
    )
    counter = {"n": 0}

    def _action(request):
        counter["n"] += 1
        return httpx.Response(200, json={"id": f"{counter['n']:064x}", "record": {}})

    respx.post(f"{ARC_URL}/action").mock(side_effect=_action)
    respx.post(f"{ARC_URL}/settle").mock(
        return_value=httpx.Response(200, json={"id": "s" * 64, "preimage": "pre"})
    )
    respx.get(f"{ARC_URL}/inscription/{'0' * 63 + '4'}").mock(
        return_value=httpx.Response(200, json={"command": "ord wallet inscribe ..."})
    )

    async def fake_executor(step, ctx):
        return f"output for {step.name}"

    registry = RecipeRegistry(RECIPES_DIR)
    registry.load()
    runner = RecipeRunner(
        registry=registry,
        arc_api_url=ARC_URL,
        dry_run=False,
        step_executor=fake_executor,
    )
    run = runner.submit("arc-deep-research", {"topic": "x"})
    for _ in range(100):
        if run.status in ("completed", "failed"):
            break
        await asyncio.sleep(0.01)
    assert run.status == "completed", run.error
    assert not run.dry_run
    assert run.chain_head_before == "h" * 64
    # Four action calls for the four steps.
    assert counter["n"] == 4
    # Settlement configured (500 sats) and succeeded.
    assert run.settlement_id == "s" * 64
    assert run.settlement_sats == 500


# ── Provenance report ─────────────────────────────────────────────────


async def test_provenance_report_renders(tmp_path: Path) -> None:
    registry = RecipeRegistry(RECIPES_DIR)
    registry.load()
    runner = RecipeRunner(
        registry=registry, arc_api_url=ARC_URL, dry_run=True,
    )
    run = runner.submit("arc-deep-research", {"topic": "y"})
    for _ in range(50):
        if run.status in ("completed", "failed"):
            break
        await asyncio.sleep(0.01)
    report = build_report(run, registry.get("arc-deep-research"))
    assert report["recipe"] == "arc-deep-research"
    assert report["status"] == "completed"
    assert len(report["steps"]) == 4
    assert report["dag_ascii"]  # non-empty
    assert "ARC Provenance Report" in report["summary_text"]
    assert report["validation"]["verified"] is True


def test_render_dag_ascii_empty() -> None:
    assert render_dag_ascii([]) == "(empty)"


# ── HTTP surface ──────────────────────────────────────────────────────


def _build_runtime(tmp_path: Path) -> OrchestratorRuntime:
    state = AgentStateStore(tmp_path / "state.json")
    bridge = GooseBridge(
        goose_bin="goose",
        arc_api_url=ARC_URL,
        arc_mcp_command="arc-mcp",
        dry_run=True,
    )
    registry = AgentRegistry(AGENTS_DIR)
    return OrchestratorRuntime(
        registry=registry, bridge=bridge, state=state, arc_api_url=ARC_URL,
    )


def test_http_list_recipes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARC_ORCH_DRY_RUN", "true")
    monkeypatch.setenv("ARC_API_URL", ARC_URL)
    rt = _build_runtime(tmp_path)
    runner = build_runner_from_env(dry_run=True)
    app = create_app(runtime=rt, recipe_runner=runner)
    with TestClient(app) as client:
        r = client.get("/recipes")
        assert r.status_code == 200
        names = {rec["name"] for rec in r.json()}
        # All 5 shipped recipes present.
        assert {
            "arc-deep-research",
            "arc-code-review",
            "arc-legal-draft",
            "arc-data-analysis",
            "arc-content-pipeline",
        } <= names


def test_http_run_and_poll_recipe(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ARC_ORCH_DRY_RUN", "true")
    monkeypatch.setenv("ARC_API_URL", ARC_URL)
    rt = _build_runtime(tmp_path)
    runner = build_runner_from_env(dry_run=True)
    app = create_app(runtime=rt, recipe_runner=runner)
    with TestClient(app) as client:
        r = client.post(
            "/recipe/run",
            json={"recipe": "arc-deep-research", "params": {"topic": "ln"}},
        )
        assert r.status_code == 200
        run_id = r.json()["run_id"]

        # Poll until completed.
        for _ in range(200):
            rs = client.get(f"/recipe/run/{run_id}")
            assert rs.status_code == 200
            if rs.json()["status"] in ("completed", "failed"):
                break
        assert rs.json()["status"] == "completed"

        rep = client.get(f"/recipe/run/{run_id}/report")
        assert rep.status_code == 200
        body = rep.json()
        assert body["run_id"] == run_id
        assert len(body["steps"]) == 4


def test_http_run_rejects_missing_params(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ARC_ORCH_DRY_RUN", "true")
    monkeypatch.setenv("ARC_API_URL", ARC_URL)
    rt = _build_runtime(tmp_path)
    runner = build_runner_from_env(dry_run=True)
    app = create_app(runtime=rt, recipe_runner=runner)
    with TestClient(app) as client:
        r = client.post(
            "/recipe/run", json={"recipe": "arc-deep-research", "params": {}}
        )
        assert r.status_code == 400


def test_http_unknown_run_404(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARC_ORCH_DRY_RUN", "true")
    monkeypatch.setenv("ARC_API_URL", ARC_URL)
    rt = _build_runtime(tmp_path)
    runner = build_runner_from_env(dry_run=True)
    app = create_app(runtime=rt, recipe_runner=runner)
    with TestClient(app) as client:
        assert client.get("/recipe/run/deadbeef").status_code == 404
        assert client.get("/recipe/run/deadbeef/report").status_code == 404
