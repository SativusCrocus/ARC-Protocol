"""ARC Research Agent – LangGraph + Ollama
Deep research agent that inscribes every output as an ARC Action record.
References the Memory DAG demo via memrefs, building verifiable research provenance.

Architecture (LangGraph StateGraph):
    plan → research → analyze → synthesize → inscribe → END

Each node calls Ollama for inference and creates an ARC action record.
The final inscription memrefs all prior steps + any existing Memory DAG records.
"""

import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── State Schema ──────────────────────────────────────────────────────────────


class ResearchState(TypedDict):
    query: str
    model: str
    plan: str
    research: str
    analysis: str
    synthesis: str
    record_ids: list[str]
    dag_memrefs: list[str]
    agent_pubkey: str
    agent_alias: str
    final_id: str
    inscription_cmd: str
    chain: list[dict]
    error: str


# ── Ollama Helper ─────────────────────────────────────────────────────────────


def _llm(prompt: str, model: str = "llama3.2") -> str:
    """Call Ollama with fallback to simulated output if model unavailable."""
    result = arc.ollama_generate(prompt, model)
    if result:
        return result
    # Model not available — try common fallbacks
    for alt in ("llama3.1:8b", "llama3.1", "qwen2.5:14b", "mistral"):
        if alt != model:
            result = arc.ollama_generate(prompt, alt)
            if result:
                return result
    return f"[simulated] Research output for: {prompt[:120]}"


# ── Memory DAG Discovery ─────────────────────────────────────────────────────


def _find_dag_records(db) -> list[str]:
    """Find existing Memory DAG demo records to reference via memrefs.
    Looks for records created by arc-research, arc-synthesis, arc-composer agents."""
    dag_aliases = {"arc-research", "arc-synthesis", "arc-composer"}
    dag_ids = []
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in dag_aliases:
            dag_ids.append(rid)
    # Return up to 6 most recent DAG records as memrefs
    return dag_ids[:6]


# ── ARC Record Helper ────────────────────────────────────────────────────────


def _inscribe_step(
    db,
    secret: bytes,
    alias: str,
    action_desc: str,
    prev: str,
    prompt: str,
    output: str,
    memrefs: Optional[list[str]] = None,
) -> str:
    """Create and store an ARC action record for a research step."""
    rec = arc.build_record(
        "action",
        secret,
        action_desc,
        prev=prev,
        memrefs=memrefs or [],
        ihash=arc.sha256hex(prompt.encode()),
        ohash=arc.sha256hex(output.encode()),
        alias=alias,
    )
    if not arc.verify_sig(rec):
        raise ValueError("Signature verification failed")
    return arc.store(db, rec)


# ── LangGraph Nodes ──────────────────────────────────────────────────────────


def init_agent(state: ResearchState) -> dict:
    """Initialize agent identity and discover Memory DAG records."""
    db = arc.get_db()
    alias = "arc-deep-research"

    # Generate or load key
    try:
        secret = arc.load_key()
    except Exception:
        arc.generate_keypair(alias)
        secret = arc.load_key()

    pubkey = arc.xonly_pubkey(secret).hex()

    # Find existing chain head or create genesis
    rows = arc.fetch_by_pubkey(db, pubkey)
    if not rows:
        genesis = arc.build_record(
            "genesis", secret,
            "Deep Research Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    # Discover Memory DAG records for memrefs
    dag_refs = _find_dag_records(db)

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
    }


def plan_node(state: ResearchState) -> dict:
    """Plan the research approach via Ollama."""
    query = state["query"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are a deep research agent operating under ARC Protocol "
        f"(Agent Record Convention) on Bitcoin. "
        f"Plan a thorough research approach for this query:\n\n"
        f"Query: {query}\n\n"
        f"Provide a structured research plan with 3-4 key areas to investigate. "
        f"Be specific and actionable. Format as numbered steps."
    )
    plan = _llm(prompt, model)

    # Inscribe the plan
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Research plan: {query[:80]}",
        prev, prompt, plan,
    )

    return {
        "plan": plan,
        "record_ids": state["record_ids"] + [rid],
    }


def research_node(state: ResearchState) -> dict:
    """Execute deep research via Ollama."""
    query = state["query"]
    plan = state["plan"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are a deep research agent inscribing findings on Bitcoin via ARC Protocol.\n\n"
        f"Original query: {query}\n"
        f"Research plan:\n{plan}\n\n"
        f"Execute the research plan. Provide detailed findings for each area. "
        f"Include specific data points, technical details, and evidence. "
        f"Be thorough — this output will be permanently inscribed as a Bitcoin Ordinal."
    )
    research = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # Reference Memory DAG records in the research step
    memrefs = state.get("dag_memrefs", [])[:3]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Deep research: {query[:80]}",
        prev, prompt, research,
        memrefs=memrefs,
    )

    return {
        "research": research,
        "record_ids": state["record_ids"] + [rid],
    }


