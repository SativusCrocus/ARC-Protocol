"""Top-level shim for the recipe middleware.

Real implementation lives in ``src/arc_orchestrator/recipe_middleware.py``.
Re-exported here so operators can `python -c 'from recipe_middleware import ...'`
from the orchestrator/ directory.
"""

from __future__ import annotations

from arc_orchestrator.recipe_middleware import (  # noqa: F401
    ArcBackend,
    RecipeError,
    RecipeRegistry,
    RecipeRun,
    RecipeRunner,
    RecipeSpec,
    RecipeStep,
    StepExecution,
    build_runner_from_env,
    compute_ihash,
    compute_ohash,
    default_recipes_dir,
    dry_run_executor,
    extract_placeholders,
    load_recipe,
    recipe_placeholders,
    resolve_memrefs,
    validate_recipe,
)
