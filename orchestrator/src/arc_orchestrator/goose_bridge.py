"""Bridge that spawns short-lived Goose sessions.

A Goose session is invoked per-task (not per-agent). Each spawn:
  1. writes a temporary Goose recipe YAML with the agent's system prompt,
     provider, and MCP server config pointing at arc-mcp
  2. execs `goose run --recipe <file> --instructions <file>` in a subprocess
  3. captures stdout/stderr and returns structured output

If the Goose CLI is not on PATH, or if the caller sets ``dry_run=True``,
the bridge returns a synthetic result so the runtime stays usable during
development and in CI without Goose installed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .registry import AgentSpec

logger = logging.getLogger(__name__)

DEFAULT_GOOSE_BIN = "goose"
DEFAULT_TIMEOUT_SECONDS = 300.0


class GooseUnavailableError(RuntimeError):
    """Raised when the Goose CLI isn't installed and dry_run is disabled."""


@dataclass
class GooseResult:
    agent: str
    task: str
    started_at: float
    finished_at: float
    ok: bool
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    dry_run: bool = False
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_seconds(self) -> float:
        return max(0.0, self.finished_at - self.started_at)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "task": self.task,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_seconds": self.duration_seconds,
            "ok": self.ok,
            "exit_code": self.exit_code,
            "dry_run": self.dry_run,
            "error": self.error,
            "stdout": self.stdout[-4000:],
            "stderr": self.stderr[-2000:],
            "extra": self.extra,
        }


class GooseBridge:
    """Spawns Goose subprocesses for per-task agent sessions."""

    def __init__(
        self,
        *,
        goose_bin: str = DEFAULT_GOOSE_BIN,
        arc_api_url: str = "http://localhost:8000",
        arc_mcp_command: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        dry_run: bool = False,
    ):
        self.goose_bin = goose_bin
        self.arc_api_url = arc_api_url.rstrip("/")
        self.arc_mcp_command = arc_mcp_command or "arc-mcp"
        self.timeout_seconds = timeout_seconds
        self.dry_run = dry_run

    # ── availability ────────────────────────────────────────────────

    def goose_available(self) -> bool:
        return shutil.which(self.goose_bin) is not None

    # ── recipe construction ─────────────────────────────────────────

    def build_recipe(
        self,
        spec: AgentSpec,
        *,
        task: str,
        prev_record: str | None,
        extra_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Construct a Goose recipe dict for this agent/task.

        The exact recipe schema is whatever the installed Goose binary
        accepts — we keep the payload minimal and well-documented so
        it degrades gracefully across versions.
        """
        prompt_header = spec.system_prompt
        if prev_record:
            prompt_header = (
                f"{prompt_header}\n\n"
                f"Chain continuity: your most recent ARC record id is "
                f"`{prev_record}`. Use this as the `prev` argument when you "
                f"call `arc_action`, unless you are creating a fresh genesis."
            )

        mcp_entry: dict[str, Any] = {
            "type": "stdio",
            "cmd": self.arc_mcp_command,
            "envs": {"ARC_API_URL": self.arc_api_url},
        }

        recipe: dict[str, Any] = {
            "version": "1.0.0",
            "title": f"arc:{spec.agent_name}",
            "description": f"{spec.display_name} — {spec.role}",
            "provider": spec.provider,
            "system_prompt": prompt_header,
            "instructions": task,
            "extensions": {name: mcp_entry for name in spec.mcp_servers},
            "arc": {
                "agent_name": spec.agent_name,
                "display_name": spec.display_name,
                "role": spec.role,
                "prev_record": prev_record,
                "api_url": self.arc_api_url,
            },
        }
        if extra_context:
            recipe["arc"].update(extra_context)
        return recipe

    # ── spawn ───────────────────────────────────────────────────────

    async def dispatch(
        self,
        spec: AgentSpec,
        *,
        task: str,
        prev_record: str | None = None,
        extra_context: dict[str, Any] | None = None,
    ) -> GooseResult:
        started = time.time()
        recipe = self.build_recipe(
            spec, task=task, prev_record=prev_record, extra_context=extra_context
        )

        if self.dry_run or not self.goose_available():
            return self._synthetic_result(
                spec, task, started, recipe,
                reason=(
                    "dry_run mode" if self.dry_run
                    else f"Goose CLI not found on PATH (looked for {self.goose_bin!r})"
                ),
            )

        with tempfile.TemporaryDirectory(prefix="arc-orch-") as tmp:
            tmp_dir = Path(tmp)
            recipe_file = tmp_dir / "recipe.yaml"
            instructions_file = tmp_dir / "instructions.txt"
            recipe_file.write_text(yaml.safe_dump(recipe, sort_keys=False))
            instructions_file.write_text(task)

            env = os.environ.copy()
            env["ARC_API_URL"] = self.arc_api_url
            # Goose recipe config may not universally propagate env; be explicit.

            cmd = [
                self.goose_bin, "run",
                "--recipe", str(recipe_file),
                "--instructions", str(instructions_file),
                "--no-session",
            ]
            logger.info("spawning goose: %s", " ".join(cmd))

            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )
            except FileNotFoundError as exc:
                return GooseResult(
                    agent=spec.agent_name, task=task, started_at=started,
                    finished_at=time.time(), ok=False,
                    error=f"goose binary not executable: {exc}",
                )

            try:
                stdout_b, stderr_b = await asyncio.wait_for(
                    proc.communicate(), timeout=self.timeout_seconds
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                return GooseResult(
                    agent=spec.agent_name, task=task, started_at=started,
                    finished_at=time.time(), ok=False,
                    error=f"goose session exceeded {self.timeout_seconds:.0f}s timeout",
                )

            return GooseResult(
                agent=spec.agent_name,
                task=task,
                started_at=started,
                finished_at=time.time(),
                ok=(proc.returncode == 0),
                stdout=stdout_b.decode("utf-8", "replace"),
                stderr=stderr_b.decode("utf-8", "replace"),
                exit_code=proc.returncode,
            )

    # ── dry-run fallback ────────────────────────────────────────────

    def _synthetic_result(
        self,
        spec: AgentSpec,
        task: str,
        started: float,
        recipe: dict[str, Any],
        *,
        reason: str,
    ) -> GooseResult:
        logger.info("goose dry-run for %s (%s)", spec.agent_name, reason)
        stdout_payload = {
            "dry_run": True,
            "reason": reason,
            "agent": spec.agent_name,
            "task": task,
            "recipe_preview": {
                "title": recipe["title"],
                "provider": recipe["provider"],
                "extensions": list(recipe["extensions"].keys()),
                "prev_record": recipe["arc"]["prev_record"],
            },
            "note": (
                "Install Goose (https://github.com/aaif-goose/goose) and unset "
                "ARC_ORCH_DRY_RUN to run a real session. The ARC MCP server "
                "and this orchestrator runtime are otherwise fully wired."
            ),
        }
        return GooseResult(
            agent=spec.agent_name,
            task=task,
            started_at=started,
            finished_at=time.time(),
            ok=True,
            dry_run=True,
            stdout=json.dumps(stdout_payload, indent=2),
            extra={"reason": reason},
        )
