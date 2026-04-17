"""FastAPI HTTP + WebSocket surface for the orchestrator runtime."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .provenance_report import build_report
from .recipe_middleware import (
    RecipeError,
    RecipeRunner,
    build_runner_from_env,
)
from .registry import AgentSpec
from .runtime import ActivityEvent, OrchestratorRuntime, build_runtime_from_env

logger = logging.getLogger(__name__)


# ── Pydantic schemas ───────────────────────────────────────────────


class DispatchRequest(BaseModel):
    task: str = Field(..., min_length=1, max_length=16_000)
    agent: str | None = Field(
        default=None,
        description="Target agent name. If omitted, the meta-agent routes the task.",
    )


class TriggerRequest(BaseModel):
    task: str = Field(..., min_length=1, max_length=16_000)


class RecipeRunRequest(BaseModel):
    recipe: str = Field(..., min_length=1, max_length=128)
    params: dict[str, Any] = Field(default_factory=dict)


def _spec_to_dict(spec: AgentSpec, pubkey: str | None) -> dict[str, Any]:
    return {
        "agent_name": spec.agent_name,
        "display_name": spec.display_name,
        "role": spec.role,
        "color": spec.color,
        "trigger": spec.trigger,
        "schedule": spec.schedule,
        "webhook_path": spec.webhook_path,
        "provider": spec.provider,
        "mcp_servers": list(spec.mcp_servers),
        "tools": list(spec.tools),
        "is_meta": spec.is_meta,
        "child_agents": list(spec.child_agents),
        "pubkey": pubkey,
    }


# ── app factory ────────────────────────────────────────────────────


def create_app(
    runtime: OrchestratorRuntime | None = None,
    recipe_runner: RecipeRunner | None = None,
) -> FastAPI:
    rt = runtime or build_runtime_from_env()
    recipes = recipe_runner or build_runner_from_env(
        arc_api_url=rt.arc_api_url,
        dry_run=rt.bridge.dry_run,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await rt.start()
        try:
            yield
        finally:
            await rt.stop()

    app = FastAPI(
        title="ARC Protocol Orchestrator",
        version="0.1.0",
        description=(
            "Goose-powered runtime that dispatches ARC Protocol agents. Each "
            "dispatch spawns a short-lived Goose session wired into the ARC "
            "MCP server, producing genuine signed ARC records."
        ),
        lifespan=lifespan,
    )

    cors_origins = [
        o.strip() for o in os.environ.get("ARC_ORCH_CORS", "*").split(",") if o.strip()
    ] or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Expose runtime for tests / embedding.
    app.state.runtime = rt
    app.state.recipe_runner = recipes

    # ── routes ─────────────────────────────────────────────────────

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "ok": True,
            "agents": len(rt.registry.all()),
            "goose_available": rt.bridge.goose_available(),
            "dry_run": rt.bridge.dry_run,
            "arc_api_url": rt.arc_api_url,
        }

    @app.get("/orchestrator/agents")
    async def list_agents() -> list[dict[str, Any]]:
        return [
            _spec_to_dict(s, rt.known_pubkey(s.agent_name))
            for s in rt.registry.all()
        ]

    @app.get("/orchestrator/agent/{name}/history")
    async def agent_history(name: str, limit: int = 25) -> dict[str, Any]:
        try:
            items = await rt.agent_history(name, limit=limit)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        return {"agent": name, "items": items}

    @app.post("/orchestrator/agent/{name}/trigger")
    async def trigger_agent(name: str, req: TriggerRequest) -> dict[str, Any]:
        try:
            result = await rt.dispatch(name, task=req.task, source="manual")
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        return result.to_dict()

    @app.post("/orchestrator/dispatch")
    async def dispatch(req: DispatchRequest) -> dict[str, Any]:
        try:
            if req.agent:
                result = await rt.dispatch(req.agent, task=req.task, source="api")
            else:
                result = await rt.meta_route(req.task)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return result.to_dict()

    @app.get("/orchestrator/activity")
    async def activity(limit: int = 100) -> list[dict[str, Any]]:
        return [e.to_dict() for e in rt.activity(limit=limit)]

    @app.websocket("/orchestrator/stream")
    async def stream(ws: WebSocket) -> None:
        await ws.accept()
        queue: asyncio.Queue[ActivityEvent] = asyncio.Queue(maxsize=512)

        async def _forward(event: ActivityEvent) -> None:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("ws stream queue full; dropping event")

        await rt.subscribe(_forward)
        try:
            # Replay recent activity so late subscribers aren't blind.
            for event in rt.activity(limit=25):
                await ws.send_json(event.to_dict())
            while True:
                event = await queue.get()
                await ws.send_json(event.to_dict())
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("ws stream error")
        finally:
            await rt.unsubscribe(_forward)

    # ── recipes ────────────────────────────────────────────────────

    @app.get("/recipes")
    async def list_recipes() -> list[dict[str, Any]]:
        return [spec.to_summary() for spec in recipes.recipes()]

    @app.get("/recipe/{name}")
    async def get_recipe(name: str) -> dict[str, Any]:
        spec = recipes.get_recipe(name)
        if spec is None:
            raise HTTPException(404, f"unknown recipe: {name}")
        return spec.to_summary()

    @app.post("/recipe/run")
    async def run_recipe(req: RecipeRunRequest) -> dict[str, Any]:
        try:
            run = recipes.submit(req.recipe, req.params)
        except RecipeError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"run_id": run.id, "status": run.status, "recipe": run.recipe}

    @app.get("/recipe/run/{run_id}")
    async def recipe_run_status(run_id: str) -> dict[str, Any]:
        run = recipes.get_run(run_id)
        if run is None:
            raise HTTPException(404, "unknown run_id")
        return run.to_dict()

    @app.get("/recipe/run/{run_id}/report")
    async def recipe_run_report(run_id: str) -> dict[str, Any]:
        run = recipes.get_run(run_id)
        if run is None:
            raise HTTPException(404, "unknown run_id")
        spec = recipes.get_recipe(run.recipe)
        return build_report(run, spec)

    @app.get("/recipe/runs")
    async def list_recipe_runs(limit: int = 25) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 200))
        return [r.to_dict() for r in recipes.list_runs(limit=limit)]

    return app


# uvicorn entrypoint: `uvicorn arc_orchestrator.api:app`
app = create_app()


def run() -> None:
    import uvicorn

    port = int(os.environ.get("ARC_ORCH_PORT", "8100"))
    host = os.environ.get("ARC_ORCH_HOST", "0.0.0.0")
    log_level = os.environ.get("ARC_ORCH_LOG_LEVEL", "info")
    logging.basicConfig(level=log_level.upper())
    uvicorn.run(
        "arc_orchestrator.api:app",
        host=host,
        port=port,
        log_level=log_level,
        reload=False,
    )


if __name__ == "__main__":
    run()
