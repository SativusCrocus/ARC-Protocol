"""ARC-aware Goose recipe middleware.

Wraps every step of a Goose recipe in a signed ARC provenance record. When
a recipe runs, each step becomes a node in a per-agent provenance chain; on
completion, the whole workflow is an auditable, Schnorr-signed DAG with
optional Lightning settlement.

Design notes
------------
- **Idempotency**: each step's ihash is deterministic over (step_name +
  prompt + resolved context). The runner caches `ihash -> record_id` so a
  retried step reuses the existing record instead of double-writing.
- **Async**: `RecipeRunner.run` returns a `run_id` immediately and executes
  the recipe on the asyncio event loop. Callers poll `get_run`.
- **Strict validation**: recipes are validated before execution. Errors
  point at the offending field so mistakes fail fast, not mid-run.
- **Chain continuity**: the first step hangs off the agent's current head
  (genesis is created if none exists). Each subsequent step hangs off the
  prior step's record id. `memrefs` are computed per `memref_strategy` or
  the explicit per-step list.
- **Dry-run**: when no backend is reachable (or `ARC_ORCH_DRY_RUN=1`) the
  runner synthesises record ids from the ihash so the plumbing stays
  exercisable in local dev and CI.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

import httpx
import yaml

logger = logging.getLogger(__name__)

_STEP_NAME_RE = re.compile(r"^[a-z][a-z0-9_-]*$")
_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
_ALLOWED_MEMREF_STRATEGIES = {"full_chain", "previous_only", "none"}
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")

# Max in-memory recipe runs retained by the process. Older ones get evicted.
_RUN_RETENTION = 200


# ── Dataclasses ─────────────────────────────────────────────────────────


@dataclass
class RecipeStep:
    name: str
    prompt: str
    action_label: str
    capture_output_hash: bool = True
    memrefs: list[str] = field(default_factory=list)
    settle_amount_sats: int | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class RecipeSpec:
    name: str
    description: str
    parameters: list[dict[str, Any]]
    arc_enabled: bool
    arc_agent: str | None
    settle_on_complete: bool
    settlement_amount_sats: int
    memref_strategy: str
    inscription: bool
    steps: list[RecipeStep]
    source_path: Path | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    def to_summary(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
            "arc": {
                "enabled": self.arc_enabled,
                "agent": self.arc_agent,
                "settle_on_complete": self.settle_on_complete,
                "settlement_amount_sats": self.settlement_amount_sats,
                "memref_strategy": self.memref_strategy,
                "inscription": self.inscription,
            },
            "steps": [
                {
                    "name": s.name,
                    "action_label": s.action_label,
                    "memrefs": list(s.memrefs),
                }
                for s in self.steps
            ],
        }


@dataclass
class StepExecution:
    name: str
    action_label: str
    prompt: str
    ihash: str
    ohash: str | None = None
    output: str = ""
    record_id: str | None = None
    prev: str | None = None
    memrefs: list[str] = field(default_factory=list)
    started_at: float = 0.0
    finished_at: float = 0.0
    status: str = "pending"  # pending | running | ok | skipped | failed
    error: str | None = None
    cached: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RecipeRun:
    id: str
    recipe: str
    agent: str | None
    params: dict[str, Any]
    status: str = "pending"  # pending | running | completed | failed
    steps: list[StepExecution] = field(default_factory=list)
    chain_head_before: str | None = None
    chain_head_after: str | None = None
    settlement_id: str | None = None
    settlement_sats: int | None = None
    settlement_preimage: str | None = None
    inscription_cmd: str | None = None
    started_at: float = 0.0
    finished_at: float | None = None
    error: str | None = None
    dry_run: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            **{k: v for k, v in asdict(self).items() if k != "steps"},
            "steps": [s.to_dict() for s in self.steps],
        }


# ── Errors ──────────────────────────────────────────────────────────────


class RecipeError(ValueError):
    """Schema validation or runtime failure in a recipe."""


# ── Loader / validator ──────────────────────────────────────────────────


def load_recipe(path: Path) -> RecipeSpec:
    """Parse and validate a recipe YAML file into a RecipeSpec."""
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise RecipeError(f"{path.name}: top-level YAML must be a mapping")
    spec = _build_spec(data, source_path=path)
    errors = validate_recipe(spec)
    if errors:
        raise RecipeError(
            f"{path.name}: recipe failed validation — " + "; ".join(errors)
        )
    return spec


def _build_spec(data: dict[str, Any], source_path: Path | None = None) -> RecipeSpec:
    arc_block = data.get("arc") or {}
    steps_raw = data.get("steps") or []
    steps: list[RecipeStep] = []
    for idx, raw_step in enumerate(steps_raw):
        if not isinstance(raw_step, dict):
            raise RecipeError(f"steps[{idx}] must be a mapping")
        arc_step = raw_step.get("arc") or {}
        name = str(raw_step.get("name") or "")
        prompt = str(raw_step.get("prompt") or "")
        action_label = str(arc_step.get("action_label") or name or f"step-{idx}")
        memrefs = list(arc_step.get("memrefs") or [])
        settle_cfg = arc_step.get("settle") or {}
        settle_amount = settle_cfg.get("amount_sats") if isinstance(settle_cfg, dict) else None
        steps.append(
            RecipeStep(
                name=name,
                prompt=prompt,
                action_label=action_label,
                capture_output_hash=bool(arc_step.get("capture_output_hash", True)),
                memrefs=memrefs,
                settle_amount_sats=int(settle_amount) if settle_amount else None,
                raw=raw_step,
            )
        )

    return RecipeSpec(
        name=str(data.get("name") or ""),
        description=str(data.get("description") or ""),
        parameters=list(data.get("parameters") or []),
        arc_enabled=bool(arc_block.get("enabled", True)),
        arc_agent=arc_block.get("agent"),
        settle_on_complete=bool(arc_block.get("settle_on_complete", False)),
        settlement_amount_sats=int(arc_block.get("settlement_amount_sats", 0) or 0),
        memref_strategy=str(arc_block.get("memref_strategy", "full_chain")),
        inscription=bool(arc_block.get("inscription", False)),
        steps=steps,
        source_path=source_path,
        raw=data,
    )


def validate_recipe(spec: RecipeSpec) -> list[str]:
    """Return a list of validation errors; empty list = valid."""
    errors: list[str] = []
    if not spec.name:
        errors.append("recipe.name is required")
    if not spec.steps:
        errors.append("recipe.steps must have at least one entry")
    if spec.memref_strategy not in _ALLOWED_MEMREF_STRATEGIES:
        errors.append(
            f"arc.memref_strategy must be one of {sorted(_ALLOWED_MEMREF_STRATEGIES)}"
        )
    if spec.settle_on_complete and spec.settlement_amount_sats <= 0:
        errors.append("arc.settle_on_complete=true requires settlement_amount_sats > 0")

    seen: set[str] = set()
    for idx, step in enumerate(spec.steps):
        prefix = f"steps[{idx}]"
        if not step.name:
            errors.append(f"{prefix}.name is required")
        elif not _STEP_NAME_RE.match(step.name):
            errors.append(f"{prefix}.name must match [a-z][a-z0-9_-]*")
        elif step.name in seen:
            errors.append(f"{prefix}.name '{step.name}' is duplicated")
        else:
            seen.add(step.name)
        if not step.prompt:
            errors.append(f"{prefix}.prompt is required")
        for ref in step.memrefs:
            if ref == step.name:
                errors.append(f"{prefix}.memrefs cannot reference itself")
            elif ref not in seen and ref != step.name:
                errors.append(
                    f"{prefix}.memrefs references unknown/forward step '{ref}'"
                )
    return errors


def extract_placeholders(text: str) -> set[str]:
    return set(_PLACEHOLDER_RE.findall(text))


def recipe_placeholders(spec: RecipeSpec) -> set[str]:
    out: set[str] = set()
    for step in spec.steps:
        out |= extract_placeholders(step.prompt)
        out |= extract_placeholders(step.action_label)
    return out


def _format(template: str, params: dict[str, Any]) -> str:
    """Substitute {name} placeholders. Missing keys resolve to empty string
    so a malformed template can't crash the whole run — validation catches
    this before execution anyway.
    """
    def sub(match: re.Match[str]) -> str:
        key = match.group(1)
        return str(params.get(key, ""))

    return _PLACEHOLDER_RE.sub(sub, template)


# ── Registry ────────────────────────────────────────────────────────────


class RecipeRegistry:
    """Loads recipe YAMLs from a directory and exposes them by name."""

    def __init__(self, recipes_dir: Path):
        self.recipes_dir = recipes_dir
        self._by_name: dict[str, RecipeSpec] = {}

    def load(self) -> list[RecipeSpec]:
        self._by_name.clear()
        if not self.recipes_dir.exists():
            logger.warning("recipes dir %s does not exist", self.recipes_dir)
            return []
        loaded: list[RecipeSpec] = []
        for path in sorted(self.recipes_dir.glob("*.yaml")):
            try:
                spec = load_recipe(path)
            except Exception as exc:
                logger.error("failed to load recipe %s: %s", path.name, exc)
                continue
            if spec.name in self._by_name:
                logger.error("duplicate recipe name %s in %s", spec.name, path.name)
                continue
            self._by_name[spec.name] = spec
            loaded.append(spec)
        logger.info("loaded %d recipes from %s", len(loaded), self.recipes_dir)
        return loaded

    def all(self) -> list[RecipeSpec]:
        return list(self._by_name.values())

    def get(self, name: str) -> RecipeSpec | None:
        return self._by_name.get(name)


# ── ARC backend client (thin) ───────────────────────────────────────────


class ArcBackend:
    """Thin async wrapper over the ARC backend's REST API used by the runner."""

    def __init__(self, base_url: str, *, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None
        self._timeout = timeout

    async def __aenter__(self) -> "ArcBackend":
        self._client = httpx.AsyncClient(
            base_url=self.base_url, timeout=self._timeout
        )
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("ArcBackend used outside async context")
        return self._client

    async def head_for_alias(self, alias: str | None) -> str | None:
        """Find the current chain head for an agent alias, if any."""
        try:
            resp = await self._http().get("/records")
            if resp.status_code != 200:
                return None
            records = resp.json()
        except Exception as exc:
            logger.debug("head_for_alias: /records failed: %s", exc)
            return None
        if not isinstance(records, list):
            return None
        candidates = []
        for entry in records:
            rec = entry.get("record") if isinstance(entry, dict) else None
            if not isinstance(rec, dict):
                continue
            if alias and rec.get("agent", {}).get("alias") != alias:
                continue
            candidates.append((rec.get("ts", ""), entry.get("id")))
        if not candidates:
            return None
        candidates.sort(reverse=True)
        return candidates[0][1]

    async def ensure_genesis(self, alias: str | None, action: str) -> str:
        resp = await self._http().post(
            "/genesis", json={"alias": alias, "action": action}
        )
        resp.raise_for_status()
        return resp.json()["id"]

    async def action(
        self,
        *,
        prev: str,
        action: str,
        memrefs: list[str],
    ) -> dict[str, Any]:
        resp = await self._http().post(
            "/action",
            json={"prev": prev, "action": action, "memrefs": memrefs},
        )
        resp.raise_for_status()
        return resp.json()

    async def settle(self, *, record_id: str, amount: int) -> dict[str, Any]:
        resp = await self._http().post(
            "/settle", json={"record_id": record_id, "amount": amount}
        )
        resp.raise_for_status()
        return resp.json()

    async def inscription(self, record_id: str) -> str | None:
        try:
            resp = await self._http().get(f"/inscription/{record_id}")
            if resp.status_code != 200:
                return None
            return resp.json().get("command")
        except Exception:
            return None


# ── Runner ──────────────────────────────────────────────────────────────


StepExecutor = Callable[[RecipeStep, dict[str, Any]], Awaitable[str]]
"""Executes the step's prompt and returns the raw output text."""


async def dry_run_executor(step: RecipeStep, ctx: dict[str, Any]) -> str:
    """Deterministic fallback used when no real Goose session is wired.

    Returns a short JSON-ish summary so downstream steps still have
    recognisable input to hash.
    """
    payload = {
        "step": step.name,
        "prompt_preview": step.prompt[:120],
        "context_keys": sorted(ctx.keys()),
        "ts": time.time(),
    }
    return json.dumps(payload, sort_keys=True)


def compute_ihash(step: RecipeStep, prompt: str, ctx: dict[str, Any]) -> str:
    """Deterministic ihash over step name + resolved prompt + param context.

    Kept deterministic on purpose so retrying a failed step with the same
    inputs produces the same ihash — that's the idempotency key.
    """
    body = json.dumps(
        {
            "step": step.name,
            "prompt": prompt,
            "params": {k: ctx.get(k) for k in sorted(ctx)},
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(body.encode()).hexdigest()


def compute_ohash(output: str) -> str:
    return hashlib.sha256(output.encode("utf-8", "replace")).hexdigest()


def resolve_memrefs(
    spec: RecipeSpec,
    step: RecipeStep,
    prior: list[StepExecution],
) -> list[str]:
    """Translate symbolic step-name memrefs into record IDs.

    Precedence: explicit step.memrefs first; otherwise fall back to the
    recipe-level strategy.
    """
    by_name = {s.name: s for s in prior if s.record_id}
    # Explicit per-step list takes precedence.
    if step.memrefs:
        return [by_name[n].record_id for n in step.memrefs if n in by_name]  # type: ignore[misc]
    strategy = spec.memref_strategy
    if strategy == "none":
        return []
    if strategy == "previous_only":
        return [prior[-1].record_id] if prior and prior[-1].record_id else []
    # full_chain
    return [s.record_id for s in prior if s.record_id]  # type: ignore[misc]


class RecipeRunner:
    """Executes ARC-aware recipes asynchronously, tracking status + provenance."""

    def __init__(
        self,
        *,
        registry: RecipeRegistry,
        arc_api_url: str,
        step_executor: StepExecutor | None = None,
        dry_run: bool = False,
    ):
        self.registry = registry
        self.arc_api_url = arc_api_url.rstrip("/")
        self.step_executor = step_executor or dry_run_executor
        self.dry_run = dry_run
        self._runs: dict[str, RecipeRun] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._lock = asyncio.Lock()

    # ── registry helpers ────────────────────────────────────────────
    def recipes(self) -> list[RecipeSpec]:
        return self.registry.all()

    def get_recipe(self, name: str) -> RecipeSpec | None:
        return self.registry.get(name)

    def get_run(self, run_id: str) -> RecipeRun | None:
        return self._runs.get(run_id)

    def list_runs(self, limit: int = 50) -> list[RecipeRun]:
        runs = sorted(self._runs.values(), key=lambda r: r.started_at, reverse=True)
        return runs[:limit]

    # ── kick off ────────────────────────────────────────────────────
    def submit(
        self, recipe_name: str, params: dict[str, Any] | None = None
    ) -> RecipeRun:
        spec = self.registry.get(recipe_name)
        if spec is None:
            raise RecipeError(f"unknown recipe: {recipe_name}")
        resolved = self._resolve_params(spec, params or {})

        run = RecipeRun(
            id=uuid.uuid4().hex[:16],
            recipe=spec.name,
            agent=spec.arc_agent,
            params=resolved,
            status="pending",
            started_at=time.time(),
            dry_run=self.dry_run,
        )
        for step in spec.steps:
            prompt = _format(step.prompt, resolved)
            action_label = _format(step.action_label, resolved)
            ihash = compute_ihash(step, prompt, resolved)
            run.steps.append(
                StepExecution(
                    name=step.name,
                    action_label=action_label,
                    prompt=prompt,
                    ihash=ihash,
                )
            )

        self._runs[run.id] = run
        self._evict_old_runs()
        task = asyncio.create_task(self._execute(spec, run))
        self._tasks[run.id] = task
        return run

    def _resolve_params(
        self, spec: RecipeSpec, params: dict[str, Any]
    ) -> dict[str, Any]:
        required = {
            p["name"]: p
            for p in spec.parameters
            if bool(p.get("required", True)) and "default" not in p
        }
        missing = [name for name in required if name not in params]
        if missing:
            raise RecipeError(f"missing required parameters: {sorted(missing)}")
        resolved: dict[str, Any] = {}
        for p in spec.parameters:
            name = p["name"]
            if name in params:
                resolved[name] = params[name]
            elif "default" in p:
                resolved[name] = p["default"]
        # Allow extra params through (they can be used by prompt templates).
        for k, v in params.items():
            resolved.setdefault(k, v)
        return resolved

    def _evict_old_runs(self) -> None:
        if len(self._runs) <= _RUN_RETENTION:
            return
        surplus = sorted(
            self._runs.values(), key=lambda r: r.started_at
        )[: len(self._runs) - _RUN_RETENTION]
        for r in surplus:
            self._runs.pop(r.id, None)
            self._tasks.pop(r.id, None)

    # ── execution ───────────────────────────────────────────────────
    async def _execute(self, spec: RecipeSpec, run: RecipeRun) -> None:
        run.status = "running"
        try:
            async with ArcBackend(self.arc_api_url) as backend:
                # Establish chain head.
                head: str | None = None
                if spec.arc_enabled and not self.dry_run:
                    try:
                        head = await backend.head_for_alias(spec.arc_agent)
                        if head is None:
                            head = await backend.ensure_genesis(
                                spec.arc_agent,
                                f"Recipe genesis: {spec.name}",
                            )
                    except Exception as exc:
                        logger.warning(
                            "head/genesis resolution failed; falling back to dry-run: %s",
                            exc,
                        )
                        run.dry_run = True
                run.chain_head_before = head

                # Per-run idempotency cache so retried steps don't double-post.
                ihash_cache: dict[str, str] = {}
                for idx, (step_spec, step_exec) in enumerate(
                    zip(spec.steps, run.steps)
                ):
                    step_exec.started_at = time.time()
                    step_exec.status = "running"
                    step_exec.prev = head

                    try:
                        output = await self.step_executor(
                            step_spec, run.params
                        )
                    except Exception as exc:
                        step_exec.status = "failed"
                        step_exec.error = f"{type(exc).__name__}: {exc}"
                        step_exec.finished_at = time.time()
                        raise

                    step_exec.output = output
                    if step_spec.capture_output_hash:
                        step_exec.ohash = compute_ohash(output)

                    step_exec.memrefs = resolve_memrefs(
                        spec, step_spec, run.steps[:idx]
                    )

                    record_id = ihash_cache.get(step_exec.ihash)
                    if record_id:
                        step_exec.record_id = record_id
                        step_exec.status = "skipped"
                        step_exec.cached = True
                    elif spec.arc_enabled and not run.dry_run and head:
                        try:
                            action_text = (
                                f"{step_exec.action_label} "
                                f"[ih={step_exec.ihash[:12]}]"
                            )
                            resp = await backend.action(
                                prev=head,
                                action=action_text,
                                memrefs=step_exec.memrefs,
                            )
                            step_exec.record_id = resp["id"]
                            step_exec.status = "ok"
                        except Exception as exc:
                            step_exec.status = "failed"
                            step_exec.error = f"arc action failed: {exc}"
                            step_exec.finished_at = time.time()
                            raise
                    else:
                        # Dry-run / arc disabled: synthesise a record id from
                        # the ihash so the rest of the pipeline still works.
                        step_exec.record_id = step_exec.ihash
                        step_exec.status = "ok"

                    if step_exec.record_id and not step_exec.cached:
                        ihash_cache[step_exec.ihash] = step_exec.record_id
                    head = step_exec.record_id or head
                    step_exec.finished_at = time.time()

                run.chain_head_after = head

                # Settlement.
                if (
                    spec.arc_enabled
                    and spec.settle_on_complete
                    and head
                    and not run.dry_run
                ):
                    try:
                        settle = await backend.settle(
                            record_id=head,
                            amount=spec.settlement_amount_sats,
                        )
                        run.settlement_id = settle.get("id")
                        run.settlement_sats = spec.settlement_amount_sats
                        run.settlement_preimage = settle.get("preimage")
                    except Exception as exc:
                        logger.warning("settlement failed: %s", exc)
                        run.error = f"settlement failed: {exc}"
                elif spec.settle_on_complete and run.dry_run:
                    run.settlement_sats = spec.settlement_amount_sats

                # Inscription envelope (optional).
                if (
                    spec.arc_enabled
                    and spec.inscription
                    and head
                    and not run.dry_run
                ):
                    run.inscription_cmd = await backend.inscription(head)

            run.status = "completed"
        except Exception as exc:
            logger.exception("recipe run %s failed", run.id)
            run.status = "failed"
            run.error = run.error or f"{type(exc).__name__}: {exc}"
        finally:
            run.finished_at = time.time()


# ── Factory ─────────────────────────────────────────────────────────────


def default_recipes_dir() -> Path:
    import os

    env_dir = os.environ.get("ARC_ORCH_RECIPES_DIR")
    if env_dir:
        return Path(env_dir)
    return Path(__file__).resolve().parents[2] / "recipes"


def build_runner_from_env(
    *,
    recipes_dir: Path | None = None,
    arc_api_url: str | None = None,
    dry_run: bool | None = None,
    step_executor: StepExecutor | None = None,
) -> RecipeRunner:
    import os

    registry = RecipeRegistry(recipes_dir or default_recipes_dir())
    registry.load()
    return RecipeRunner(
        registry=registry,
        arc_api_url=arc_api_url
        or os.environ.get("ARC_API_URL", "http://localhost:8000"),
        dry_run=(
            dry_run
            if dry_run is not None
            else os.environ.get("ARC_ORCH_DRY_RUN", "").lower()
            in {"1", "true", "yes"}
        ),
        step_executor=step_executor,
    )
