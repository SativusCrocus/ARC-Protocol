"""Environment-based configuration for the ARC MCP server."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_LOG_LEVEL = "INFO"


@dataclass(frozen=True)
class ArcMcpConfig:
    """Runtime configuration for the ARC MCP server.

    Values are resolved from environment variables so the same binary can
    point at a local dev backend or a remote production ARC instance.
    """

    api_url: str
    api_key: str | None
    timeout_seconds: float
    log_level: str
    sse_host: str
    sse_port: int

    @classmethod
    def from_env(cls) -> "ArcMcpConfig":
        api_url = os.environ.get("ARC_API_URL", DEFAULT_API_URL).rstrip("/")
        api_key = os.environ.get("ARC_API_KEY") or None
        try:
            timeout_seconds = float(
                os.environ.get("ARC_HTTP_TIMEOUT", DEFAULT_TIMEOUT_SECONDS)
            )
        except ValueError:
            timeout_seconds = DEFAULT_TIMEOUT_SECONDS
        log_level = os.environ.get("ARC_LOG_LEVEL", DEFAULT_LOG_LEVEL).upper()
        sse_host = os.environ.get("ARC_MCP_SSE_HOST", "0.0.0.0")
        try:
            sse_port = int(os.environ.get("ARC_MCP_SSE_PORT", "8765"))
        except ValueError:
            sse_port = 8765
        return cls(
            api_url=api_url,
            api_key=api_key,
            timeout_seconds=timeout_seconds,
            log_level=log_level,
            sse_host=sse_host,
            sse_port=sse_port,
        )


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s arc-mcp %(name)s: %(message)s",
    )