def analyze_node(state: ResearchState) -> dict:
    """Analyze research findings via Ollama."""
    query = state["query"]
    research = state["research"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are an analysis agent under ARC Protocol (Bitcoin-native AI provenance).\n\n"
        f"Query: {query}\n"
        f"Research findings:\n{research[:2000]}\n\n"
        f"Analyze these findings critically:\n"
        f"1. Key insights and patterns\n"
        f"2. Confidence levels for each finding\n"
        f"3. Gaps or contradictions in the research\n"
        f"4. Actionable recommendations\n"
        f"Be rigorous — this analysis is cryptographically signed and chain-linked."
    )
    analysis = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Analysis: {query[:80]}",
        prev, prompt, analysis,
    )

    return {
        "analysis": analysis,
        "record_ids": state["record_ids"] + [rid],
    }


def synthesize_node(state: ResearchState) -> dict:
    """Synthesize all findings into final output."""
    query = state["query"]
    plan = state["plan"]
    research = state["research"]
    analysis = state["analysis"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are the synthesis layer of an ARC Protocol deep research agent.\n"
        f"Every output is inscribed on Bitcoin as a permanent, signed record.\n\n"
        f"Query: {query}\n"
        f"Plan:\n{plan[:500]}\n"
        f"Research:\n{research[:1500]}\n"
        f"Analysis:\n{analysis[:1500]}\n\n"
        f"Synthesize everything into a comprehensive final report:\n"
        f"- Executive summary (2-3 sentences)\n"
        f"- Key findings (numbered)\n"
        f"- Technical deep-dive\n"
        f"- Recommendations\n"
        f"- Confidence assessment\n"
        f"This is the final inscription — make it definitive."
    )
    synthesis = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # Final synthesis references ALL Memory DAG records
    memrefs = state.get("dag_memrefs", [])

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Synthesis: {query[:80]}",
        prev, prompt, synthesis,
        memrefs=memrefs,
    )

    return {
        "synthesis": synthesis,
        "record_ids": state["record_ids"] + [rid],
    }


def inscribe_node(state: ResearchState) -> dict:
    """Generate final Bitcoin inscription command and build chain."""
    db = arc.get_db()
    final_id = state["record_ids"][-1]
    final_rec = arc.fetch(db, final_id)

    inscription_cmd = ""
    if final_rec:
        inscription_cmd = arc.inscription_envelope(final_rec)

    # Build full chain for the viewer
    chain = []
    for rid in state["record_ids"]:
        rec = arc.fetch(db, rid)
        if rec:
            chain.append({"id": rid, "record": rec})

    return {
        "final_id": final_id,
        "inscription_cmd": inscription_cmd,
        "chain": chain,
    }


# ── Build LangGraph ──────────────────────────────────────────────────────────


def build_research_graph():
    """Compile the LangGraph research agent."""
    graph = StateGraph(ResearchState)

    graph.add_node("init", init_agent)
    graph.add_node("plan", plan_node)
    graph.add_node("research", research_node)
    graph.add_node("analyze", analyze_node)
    graph.add_node("synthesize", synthesize_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "plan")
    graph.add_edge("plan", "research")
    graph.add_edge("research", "analyze")
    graph.add_edge("analyze", "synthesize")
    graph.add_edge("synthesize", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


# Compiled agent — import and invoke
research_agent = build_research_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def run_research(query: str, model: str = "llama3.2") -> dict:
    """Run the full research pipeline. Returns results + ARC chain."""
    result = research_agent.invoke({
        "query": query,
        "model": model,
        "plan": "",
        "research": "",
        "analysis": "",
        "synthesis": "",
        "record_ids": [],
        "dag_memrefs": [],
        "agent_pubkey": "",
        "agent_alias": "",
        "final_id": "",
        "inscription_cmd": "",
        "chain": [],
        "error": "",
    })

    if result.get("error"):
        raise ValueError(result["error"])

    return {
        "query": query,
        "plan": result.get("plan", ""),
        "research": result.get("research", ""),
        "analysis": result.get("analysis", ""),
        "synthesis": result.get("synthesis", ""),
        "record_ids": result.get("record_ids", []),
        "dag_memrefs": result.get("dag_memrefs", []),
        "final_id": result.get("final_id", ""),
        "inscription_cmd": result.get("inscription_cmd", ""),
        "chain": result.get("chain", []),
        "agent_pubkey": result.get("agent_pubkey", ""),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import sys

    query = " ".join(sys.argv[1:]) or "Analyze Bitcoin Taproot adoption and implications for AI agent identity"
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;34;197;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'═' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol – Deep Research Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'═' * 58}{RESET}\n")
    print(f"  {CYAN}●{RESET} Query: {query}")
    print(f"  {CYAN}●{RESET} Model: {model}\n")

    result = run_research(query, model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}●{RESET} Records created: {len(result['record_ids'])}")
    print(f"  {ORANGE}●{RESET} DAG memrefs:     {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}●{RESET} Final record:     {result['final_id'][:20]}...")
    print(f"  {GREEN}●{RESET} Agent pubkey:     {result['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:40]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print()
