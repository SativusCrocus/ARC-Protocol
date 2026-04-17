"""Top-level bridge shim — re-exports from arc_orchestrator."""

from arc_orchestrator.goose_bridge import (  # noqa: F401
    DEFAULT_GOOSE_BIN,
    DEFAULT_TIMEOUT_SECONDS,
    GooseBridge,
    GooseResult,
    GooseUnavailableError,
)
