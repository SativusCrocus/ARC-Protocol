"""Top-level API shim — re-exports FastAPI app from arc_orchestrator."""

from __future__ import annotations

from arc_orchestrator.api import app, create_app, run  # noqa: F401


if __name__ == "__main__":
    run()
