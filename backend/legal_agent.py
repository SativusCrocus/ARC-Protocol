"""ARC Legal Contracts Agent – LangGraph + Ollama
Autonomous legal drafting agent that inscribes every contract as an ARC Action
record. References Deep Research + Code Generator + DeFi Trader + Memory DAG
records via memrefs for full cross-agent provenance.

Architecture (LangGraph StateGraph):
    init → draft → clauses → compliance → inscribe → END

Each node calls Ollama for inference and creates a signed ARC action record.
The final inscription memrefs every live certified-agent record + the original
seeded Memory DAG, so any drafted contract is cryptographically anchored to
the full ARC provenance lattice.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Contract Templates ────────────────────────────────────────────────────────


TEMPLATES: dict[str, dict] = {
    "nda": {
        "name": "Mutual Non-Disclosure Agreement",
        "preamble": (
            "This Mutual Non-Disclosure Agreement (NDA) is entered into between "
            "the parties identified below and governs the exchange of "
            "confidential information in contemplation of a potential "
            "business relationship anchored on the ARC Protocol (Bitcoin-native "
            "Agent Record Convention)."
        ),
        "clauses": [
            "Definition of Confidential Information",
            "Permitted Use and Restrictions",
            "Term and Survival (3 years post-termination)",
            "Return or Destruction of Materials",
            "Remedies and Equitable Relief",
            "ARC Provenance Anchor (memref of every disclosure action)",
            "Governing Law and Jurisdiction",
        ],
    },
    "service": {
        "name": "Service Agreement",
        "preamble": (
            "This Service Agreement governs the provision of services between "
            "Provider and Client, with deliverables, milestones, and "
            "Lightning-settled compensation fully anchored to the ARC Protocol."
        ),
        "clauses": [
            "Scope of Services and Deliverables",
            "Milestones and Acceptance Criteria",
            "Compensation (Lightning / on-chain sats denominated)",
            "Intellectual Property Ownership",
            "Warranties and Representations",
            "Termination for Cause and Convenience",
            "Dispute Resolution via ARC Memory DAG walk",
            "ARC Settlement Inscriptions as Payment Receipts",
        ],
    },
    "license": {
        "name": "Software / IP License Agreement",
        "preamble": (
            "This License Agreement grants the Licensee rights to use the "
            "Licensed Materials subject to the terms below. Every grant, "
            "sublicense and audit event is inscribed as an ARC Action for "
            "immutable royalty attribution."
        ),
        "clauses": [
            "Grant of License (scope, exclusivity, territory)",
            "Permitted and Prohibited Uses",
            "Royalties and ARC-Anchored Usage Metering",
            "Warranties and Limitation of Liability",
            "Indemnification",
            "Term, Termination and Reversion",
            "Audit Rights (verified against ARC chain)",
            "Export and Compliance",
        ],
    },
    "custom": {
        "name": "Custom Contract",
        "preamble": (
            "This agreement is drafted by the ARC Legal Agent to the parties' "
            "custom specification. Every clause is generated under ARC Protocol "
            "provenance and memref'd against the full certified-agent DAG."
        ),
        "clauses": [
            "Recitals",
            "Definitions",
            "Core Obligations",
            "Compensation / Consideration",
            "Warranties",
            "Risk Allocation",
            "Termination",
            "Dispute Resolution via ARC Memory DAG",
            "ARC Provenance Anchors",
        ],
    },
}


# ── State Schema ──────────────────────────────────────────────────────────────


class LegalState(TypedDict):
    prompt: str
    template: str
    parties: str
    jurisdiction: str
    model: str
    template_name: str
    draft: str
    clauses: str
    compliance: str
    record_ids: list[str]
    dag_memrefs: list[str]
    agent_pubkey: str
    agent_alias: str
    final_id: str
    inscription_cmd: str
    chain: list[dict]
    dispute_link: str
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
    return f"[simulated] Legal draft for: {prompt[:120]}"


# ── Cross-Agent DAG Discovery ────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Collect memrefs spanning the full ARC certified-agent DAG + seed.

    The legal agent's whole value proposition is that contracts are anchored
    to *every* live agent's chain — Research, Codegen, Trader, Marketplace,
    plus the original seeded Memory DAG. This function walks the DB and
    returns up to 12 record ids covering that breadth.
    """
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "arc-analyst",
        "arc-codegen",
        "arc-defi-trader",
        "marketplace",
        "arc-validator", "arc-oracle", "arc-indexer",
        "arc-legal",
    }
    # Group one reference per alias so the final memref list spans the DAG
    # breadth-first instead of saturating with a single agent's chain.
    by_alias: dict[str, list[str]] = {}
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target_aliases:
            by_alias.setdefault(alias, []).append(rid)

    found: list[str] = []
    # First pass: latest record from each alias.
    for alias, ids in by_alias.items():
        if ids:
            found.append(ids[-1])
    # Second pass: second-latest to deepen provenance.
    for alias, ids in by_alias.items():
        if len(ids) > 1:
            found.append(ids[-2])
        if len(found) >= 12:
            break
    return found[:12]


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
    """Create and store an ARC action record for a legal-agent step."""
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


