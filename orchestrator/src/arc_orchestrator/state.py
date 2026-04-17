"""Per-agent state persistence (chain heads, pubkeys).

The runtime stores the most recent ARC record id per agent so that the
next Goose session can pass it as `prev`, maintaining chain continuity
across short-lived sessions.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class AgentStateStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._cache: dict[str, dict[str, Any]] = self._read()

    def _read(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text())
            if isinstance(data, dict):
                return data
        except Exception as exc:
            logger.warning("failed to read agent state at %s: %s", self.path, exc)
        return {}

    def _flush(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self._cache, indent=2, sort_keys=True))
        except Exception as exc:
            logger.warning("failed to persist agent state: %s", exc)

    def get(self, agent_name: str) -> dict[str, Any]:
        with self._lock:
            return dict(self._cache.get(agent_name, {}))

    def head(self, agent_name: str) -> str | None:
        return self.get(agent_name).get("prev_record")

    def pubkey(self, agent_name: str) -> str | None:
        return self.get(agent_name).get("pubkey")

    def update(self, agent_name: str, **fields: Any) -> None:
        with self._lock:
            entry = dict(self._cache.get(agent_name, {}))
            entry.update({k: v for k, v in fields.items() if v is not None})
            self._cache[agent_name] = entry
            self._flush()

    def all(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {k: dict(v) for k, v in self._cache.items()}
