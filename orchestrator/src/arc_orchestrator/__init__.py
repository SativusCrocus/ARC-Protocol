"""ARC Protocol Goose-powered orchestrator runtime."""

from .registry import AgentSpec, AgentRegistry
from .runtime import OrchestratorRuntime, ActivityEvent, DispatchResult
from .goose_bridge import GooseBridge, GooseResult, GooseUnavailableError

__all__ = [
    "AgentSpec",
    "AgentRegistry",
    "OrchestratorRuntime",
    "ActivityEvent",
    "DispatchResult",
    "GooseBridge",
    "GooseResult",
    "GooseUnavailableError",
]

__version__ = "0.1.0"