def init_agent(state: LegalState) -> dict:
    """Initialize legal agent identity and discover cross-agent DAG records."""
    db = arc.get_db()
    alias = "arc-legal"

    key_file = arc.KEYS_DIR / f"{alias}.key"
    if key_file.exists():
        secret = bytes.fromhex(key_file.read_text().strip())
    else:
        try:
            arc.generate_keypair(alias)
        except Exception:
            pass
        if key_file.exists():
            secret = bytes.fromhex(key_file.read_text().strip())
        else:
            secret = arc.load_key()

    pubkey = arc.xonly_pubkey(secret).hex()

    rows = arc.fetch_by_pubkey(db, pubkey)
    if not rows:
        genesis = arc.build_record(
            "genesis", secret,
            "Legal Contracts Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_related_records(db)
    template_key = (state.get("template") or "custom").lower()
    tmpl = TEMPLATES.get(template_key, TEMPLATES["custom"])

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "template_name": tmpl["name"],
    }


def draft_node(state: LegalState) -> dict:
    """Draft the full contract body via Ollama using the selected template."""
    template_key = (state.get("template") or "custom").lower()
    tmpl = TEMPLATES.get(template_key, TEMPLATES["custom"])
    prompt_text = state["prompt"]
    parties = state.get("parties") or "Party A and Party B"
    jurisdiction = state.get("jurisdiction") or "Delaware, USA"
    model = state.get("model", "llama3.2")

    clauses_list = "\n".join(f"  {i+1}. {c}" for i, c in enumerate(tmpl["clauses"]))
    llm_prompt = (
        f"You are senior legal counsel drafting under the ARC Protocol "
        f"(Agent Record Convention on Bitcoin). Every clause you write will "
        f"be cryptographically signed and inscribed as an immutable ARC record.\n\n"
        f"Template: {tmpl['name']}\n"
        f"Parties: {parties}\n"
        f"Jurisdiction: {jurisdiction}\n\n"
        f"Client request:\n{prompt_text}\n\n"
        f"Template preamble:\n{tmpl['preamble']}\n\n"
        f"Required clauses (expand each into a full numbered section):\n"
        f"{clauses_list}\n\n"
        f"Draft the complete contract. Be precise, use formal legal prose, "
        f"include defined terms in Title Case, and end with a signature block. "
        f"Reference 'ARC Protocol provenance anchors' where relevant."
    )
    draft = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # First memref slice: top 4 cross-agent records to anchor the draft.
    memrefs = state.get("dag_memrefs", [])[:4]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Legal draft ({tmpl['name']}): {prompt_text[:80]}",
        prev, llm_prompt, draft,
        memrefs=memrefs,
    )

    return {
        "draft": draft,
        "record_ids": state["record_ids"] + [rid],
    }


