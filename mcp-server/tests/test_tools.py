"""Unit tests for the ARC MCP server.

The tests mock the ARC HTTP API with `respx` so they exercise the tool
dispatch layer, Pydantic input validation, and HTTP payload shaping
without needing a running FastAPI backend.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx

from arc_mcp.client import ArcApiError, ArcClient
from arc_mcp.config import ArcMcpConfig
from arc_mcp.server import _dispatch, _build_tools

API_URL = "http://arc.test"

PUBKEY = "a" * 64
RECORD_ID = "b" * 64
PREV_ID = "c" * 64
MEMREF_ID = "d" * 64


def _config() -> ArcMcpConfig:
    return ArcMcpConfig(
        api_url=API_URL,
        api_key=None,
        timeout_seconds=5.0,
        log_level="WARNING",
        sse_host="127.0.0.1",
        sse_port=8765,
    )


@pytest.fixture
async def client() -> ArcClient:
    c = ArcClient(_config())
    try:
        yield c
    finally:
        await c.aclose()


# ── tool schema registration ────────────────────────────────────────


def test_all_seven_tools_registered() -> None:
    tools = _build_tools()
    names = {t.name for t in tools}
    assert names == {
        "arc_keygen",
        "arc_genesis",
        "arc_action",
        "arc_validate",
        "arc_settle",
        "arc_chain",
        "arc_list_records",
    }
    for t in tools:
        assert t.description and len(t.description) > 40
        assert t.inputSchema["type"] == "object"


# ── keygen ──────────────────────────────────────────────────────────


@respx.mock
async def test_keygen(client: ArcClient) -> None:
    route = respx.post(f"{API_URL}/keygen").mock(
        return_value=httpx.Response(200, json={"pubkey": PUBKEY, "alias": "agent-1"})
    )
    result = await _dispatch(client, "arc_keygen", {"alias": "agent-1"})
    assert result == {"pubkey": PUBKEY, "alias": "agent-1"}
    assert route.called
    sent = json.loads(route.calls[0].request.content)
    assert sent == {"alias": "agent-1"}


# ── genesis ─────────────────────────────────────────────────────────


@respx.mock
async def test_genesis_minimal(client: ArcClient) -> None:
    route = respx.post(f"{API_URL}/genesis").mock(
        return_value=httpx.Response(
            200, json={"id": RECORD_ID, "record": {"type": "genesis"}}
        )
    )
    result = await _dispatch(client, "arc_genesis", {"action": "Agent initialized"})
    assert result["id"] == RECORD_ID
    sent = json.loads(route.calls[0].request.content)
    assert sent == {"action": "Agent initialized"}


@respx.mock
async def test_genesis_with_optional_fields(client: ArcClient) -> None:
    route = respx.post(f"{API_URL}/genesis").mock(
        return_value=httpx.Response(200, json={"id": RECORD_ID, "record": {}})
    )
    await _dispatch(
        client,
        "arc_genesis",
        {"action": "boot", "alias": "a1", "input_data": "seed-bytes"},
    )
    sent = json.loads(route.calls[0].request.content)
    assert sent == {"action": "boot", "alias": "a1", "input_data": "seed-bytes"}


# ── action ──────────────────────────────────────────────────────────


@respx.mock
async def test_action_with_memrefs_and_prompt(client: ArcClient) -> None:
    route = respx.post(f"{API_URL}/action").mock(
        return_value=httpx.Response(
            200, json={"id": RECORD_ID, "record": {"type": "action"}}
        )
    )
    await _dispatch(
        client,
        "arc_action",
        {
            "prev": PREV_ID,
            "action": "run inference",
            "memrefs": [MEMREF_ID],
            "prompt": "summarize bitcoin",
        },
    )
    sent = json.loads(route.calls[0].request.content)
    assert sent == {
        "prev": PREV_ID,
        "action": "run inference",
        "memrefs": [MEMREF_ID],
        "prompt": "summarize bitcoin",
    }


async def test_action_rejects_short_prev(client: ArcClient) -> None:
    with pytest.raises(Exception):
        await _dispatch(client, "arc_action", {"prev": "abc", "action": "x"})


async def test_action_rejects_bad_memref(client: ArcClient) -> None:
    with pytest.raises(Exception):
        await _dispatch(
            client,
            "arc_action",
            {"prev": PREV_ID, "action": "x", "memrefs": ["not-hex"]},
        )


# ── validate ────────────────────────────────────────────────────────


@respx.mock
async def test_validate_deep(client: ArcClient) -> None:
    route = respx.get(f"{API_URL}/validate/{RECORD_ID}").mock(
        return_value=httpx.Response(
            200, json={"valid": True, "errors": [], "id": RECORD_ID}
        )
    )
    result = await _dispatch(
        client, "arc_validate", {"record_id": RECORD_ID, "depth": "deep"}
    )
    assert result["valid"] is True
    assert route.calls[0].request.url.params.get("deep") == "true"


@respx.mock
async def test_validate_shallow_passes_deep_false(client: ArcClient) -> None:
    route = respx.get(f"{API_URL}/validate/{RECORD_ID}").mock(
        return_value=httpx.Response(200, json={"valid": True, "errors": []})
    )
    await _dispatch(
        client, "arc_validate", {"record_id": RECORD_ID, "depth": "shallow"}
    )
    assert route.calls[0].request.url.params.get("deep") == "false"


# ── settle ──────────────────────────────────────────────────────────


@respx.mock
async def test_settle(client: ArcClient) -> None:
    route = respx.post(f"{API_URL}/settle").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": RECORD_ID,
                "record": {"type": "settlement"},
                "payment_hash": "ph",
                "preimage": "pi",
            },
        )
    )
    result = await _dispatch(
        client, "arc_settle", {"record_id": RECORD_ID, "amount_sats": 1000}
    )
    assert result["payment_hash"] == "ph"
    sent = json.loads(route.calls[0].request.content)
    assert sent == {"record_id": RECORD_ID, "amount": 1000}


async def test_settle_rejects_zero_amount(client: ArcClient) -> None:
    with pytest.raises(Exception):
        await _dispatch(
            client, "arc_settle", {"record_id": RECORD_ID, "amount_sats": 0}
        )


# ── chain ───────────────────────────────────────────────────────────


@respx.mock
async def test_chain(client: ArcClient) -> None:
    payload: list[dict[str, Any]] = [
        {"id": PREV_ID, "record": {"type": "genesis"}},
        {"id": RECORD_ID, "record": {"type": "action"}},
    ]
    respx.get(f"{API_URL}/chain/{PUBKEY}").mock(
        return_value=httpx.Response(200, json=payload)
    )
    result = await _dispatch(client, "arc_chain", {"identifier": PUBKEY})
    assert result == payload


# ── list_records ────────────────────────────────────────────────────


@respx.mock
async def test_list_records_filters_by_agent_and_type(client: ArcClient) -> None:
    entries = [
        {"id": "1" * 64, "record": {"type": "genesis", "agent": {"pubkey": PUBKEY}}},
        {"id": "2" * 64, "record": {"type": "action", "agent": {"pubkey": PUBKEY}}},
        {"id": "3" * 64, "record": {"type": "action", "agent": {"pubkey": "f" * 64}}},
    ]
    respx.get(f"{API_URL}/records").mock(
        return_value=httpx.Response(200, json=entries)
    )
    result = await _dispatch(
        client, "arc_list_records", {"agent": PUBKEY, "type": "action"}
    )
    assert len(result) == 1
    assert result[0]["record"]["agent"]["pubkey"] == PUBKEY
    assert result[0]["record"]["type"] == "action"


# ── error propagation ──────────────────────────────────────────────


@respx.mock
async def test_api_error_surfaces_as_arcapierror(client: ArcClient) -> None:
    respx.post(f"{API_URL}/keygen").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )
    with pytest.raises(ArcApiError) as excinfo:
        await _dispatch(client, "arc_keygen", {})
    assert "boom" in str(excinfo.value)
    assert excinfo.value.status_code == 500


@respx.mock
async def test_unreachable_backend_surfaces_as_arcapierror(client: ArcClient) -> None:
    respx.post(f"{API_URL}/keygen").mock(
        side_effect=httpx.ConnectError("refused")
    )
    with pytest.raises(ArcApiError) as excinfo:
        await _dispatch(client, "arc_keygen", {})
    assert "unreachable" in str(excinfo.value)


# ── auth header wiring ─────────────────────────────────────────────


@respx.mock
async def test_api_key_sent_as_bearer() -> None:
    cfg = ArcMcpConfig(
        api_url=API_URL,
        api_key="secret-token",
        timeout_seconds=5.0,
        log_level="WARNING",
        sse_host="127.0.0.1",
        sse_port=8765,
    )
    c = ArcClient(cfg)
    route = respx.post(f"{API_URL}/keygen").mock(
        return_value=httpx.Response(200, json={"pubkey": PUBKEY, "alias": "a"})
    )
    try:
        await _dispatch(c, "arc_keygen", {"alias": "a"})
    finally:
        await c.aclose()
    assert route.calls[0].request.headers["Authorization"] == "Bearer secret-token"
