"""Top-level shim for the provenance report generator."""

from __future__ import annotations

from arc_orchestrator.provenance_report import (  # noqa: F401
    build_report,
    render_dag_ascii,
    render_text_summary,
)
