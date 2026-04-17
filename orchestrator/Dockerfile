FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY agents ./agents

RUN pip install --no-cache-dir .

ENV ARC_API_URL=http://backend:8000 \
    ARC_MCP_COMMAND=arc-mcp \
    ARC_ORCH_HOST=0.0.0.0 \
    ARC_ORCH_PORT=8100 \
    ARC_ORCH_DRY_RUN=true \
    ARC_DEFAULT_PROVIDER=ollama/llama3.2

EXPOSE 8100

CMD ["arc-orchestrator"]
