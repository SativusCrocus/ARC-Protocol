FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src

RUN pip install --no-cache-dir . starlette uvicorn

ENV ARC_API_URL=http://backend:8000 \
    ARC_MCP_SSE_HOST=0.0.0.0 \
    ARC_MCP_SSE_PORT=8765

EXPOSE 8765

CMD ["arc-mcp-sse"]
