"""Human-readable provenance report for a completed recipe run.

Given a :class:`RecipeRun`, renders:
  - header (recipe, agent, status, duration)
  - per-step table with record_id / ihash / ohash / memref count
  - ASCII DAG visualisation
  - settlement + inscription block
  - validation status (whether the backend confirmed the chain head)
  - direct link into the frontend's DAG explorer

Kept pure-Python (no templating dep) so the report is cheap to compute
on every poll of `GET /recipe/run/{id}/report`.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from .recipe_middleware import RecipeRun, RecipeSpec, StepExecution

_DEFAULT_EXPLORER_BASE = os.environ.get(
    "ARC_EXPLORER_BASE_URL", "http://localhost:3000/explorer"
)


def build_report(
    run: RecipeRun,
    spec: RecipeSpec | None = None,
    *,
    explorer_base: str | None = None,
) -> dict[str, Any]:
    """Structured report payload for JSON and text rendering."""
    explorer = (explorer_base or _DEFAULT_EXPLORER_BASE).rstrip("/")
    duration = (
        (run.finished_at - run.started_at)
        if run.finished_at
        else None
    )

    # Signature validation status — fail-soft: we consider a step "verified"
    # when it has a record_id and wasn't marked failed. The backend already
    # re-verifies signatures before persisting, so a present record_id is a
    # strong signal. Deep chain validation is surfaced by the /validate
    # endpoint and is not re-run here (that would blow up the report cost).
    verified = all(
        s.status in ("ok", "skipped") and s.record_id for s in run.steps
    )

    steps_payload = [
        {
            "index": i,
            "name": s.name,
            "action_label": s.action_label,
            "status": s.status,
            "cached": s.cached,
            "record_id": s.record_id,
            "prev": s.prev,
            "ihash": s.ihash,
            "ohash": s.ohash,
            "memref_count": len(s.memrefs),
            "memrefs": list(s.memrefs),
            "duration_seconds": round(
                max(0.0, s.finished_at - s.started_at), 3
            )
            if s.finished_at and s.started_at
            else None,
            "error": s.error,
            "explorer_url": (
                f"{explorer}?q={s.record_id}"
                if s.record_id
                else None
            ),
        }
        for i, s in enumerate(run.steps)
    ]

    report: dict[str, Any] = {
        "run_id": run.id,
        "recipe": run.recipe,
        "agent": run.agent,
        "params": run.params,
        "status": run.status,
        "dry_run": run.dry_run,
        "started_at": _iso(run.started_at),
        "finished_at": _iso(run.finished_at),
        "duration_seconds": round(duration, 3) if duration is not None else None,
        "chain_head_before": run.chain_head_before,
        "chain_head_after": run.chain_head_after,
        "steps": steps_payload,
        "settlement": {
            "settled": bool(run.settlement_id),
            "record_id": run.settlement_id,
            "amount_sats": run.settlement_sats,
            "preimage": run.settlement_preimage,
        },
        "inscription_cmd": run.inscription_cmd,
        "validation": {
            "verified": verified,
            "failed_steps": [
                s.name for s in run.steps if s.status == "failed"
            ],
        },
        "explorer_url": (
            f"{explorer}?q={run.chain_head_after}"
            if run.chain_head_after
            else None
        ),
        "error": run.error,
    }
    if spec is not None:
        report["recipe_description"] = spec.description
        report["memref_strategy"] = spec.memref_strategy
    report["dag_ascii"] = render_dag_ascii(run.steps)
    report["summary_text"] = render_text_summary(run, report)
    return report


def render_dag_ascii(steps: list[StepExecution]) -> str:
    """Render a minimal vertical chain with memref cross-links.

    Example:
        ● research      abcd1234…   ih=…  oh=…
        │
        ● analyze       efgh5678…   ih=…  oh=…   memrefs→ research
        │
        ● draft         ijkl9012…   ih=…  oh=…   memrefs→ research, analyze
    """
    if not steps:
        return "(empty)"
    lines: list[str] = []
    name_width = max(len(s.name) for s in steps)
    by_record: dict[str, str] = {
        s.record_id: s.name for s in steps if s.record_id
    }
    for i, s in enumerate(steps):
        rid = (s.record_id or "—")[:12] + ("…" if s.record_id else "")
        ih = (s.ihash or "")[:10] or "—"
        oh = (s.ohash or "")[:10] or "—"
        memref_names = [by_record.get(r, r[:8] + "…") for r in s.memrefs]
        memref_str = (
            f"  memrefs→ {', '.join(memref_names)}" if memref_names else ""
        )
        marker = "●" if s.status == "ok" else ("◐" if s.status == "skipped" else "○")
        lines.append(
            f"  {marker} {s.name:<{name_width}}  {rid}   "
            f"ih={ih}  oh={oh}{memref_str}"
        )
        if i < len(steps) - 1:
            lines.append("  │")
    return "\n".join(lines)


def render_text_summary(run: RecipeRun, report: dict[str, Any]) -> str:
    """Full text report, suitable for logs / CLI output."""
    lines = [
        f"ARC Provenance Report — {run.recipe}",
        "=" * 60,
        f"Run ID          : {run.id}",
        f"Agent           : {run.agent or '—'}",
        f"Status          : {run.status.upper()}"
        + (" (dry-run)" if run.dry_run else ""),
        f"Started         : {report['started_at'] or '—'}",
        f"Finished        : {report['finished_at'] or '—'}",
        f"Duration (s)    : {report['duration_seconds'] or '—'}",
        f"Chain head in   : {run.chain_head_before or '—'}",
        f"Chain head out  : {run.chain_head_after or '—'}",
        "",
        "Steps:",
        report["dag_ascii"],
        "",
    ]
    settle = report["settlement"]
    if settle["settled"]:
        lines.append(
            f"Settlement      : {settle['amount_sats']} sats "
            f"(record {settle['record_id']})"
        )
    elif run.settlement_sats:
        lines.append(
            f"Settlement      : pending / dry-run — "
            f"{run.settlement_sats} sats configured"
        )
    else:
        lines.append("Settlement      : none")

    if run.inscription_cmd:
        lines.append("")
        lines.append("Inscription command:")
        lines.append(f"  {run.inscription_cmd}")

    lines.append("")
    lines.append(
        f"Validation      : {'verified' if report['validation']['verified'] else 'FAILED'}"
    )
    failed = report["validation"]["failed_steps"]
    if failed:
        lines.append(f"  failed steps  : {', '.join(failed)}")
    if report.get("explorer_url"):
        lines.append(f"DAG explorer    : {report['explorer_url']}")
    if run.error:
        lines.append("")
        lines.append(f"ERROR: {run.error}")
    return "\n".join(lines)


def _iso(ts: float | None) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
