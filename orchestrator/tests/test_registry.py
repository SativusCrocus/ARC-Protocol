"""Tests for the agent YAML registry."""

from __future__ import annotations

from pathlib import Path

import pytest

from arc_orchestrator.registry import AgentRegistry, AgentSpec

AGENTS_DIR = Path(__file__).resolve().parents[1] / "agents"


def test_all_10_agents_load() -> None:
    reg = AgentRegistry(AGENTS_DIR)
    specs = reg.load()
    assert len(specs) == 10

    names = {s.agent_name for s in specs}
    expected = {
        "arc-deep-research",
        "arc-codegen",
        "arc-defi-trader",
        "arc-legal",
        "arc-design",
        "arc-support",
        "arc-compliance",
        "arc-data",
        "arc-content",
        "arc-orchestrator",
    }
    assert names == expected


def test_registry_buckets_by_trigger() -> None:
    reg = AgentRegistry(AGENTS_DIR)
    reg.load()
    on_demand = {s.agent_name for s in reg.on_demand()}
    scheduled = {s.agent_name for s in reg.scheduled()}
    webhook = {s.agent_name for s in reg.webhook()}

    assert "arc-deep-research" in on_demand
    assert "arc-compliance" in scheduled
    assert "arc-support" in webhook
    # no overlap
    assert on_demand.isdisjoint(scheduled)
    assert on_demand.isdisjoint(webhook)


def test_meta_agent_identified() -> None:
    reg = AgentRegistry(AGENTS_DIR)
    reg.load()
    meta = reg.meta()
    assert meta is not None
    assert meta.agent_name == "arc-orchestrator"
    assert meta.is_meta
    assert "arc-deep-research" in meta.child_agents


def test_system_prompts_are_non_trivial() -> None:
    reg = AgentRegistry(AGENTS_DIR)
    for spec in reg.load():
        assert len(spec.system_prompt) > 200, spec.agent_name
        assert "arc_" in spec.system_prompt, f"{spec.agent_name} must mention MCP tools"


def test_scheduled_requires_cron(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text(
        "agent_name: bad\ndisplay_name: Bad\nrole: x\ntrigger: scheduled\n"
        "system_prompt: |\n  hi\n"
    )
    with pytest.raises(ValueError, match="schedule"):
        AgentSpec.from_file(bad)


def test_env_substitution(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARC_DEFAULT_PROVIDER", "anthropic/claude-sonnet-4")
    f = tmp_path / "sub.yaml"
    f.write_text(
        "agent_name: sub\ndisplay_name: Sub\nrole: r\ntrigger: on_demand\n"
        "provider: ${ARC_DEFAULT_PROVIDER:-ollama/llama3.2}\n"
        "system_prompt: |\n  arc_keygen first\n"
    )
    spec = AgentSpec.from_file(f)
    assert spec.provider == "anthropic/claude-sonnet-4"
