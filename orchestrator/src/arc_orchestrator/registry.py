"""Agent YAML loader + registry."""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_ENV_SUB = re.compile(r"\$\{([A-Z0-9_]+)(?::-(.*?))?\}")

_ALLOWED_TRIGGERS = {"on_demand", "scheduled", "webhook"}


def _expand(value: Any) -> Any:
    """Recursively expand ${VAR:-default} patterns in strings."""
    if isinstance(value, str):
        def sub(match: re.Match[str]) -> str:
            name = match.group(1)
            default = match.group(2) or ""
            return os.environ.get(name, default)
        return _ENV_SUB.sub(sub, value)
    if isinstance(value, list):
        return [_expand(v) for v in value]
    if isinstance(value, dict):
        return {k: _expand(v) for k, v in value.items()}
    return value


@dataclass(frozen=True)
class AgentSpec:
    agent_name: str
    display_name: str
    role: str
    color: str
    trigger: str
    provider: str
    system_prompt: str
    mcp_servers: tuple[str, ...] = ()
    tools: tuple[str, ...] = ()
    schedule: str | None = None
    webhook_path: str | None = None
    is_meta: bool = False
    child_agents: tuple[str, ...] = ()
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_file(cls, path: Path) -> "AgentSpec":
        data = yaml.safe_load(path.read_text())
        if not isinstance(data, dict):
            raise ValueError(f"{path.name}: top-level YAML must be a mapping")
        data = _expand(data)

        def req(key: str) -> Any:
            if key not in data:
                raise ValueError(f"{path.name}: missing required field '{key}'")
            return data[key]

        trigger = str(req("trigger"))
        if trigger not in _ALLOWED_TRIGGERS:
            raise ValueError(
                f"{path.name}: trigger must be one of {_ALLOWED_TRIGGERS}, got {trigger!r}"
            )

        schedule = data.get("schedule")
        if trigger == "scheduled" and not schedule:
            raise ValueError(f"{path.name}: scheduled trigger requires 'schedule' (cron)")

        return cls(
            agent_name=str(req("agent_name")),
            display_name=str(req("display_name")),
            role=str(req("role")),
            color=str(data.get("color", "#F97316")),
            trigger=trigger,
            provider=str(data.get("provider", "ollama/llama3.2")),
            system_prompt=str(req("system_prompt")).strip(),
            mcp_servers=tuple(data.get("mcp_servers", []) or []),
            tools=tuple(data.get("tools", []) or []),
            schedule=str(schedule) if schedule else None,
            webhook_path=data.get("webhook_path"),
            is_meta=bool(data.get("is_meta", False)),
            child_agents=tuple(data.get("child_agents", []) or []),
            raw=data,
        )


class AgentRegistry:
    """In-memory registry of agent specs loaded from a directory of YAMLs."""

    def __init__(self, agents_dir: Path):
        self.agents_dir = agents_dir
        self._by_name: dict[str, AgentSpec] = {}

    def load(self) -> list[AgentSpec]:
        self._by_name.clear()
        if not self.agents_dir.exists():
            logger.warning("agents dir %s does not exist", self.agents_dir)
            return []
        loaded: list[AgentSpec] = []
        for path in sorted(self.agents_dir.glob("*.yaml")):
            try:
                spec = AgentSpec.from_file(path)
            except Exception as exc:
                logger.error("failed to load %s: %s", path.name, exc)
                continue
            if spec.agent_name in self._by_name:
                logger.error(
                    "duplicate agent_name %s in %s (ignored)",
                    spec.agent_name,
                    path.name,
                )
                continue
            self._by_name[spec.agent_name] = spec
            loaded.append(spec)
        logger.info("loaded %d agent specs from %s", len(loaded), self.agents_dir)
        return loaded

    def all(self) -> list[AgentSpec]:
        return list(self._by_name.values())

    def get(self, agent_name: str) -> AgentSpec | None:
        return self._by_name.get(agent_name)

    def scheduled(self) -> list[AgentSpec]:
        return [s for s in self._by_name.values() if s.trigger == "scheduled"]

    def on_demand(self) -> list[AgentSpec]:
        return [s for s in self._by_name.values() if s.trigger == "on_demand"]

    def webhook(self) -> list[AgentSpec]:
        return [s for s in self._by_name.values() if s.trigger == "webhook"]

    def meta(self) -> AgentSpec | None:
        for s in self._by_name.values():
            if s.is_meta:
                return s
        return None
