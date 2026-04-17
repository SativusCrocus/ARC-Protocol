"""Top-level entrypoint module.

Convenience shim so operators can run `python runtime.py` from the
`orchestrator/` directory and also import `from orchestrator.runtime import ...`
in ad-hoc scripts. Real implementation lives in
``src/arc_orchestrator/runtime.py`` and is re-exported here.
"""

from __future__ import annotations

from arc_orchestrator.runtime import (  # noqa: F401
    ActivityEvent,
    DispatchResult,
    OrchestratorRuntime,
    build_runtime_from_env,
)
from arc_orchestrator.api import run as _run


if __name__ == "__main__":
    _run()
