"""Orchestrator runtime — schedules agents, dispatches tasks, streams events.

This replaces the cron-based simulated orchestrator. Each dispatch spawns
a real (short-lived) Goose session via :class:`GooseBridge`. The ARC MCP
server wired into the session is what produces the genuine signed ARC
records — the runtime itself does not mint records, it only attests the
dispatch via the meta-agent when one is configured.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from .goose_bridge import GooseBridge, GooseResult
from .registry import AgentRegistry, AgentSpec
from .state import AgentStateStore

logger = logging.getLogger(__name__)

_HEX64_RE = re.compile(r"\b[0-9a-fA-F]{64}\b")


@dataclass
class DispatchResult:
    agent: str
    task: str
    ok: bool
    started_at: float
    finished_at: float
    dry_run: bool
    goose: dict[str, Any]
    extracted_record_ids: list[str]
    new_head: str | None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ActivityEvent:
    kind: str  # "dispatch.started" | "dispatch.finished" | "schedule.tick" | "error"
    ts: float
    agent: str | None
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


Listener = Callable[[ActivityEvent], Awaitable[None] | None]


class OrchestratorRuntime:
    """Top-level orchestrator: holds the registry, scheduler, and activity log."""

    def __init__(
        self,
        *,
        registry: AgentRegistry,
        bridge: GooseBridge,
        state: AgentStateStore,
        arc_api_url: str,
        activity_capacity: int = 200,
    ):
        self.registry = registry
        self.bridge = bridge
        self.state = state
        self.arc_api_url = arc_api_url.rstrip("/")
        self._activity: deque[ActivityEvent] = deque(maxlen=activity_capacity)
        self._listeners: list[Listener] = []
        self._listeners_lock = asyncio.Lock()
        self._scheduler: Any | None = None  # APScheduler AsyncIOScheduler
        self._http: httpx.AsyncClient | None = None

    # ── lifecycle ───────────────────────────────────────────────────

    async def start(self) -> None:
        self.registry.load()
        self._http = httpx.AsyncClient(base_url=self.arc_api_url, timeout=15.0)
        self._start_scheduler()
        logger.info(
            "runtime started: %d agents loaded, goose_available=%s, dry_run=%s",
            len(self.registry.all()),
            self.bridge.goose_available(),
            self.bridge.dry_run,
        )

    async def stop(self) -> None:
        if self._scheduler is not None:
            try:
                self._scheduler.shutdown(wait=False)
            except Exception:
                pass
            self._scheduler = None
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    # ── activity stream ─────────────────────────────────────────────

    def activity(self, limit: int | None = None) -> list[ActivityEvent]:
        items = list(self._activity)
        if limit is not None:
            items = items[-limit:]
        return items

    async def subscribe(self, listener: Listener) -> None:
        async with self._listeners_lock:
            self._listeners.append(listener)

    async def unsubscribe(self, listener: Listener) -> None:
        async with self._listeners_lock:
            if listener in self._listeners:
                self._listeners.remove(listener)

    async def _emit(self, event: ActivityEvent) -> None:
        self._activity.append(event)
        async with self._listeners_lock:
            listeners = list(self._listeners)
        for fn in listeners:
            try:
                result = fn(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                logger.exception("activity listener raised")

    # ── scheduler ───────────────────────────────────────────────────

    def _start_scheduler(self) -> None:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.cron import CronTrigger
        except ImportError:
            logger.warning("apscheduler not installed — scheduled agents will not fire")
            return

        scheduled = self.registry.scheduled()
        if not scheduled:
            logger.info("no scheduled agents registered")
            return

        scheduler = AsyncIOScheduler()
        for spec in scheduled:
            try:
                trigger = CronTrigger.from_crontab(spec.schedule)  # type: ignore[arg-type]
            except Exception as exc:
                logger.error("bad cron %s for %s: %s", spec.schedule, spec.agent_name, exc)
                continue

            async def _fire(agent_name: str = spec.agent_name) -> None:
                try:
                    await self.dispatch(
                        agent_name,
                        task=f"Scheduled run at {int(time.time())}. Execute your duty cycle as specified in the system prompt.",
                        source="schedule",
                    )
                except Exception:
                    logger.exception("scheduled dispatch for %s failed", agent_name)

            scheduler.add_job(
                _fire,
                trigger=trigger,
                id=f"arc-sched-{spec.agent_name}",
                replace_existing=True,
            )
            logger.info("scheduled %s on %s", spec.agent_name, spec.schedule)

        scheduler.start()
        self._scheduler = scheduler

    # ── ARC lookups ─────────────────────────────────────────────────

    async def _lookup_head(self, pubkey: str) -> str | None:
        if not self._http:
            return None
        try:
            resp = await self._http.get(f"/chain/{pubkey}")
            if resp.status_code != 200:
                return None
            data = resp.json()
            if isinstance(data, list) and data:
                last = data[-1]
                return last.get("id") if isinstance(last, dict) else None
        except Exception as exc:
            logger.debug("chain lookup for %s failed: %s", pubkey[:10], exc)
        return None

    # ── dispatch ────────────────────────────────────────────────────

    async def dispatch(
        self,
        agent_name: str,
        *,
        task: str,
        source: str = "api",
    ) -> DispatchResult:
        spec = self.registry.get(agent_name)
        if spec is None:
            raise ValueError(f"unknown agent: {agent_name}")

        # Resolve prev record: prefer stored head, fall back to live lookup by pubkey.
        prev_record = self.state.head(agent_name)
        if prev_record is None:
            pub = self.state.pubkey(agent_name)
            if pub:
                prev_record = await self._lookup_head(pub)

        await self._emit(ActivityEvent(
            kind="dispatch.started",
            ts=time.time(),
            agent=agent_name,
            payload={"source": source, "task": task[:200], "prev": prev_record},
        ))

        extra_context = {"source": source}
        try:
            goose_result: GooseResult = await self.bridge.dispatch(
                spec, task=task, prev_record=prev_record, extra_context=extra_context,
            )
        except Exception as exc:
            logger.exception("bridge dispatch crashed for %s", agent_name)
            err = DispatchResult(
                agent=agent_name, task=task, ok=False,
                started_at=time.time(), finished_at=time.time(),
                dry_run=self.bridge.dry_run, goose={}, extracted_record_ids=[],
                new_head=None, error=str(exc),
            )
            await self._emit(ActivityEvent(
                kind="dispatch.finished", ts=time.time(),
                agent=agent_name, payload=err.to_dict(),
            ))
            return err

        extracted = _extract_record_ids(goose_result.stdout)
        new_head = extracted[-1] if extracted else None

        # Verify against ARC backend before persisting (defensive; skip in dry-run).
        if new_head and not goose_result.dry_run:
            verified = await self._verify_record(new_head)
            if not verified:
                new_head = None

        if new_head:
            self.state.update(agent_name, prev_record=new_head)

        result = DispatchResult(
            agent=agent_name,
            task=task,
            ok=goose_result.ok,
            started_at=goose_result.started_at,
            finished_at=goose_result.finished_at,
            dry_run=goose_result.dry_run,
            goose=goose_result.to_dict(),
            extracted_record_ids=extracted,
            new_head=new_head,
            error=goose_result.error,
        )

        await self._emit(ActivityEvent(
            kind="dispatch.finished",
            ts=time.time(),
            agent=agent_name,
            payload={
                "ok": result.ok,
                "dry_run": result.dry_run,
                "new_head": new_head,
                "extracted_count": len(extracted),
                "error": result.error,
            },
        ))
        return result

    async def _verify_record(self, record_id: str) -> bool:
        if not self._http:
            return False
        try:
            resp = await self._http.get(f"/record/{record_id}")
            return resp.status_code == 200
        except Exception:
            return False

    # ── meta-agent routing ──────────────────────────────────────────

    async def meta_route(self, task: str) -> DispatchResult:
        """Dispatch via the meta-agent, letting it pick the child.

        The meta-agent's system prompt instructs it to produce a dispatch
        attestation record. For now the runtime runs the meta session and
        returns its result — subsequent child fan-out is left to the
        meta-agent's own tool calls.
        """
        meta = self.registry.meta()
        if meta is None:
            raise ValueError("no meta-agent configured (set is_meta: true on an agent)")
        return await self.dispatch(meta.agent_name, task=task, source="meta")

    # ── history (per-agent) ─────────────────────────────────────────

    async def agent_history(self, agent_name: str, limit: int = 25) -> list[dict[str, Any]]:
        spec = self.registry.get(agent_name)
        if spec is None:
            raise ValueError(f"unknown agent: {agent_name}")
        if not self._http:
            return []
        # If we know the pubkey, pull their chain; else return local activity.
        pub = self.state.pubkey(agent_name)
        if pub:
            try:
                resp = await self._http.get(f"/chain/{pub}")
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        return data[-limit:]
            except Exception as exc:
                logger.debug("history lookup failed for %s: %s", agent_name, exc)
        return [
            e.to_dict() for e in self._activity
            if e.agent == agent_name
        ][-limit:]

    def known_pubkey(self, agent_name: str) -> str | None:
        return self.state.pubkey(agent_name)


# ── helpers ─────────────────────────────────────────────────────────


def _extract_record_ids(text: str) -> list[str]:
    """Scrape 64-char hex ids that appear in Goose session output.

    This is best-effort. The MCP server returns tool results as JSON which
    embeds record_id / id fields — the regex catches them without needing
    a strict parser. We de-duplicate while preserving order.
    """
    if not text:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for match in _HEX64_RE.findall(text):
        lowered = match.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        out.append(lowered)
    return out


# ── factory ─────────────────────────────────────────────────────────


def build_runtime_from_env(
    agents_dir: Path | None = None,
    state_path: Path | None = None,
) -> OrchestratorRuntime:
    arc_api_url = os.environ.get("ARC_API_URL", "http://localhost:8000")
    dry_run = os.environ.get("ARC_ORCH_DRY_RUN", "").lower() in {"1", "true", "yes"}
    goose_bin = os.environ.get("ARC_GOOSE_BIN", "goose")
    mcp_cmd = os.environ.get("ARC_MCP_COMMAND", "arc-mcp")
    timeout = float(os.environ.get("ARC_ORCH_TIMEOUT", "300"))

    env_dir = os.environ.get("ARC_ORCH_AGENTS_DIR")
    default_dir = Path(env_dir) if env_dir else Path(__file__).resolve().parents[2] / "agents"
    default_state = Path(os.environ.get("ARC_ORCH_STATE", str(default_dir.parent / "state.json")))

    registry = AgentRegistry(agents_dir or default_dir)
    bridge = GooseBridge(
        goose_bin=goose_bin,
        arc_api_url=arc_api_url,
        arc_mcp_command=mcp_cmd,
        timeout_seconds=timeout,
        dry_run=dry_run,
    )
    state = AgentStateStore(state_path or default_state)
    return OrchestratorRuntime(
        registry=registry,
        bridge=bridge,
        state=state,
        arc_api_url=arc_api_url,
    )
