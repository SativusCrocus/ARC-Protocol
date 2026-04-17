"""HTTP client wrapper for the ARC Protocol FastAPI backend.

The MCP server talks to ARC purely over HTTP so it can target a local
dev instance, a Docker-compose service, or a remote deployment without
importing backend Python modules.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import ArcMcpConfig

logger = logging.getLogger(__name__)


class ArcApiError(RuntimeError):
    """Raised when the ARC backend returns an error or is unreachable."""

    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class ArcClient:
    """Thin async HTTP client for ARC's REST API."""

    def __init__(self, config: ArcMcpConfig, *, client: httpx.AsyncClient | None = None):
        self._config = config
        headers = {"User-Agent": "arc-mcp/0.1"}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"
        self._client = client or httpx.AsyncClient(
            base_url=config.api_url,
            timeout=config.timeout_seconds,
            headers=headers,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "ArcClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    # ── request helpers ───────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        try:
            response = await self._client.request(
                method, path, json=json, params=params
            )
        except httpx.TimeoutException as exc:
            raise ArcApiError(
                f"ARC backend at {self._config.api_url} timed out after "
                f"{self._config.timeout_seconds}s while calling {method} {path}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ArcApiError(
                f"ARC backend at {self._config.api_url} is unreachable: {exc}"
            ) from exc

        if response.status_code >= 400:
            detail = _extract_error_detail(response)
            raise ArcApiError(
                f"ARC backend returned {response.status_code} for {method} {path}: {detail}",
                status_code=response.status_code,
            )

        if not response.content:
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise ArcApiError(
                f"ARC backend returned non-JSON body for {method} {path}: {response.text!r}"
            ) from exc

    async def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return await self._request("GET", path, params=params)

    async def post(self, path: str, *, json: dict[str, Any] | None = None) -> Any:
        return await self._request("POST", path, json=json)

    # ── ARC endpoints ─────────────────────────────────────────────────

    async def keygen(self, alias: str | None) -> dict[str, Any]:
        return await self.post("/keygen", json={"alias": alias})

    async def genesis(
        self,
        *,
        action: str,
        alias: str | None = None,
        input_data: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"action": action}
        if alias is not None:
            payload["alias"] = alias
        if input_data is not None:
            payload["input_data"] = input_data
        return await self.post("/genesis", json=payload)

    async def action(
        self,
        *,
        prev: str,
        action: str,
        memrefs: list[str] | None = None,
        prompt: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "prev": prev,
            "action": action,
            "memrefs": memrefs or [],
        }
        if prompt is not None:
            payload["prompt"] = prompt
        return await self.post("/action", json=payload)

    async def validate(self, record_id: str, *, deep: bool = True) -> dict[str, Any]:
        return await self.get(f"/validate/{record_id}", params={"deep": str(deep).lower()})

    async def settle(self, *, record_id: str, amount_sats: int) -> dict[str, Any]:
        return await self.post(
            "/settle", json={"record_id": record_id, "amount": amount_sats}
        )

    async def chain(self, identifier: str) -> Any:
        return await self.get(f"/chain/{identifier}")

    async def memory_store(
        self,
        *,
        memory_key: str,
        memory_value: str,
        memory_type: str,
        alias: str | None = None,
        ttl: int | None = None,
        supersedes: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "memory_key": memory_key,
            "memory_value": memory_value,
            "memory_type": memory_type,
        }
        if alias is not None:
            payload["alias"] = alias
        if ttl is not None:
            payload["ttl"] = ttl
        if supersedes is not None:
            payload["supersedes"] = supersedes
        return await self.post("/memory", json=payload)

    async def memory_search(
        self,
        *,
        q: str = "",
        agent: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"q": q, "limit": limit}
        if agent:
            params["agent"] = agent
        return await self.get("/memory/search", params=params)

    async def memory_latest(self, key: str) -> dict[str, Any]:
        return await self.get(f"/memory/latest/{key}")

    async def memory_agent(self, pubkey: str) -> dict[str, Any]:
        return await self.get(f"/memory/agent/{pubkey}")

    async def list_records(
        self,
        *,
        agent: str | None = None,
        record_type: str | None = None,
    ) -> list[dict[str, Any]]:
        records = await self.get("/records")
        if not isinstance(records, list):
            return []
        filtered: list[dict[str, Any]] = []
        for entry in records:
            rec = entry.get("record", {}) if isinstance(entry, dict) else {}
            if record_type and rec.get("type") != record_type:
                continue
            if agent:
                rec_agent = rec.get("agent") or {}
                if rec_agent.get("pubkey") != agent:
                    continue
            filtered.append(entry)
        return filtered


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text.strip() or "<empty body>"
    if isinstance(data, dict) and "detail" in data:
        return str(data["detail"])
    return str(data)
