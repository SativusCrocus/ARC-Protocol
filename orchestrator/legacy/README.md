# Legacy Cron Orchestrator

This directory preserves the original LangGraph + Ollama cron-based orchestrator
as a fallback and reference. The active orchestrator is now the Goose-powered
runtime in the parent directory (`orchestrator/`).

`orchestrator_agent.py` is an **exact copy** of
`backend/orchestrator_agent.py`. The backend still imports the original file;
this copy exists so operators can compare behaviour, and so the cron
orchestrator can be resurrected if Goose is unavailable and the new runtime
needs to be bypassed.

Nothing here is imported by the new runtime.