def clauses_node(state: LegalState) -> dict:
    """Clause-by-clause review: surface ambiguities, missing terms, risk."""
    draft = state["draft"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are a contract review partner auditing a draft produced by the "
        f"ARC Legal Agent. Every note you write is cryptographically signed.\n\n"
        f"Draft:\n{draft[:4000]}\n\n"
        f"Produce a clause-by-clause review:\n"
        f"1. Ambiguities that need tightening\n"
        f"2. Missing standard clauses (boilerplate, severability, etc.)\n"
        f"3. Risk allocation imbalances between parties\n"
        f"4. Enforceability red flags\n"
        f"5. Recommended edits (be concrete)\n"
        f"Be rigorous — this review is permanently on-chain."
    )
    clauses = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Clause review: {state.get('template_name','contract')[:60]}",
        prev, llm_prompt, clauses,
    )

    return {
        "clauses": clauses,
        "record_ids": state["record_ids"] + [rid],
    }


def compliance_node(state: LegalState) -> dict:
    """Compliance + jurisdiction check, with ARC-specific provenance assertions."""
    draft = state["draft"]
    clauses = state["clauses"]
    jurisdiction = state.get("jurisdiction") or "Delaware, USA"
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are compliance counsel producing a jurisdiction memo for "
        f"{jurisdiction} under ARC Protocol (Bitcoin-native provenance).\n\n"
        f"Draft:\n{draft[:2500]}\n\n"
        f"Clause review:\n{clauses[:1500]}\n\n"
        f"Produce a compliance memo covering:\n"
        f"1. Jurisdictional enforceability in {jurisdiction}\n"
        f"2. Required regulatory disclosures (financial / data / export)\n"
        f"3. E-signature validity (ESIGN Act, eIDAS)\n"
        f"4. ARC-specific: how signed memref chain satisfies authenticity "
        f"   requirements for electronic records\n"
        f"5. Dispute-resolution fit with ARC Memory DAG walk\n"
        f"Sign off at the end with a pass/fail recommendation."
    )
    compliance = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # Second memref slice: additional cross-agent anchors.
    memrefs = state.get("dag_memrefs", [])[4:10]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Compliance memo: {jurisdiction}",
        prev, llm_prompt, compliance,
        memrefs=memrefs,
    )

    return {
        "compliance": compliance,
        "record_ids": state["record_ids"] + [rid],
    }


