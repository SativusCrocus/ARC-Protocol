"""ARC Codegen Agent – LangGraph + Ollama
Code generation agent that inscribes every generated script/repo as an ARC Action record.
References Marketplace + Research Agent records via memrefs for full provenance.

Architecture (LangGraph StateGraph):
    init → plan → generate → review → inscribe → END

Each node calls Ollama for inference and creates a signed ARC action record.
The final inscription memrefs all prior steps + existing Marketplace/Research records.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── State Schema ──────────────────────────────────────────────────────────────


class CodegenState(TypedDict):
    prompt: str
    language: str
    model: str
    plan: str
    code: str
    review: str
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
    for alt in ("llama3.1:8b", "llama3.1", "qwen2.5:14b", "mistral"):
        if alt != model:
            result = arc.ollama_generate(prompt, alt)
            if result:
                return result
    return f"[simulated] Code output for: {prompt[:120]}"


# ── DAG Discovery ────────────────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Find existing Marketplace, Research, and Codegen records for memrefs."""
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "marketplace", "arc-codegen",
    }
    found = []
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target_aliases:
            found.append(rid)
    return found[:8]


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
    """Create and store an ARC action record for a codegen step."""
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


def init_agent(state: CodegenState) -> dict:
    """Initialize codegen agent identity and discover related records."""
    db = arc.get_db()
    alias = "arc-codegen"

    try:
        secret = arc.load_key()
    except Exception:
        arc.generate_keypair(alias)
        secret = arc.load_key()

    pubkey = arc.xonly_pubkey(secret).hex()

    rows = arc.fetch_by_pubkey(db, pubkey)
    if not rows:
        genesis = arc.build_record(
            "genesis", secret,
            "Code Generator Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_related_records(db)

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
    }


def plan_node(state: CodegenState) -> dict:
    """Plan the code architecture via Ollama."""
    prompt_text = state["prompt"]
    language = state["language"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are an expert code architect operating under ARC Protocol "
        f"(Agent Record Convention) on Bitcoin.\n\n"
        f"Task: {prompt_text}\n"
        f"Language: {language}\n\n"
        f"Plan the code architecture:\n"
        f"1. File structure and modules needed\n"
        f"2. Key functions/classes with signatures\n"
        f"3. Dependencies and imports\n"
        f"4. Error handling strategy\n"
        f"Be specific — this plan will guide code generation."
    )
    plan = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Codegen plan: {prompt_text[:80]}",
        prev, llm_prompt, plan,
    )

    return {
        "plan": plan,
        "record_ids": state["record_ids"] + [rid],
    }


def generate_node(state: CodegenState) -> dict:
    """Generate the code via Ollama."""
    prompt_text = state["prompt"]
    language = state["language"]
    plan = state["plan"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are an expert {language} developer. Generate production-ready code.\n"
        f"Every output is inscribed on Bitcoin via ARC Protocol as permanent provenance.\n\n"
        f"Task: {prompt_text}\n"
        f"Language: {language}\n"
        f"Architecture Plan:\n{plan[:2000]}\n\n"
        f"Generate the complete, working code. Include:\n"
        f"- All imports and dependencies\n"
        f"- Complete implementation with error handling\n"
        f"- Inline comments for complex logic\n"
        f"- Usage example at the bottom\n\n"
        f"Output ONLY the code, no markdown fences."
    )
    code = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[:3]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Generated {language}: {prompt_text[:60]}",
        prev, llm_prompt, code,
        memrefs=memrefs,
    )

    return {
        "code": code,
        "record_ids": state["record_ids"] + [rid],
    }


def review_node(state: CodegenState) -> dict:
    """Review and validate the generated code."""
    prompt_text = state["prompt"]
    language = state["language"]
    code = state["code"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are a senior code reviewer under ARC Protocol (Bitcoin-native AI provenance).\n\n"
        f"Task: {prompt_text}\n"
        f"Language: {language}\n"
        f"Code:\n{code[:3000]}\n\n"
        f"Review this code:\n"
        f"1. Correctness — does it fulfill the task?\n"
        f"2. Security — any vulnerabilities?\n"
        f"3. Performance — any obvious bottlenecks?\n"
        f"4. Style — follows {language} conventions?\n"
        f"5. Quality score (1-10)\n"
        f"Be rigorous — this review is cryptographically signed."
    )
    review = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Code review: {prompt_text[:80]}",
        prev, llm_prompt, review,
    )

    return {
        "review": review,
        "record_ids": state["record_ids"] + [rid],
    }


def inscribe_node(state: CodegenState) -> dict:
    """Generate final Bitcoin inscription command and build chain."""
    db = arc.get_db()
    final_id = state["record_ids"][-1]
    final_rec = arc.fetch(db, final_id)

    inscription_cmd = ""
    if final_rec:
        inscription_cmd = arc.inscription_envelope(final_rec)

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


def build_codegen_graph():
    """Compile the LangGraph codegen agent."""
    graph = StateGraph(CodegenState)

    graph.add_node("init", init_agent)
    graph.add_node("plan", plan_node)
    graph.add_node("generate", generate_node)
    graph.add_node("review", review_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "plan")
    graph.add_edge("plan", "generate")
    graph.add_edge("generate", "review")
    graph.add_edge("review", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


codegen_agent = build_codegen_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def run_codegen(prompt: str, language: str = "python", model: str = "llama3.2") -> dict:
    """Run the full codegen pipeline. Returns code + ARC chain."""
    result = codegen_agent.invoke({
        "prompt": prompt,
        "language": language,
        "model": model,
        "plan": "",
        "code": "",
        "review": "",
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
        "prompt": prompt,
        "language": language,
        "plan": result.get("plan", ""),
        "code": result.get("code", ""),
        "review": result.get("review", ""),
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

    prompt = " ".join(sys.argv[1:]) or "Create a Python script that monitors Bitcoin mempool fees"
    language = "python"
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--lang" and i + 1 < len(sys.argv):
            language = sys.argv[i + 1]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;34;197;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Code Generator Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {CYAN}*{RESET} Prompt:   {prompt}")
    print(f"  {CYAN}*{RESET} Language: {language}")
    print(f"  {CYAN}*{RESET} Model:    {model}\n")

    result = run_codegen(prompt, language, model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Records created: {len(result['record_ids'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:     {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}*{RESET} Final record:     {result['final_id'][:20]}...")
    print(f"  {GREEN}*{RESET} Agent pubkey:     {result['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:40]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print()