def inscribe_node(state: LegalState) -> dict:
    """Final inscription: bind the full DAG, emit ord command and chain."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # Third memref slice: remaining DAG anchors + first slice repeated so the
    # final envelope references every certified agent seen at init time.
    all_refs = state.get("dag_memrefs", [])
    final_refs = all_refs[:8] + all_refs[8:12]  # ensure up to 12 total, deduped below
    # Dedup while preserving order.
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    final_action = (
        f"Legal contract finalized ({state.get('template_name','custom')}): "
        f"{state['prompt'][:80]}"
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(state["prompt"].encode()),
        ohash=arc.sha256hex((state.get("draft","") + state.get("compliance","")).encode()),
    )
    if not arc.verify_sig(final_rec):
        return {"error": "Final signature verification failed"}
    final_id = arc.store(db, final_rec)

    inscription_cmd = arc.inscription_envelope(final_rec)

    record_ids = state["record_ids"] + [final_id]
    chain = []
    for rid in record_ids:
        rec = arc.fetch(db, rid)
        if rec:
            chain.append({"id": rid, "record": rec})

    return {
        "final_id": final_id,
        "inscription_cmd": inscription_cmd,
        "record_ids": record_ids,
        "chain": chain,
        "dispute_link": "/marketplace#demo",
    }


# ── Build LangGraph ──────────────────────────────────────────────────────────


def build_legal_graph():
    """Compile the LangGraph legal contracts agent."""
    graph = StateGraph(LegalState)

    graph.add_node("init", init_agent)
    graph.add_node("draft", draft_node)
    graph.add_node("clauses", clauses_node)
    graph.add_node("compliance", compliance_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "draft")
    graph.add_edge("draft", "clauses")
    graph.add_edge("clauses", "compliance")
    graph.add_edge("compliance", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


legal_agent = build_legal_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_templates() -> list[dict]:
    """Return the available contract templates (metadata only)."""
    return [
        {
            "key": key,
            "name": tmpl["name"],
            "clauses": tmpl["clauses"],
            "preamble": tmpl["preamble"],
        }
        for key, tmpl in TEMPLATES.items()
    ]


def run_legal(
    prompt: str,
    template: str = "custom",
    parties: str = "",
    jurisdiction: str = "Delaware, USA",
    model: str = "llama3.2",
) -> dict:
    """Run the full legal-drafting pipeline. Returns contract + ARC chain."""
    result = legal_agent.invoke({
        "prompt": prompt,
        "template": template,
        "parties": parties,
        "jurisdiction": jurisdiction,
        "model": model,
        "template_name": "",
        "draft": "",
        "clauses": "",
        "compliance": "",
        "record_ids": [],
        "dag_memrefs": [],
        "agent_pubkey": "",
        "agent_alias": "",
        "final_id": "",
        "inscription_cmd": "",
        "chain": [],
        "dispute_link": "",
        "error": "",
    })

    if result.get("error"):
        raise ValueError(result["error"])

    return {
        "prompt": prompt,
        "template": template,
        "template_name": result.get("template_name", ""),
        "parties": parties,
        "jurisdiction": jurisdiction,
        "draft": result.get("draft", ""),
        "clauses": result.get("clauses", ""),
        "compliance": result.get("compliance", ""),
        "record_ids": result.get("record_ids", []),
        "dag_memrefs": result.get("dag_memrefs", []),
        "final_id": result.get("final_id", ""),
        "inscription_cmd": result.get("inscription_cmd", ""),
        "chain": result.get("chain", []),
        "agent_pubkey": result.get("agent_pubkey", ""),
        "dispute_link": result.get("dispute_link", "/marketplace#demo"),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import sys

    prompt = " ".join(a for a in sys.argv[1:] if not a.startswith("--")) or (
        "Draft an NDA between an AI research lab and a Bitcoin Layer 2 startup "
        "for joint work on ARC-anchored inference provenance."
    )
    template = "nda"
    jurisdiction = "Delaware, USA"
    model = "llama3.2"
    parties = "AI Research Lab ('Lab') and L2 Startup ('Startup')"
    for i, arg in enumerate(sys.argv):
        if arg == "--template" and i + 1 < len(sys.argv):
            template = sys.argv[i + 1]
        if arg == "--jurisdiction" and i + 1 < len(sys.argv):
            jurisdiction = sys.argv[i + 1]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]
        if arg == "--parties" and i + 1 < len(sys.argv):
            parties = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GOLD = "\033[38;2;234;179;8m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;34;197;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Legal Contracts Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {GOLD}*{RESET} Template:      {template}")
    print(f"  {GOLD}*{RESET} Parties:       {parties}")
    print(f"  {GOLD}*{RESET} Jurisdiction:  {jurisdiction}")
    print(f"  {GOLD}*{RESET} Model:         {model}")
    print(f"  {GOLD}*{RESET} Prompt:        {prompt[:80]}\n")

    result = run_legal(prompt, template, parties, jurisdiction, model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Records created: {len(result['record_ids'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:     {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}*{RESET} Final record:    {result['final_id'][:20]}...")
    print(f"  {GREEN}*{RESET} Agent pubkey:    {result['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:48]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print(f"\n  {CYAN}Dispute:{RESET} {result['dispute_link']}\n")
