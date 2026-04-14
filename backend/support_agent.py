"""ARC Customer Support Agent – LangGraph + Ollama

Autonomous customer support agent that inscribes every resolution ticket as
an ARC Action record. References Deep Research + Code Generator + DeFi Trader
+ Legal Contracts + Design & Images records + the original seeded Memory DAG
via memrefs so every resolution is cryptographically anchored to the full
certified-agent provenance lattice.

Architecture (LangGraph StateGraph):
    init -> triage -> diagnose -> draft -> qa -> inscribe -> END

Each node calls Ollama for inference and creates a signed ARC action record.
The final inscription memrefs every live certified-agent record + the
original seeded Memory DAG, so any resolved ticket is cryptographically
anchored across the whole ARC lattice.
"""

import os
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Issue Types ───────────────────────────────────────────────────────────────


ISSUES: dict[str, dict] = {
    "billing": {
        "name": "Billing & Payments",
        "summary": (
            "Lightning-settled billing disputes, missing sats, invoice refunds, "
            "and settlement receipt reconciliation anchored to the ARC chain."
        ),
        "playbook": [
            "Verify payment_hash against settlement record on chain",
            "Re-fetch Lightning invoice + cross-check preimage",
            "Diff ARC settlement inscription vs. internal ledger",
            "Issue ARC-anchored refund or credit note",
            "Escalate to arc-legal if contract milestone failed",
        ],
    },
    "technical": {
        "name": "Technical Issue",
        "summary": (
            "Integration failures, agent crashes, DAG walk errors, inscription "
            "envelope rejections — resolved with a memref-linked patch record."
        ),
        "playbook": [
            "Reproduce failure path locally + capture ihash",
            "Walk prev chain to last known-good record",
            "Patch code via arc-codegen memref or hotfix inscription",
            "Deep-verify Schnorr signatures across affected records",
            "Publish post-mortem as ARC action with full memref anchor",
        ],
    },
    "account": {
        "name": "Account & Keys",
        "summary": (
            "Key rotation, alias changes, pubkey disputes, agent onboarding "
            "and recovery flows — every state change inscribed with memrefs."
        ),
        "playbook": [
            "Validate caller identity via BIP-340 challenge-response",
            "Inscribe new genesis if rotating primary key",
            "Migrate alias via memref to old pubkey chain",
            "Notify arc-indexer + arc-relayer of identity delta",
            "Store recovery attestation as signed ARC action",
        ],
    },
    "onboarding": {
        "name": "Onboarding",
        "summary": (
            "New agent spin-up, genesis inscription, first memref, walkthrough "
            "of the certified-agent mesh — white-glove intake with chain proof."
        ),
        "playbook": [
            "Greet caller + collect agent intent summary",
            "Create genesis inscription with provisional alias",
            "Seed first memref into arc-deep-research DAG",
            "Walk caller through Certified Agents + Marketplace",
            "Close ticket with welcome settlement (0 sats or bounty credit)",
        ],
    },
    "dispute": {
        "name": "Service Dispute",
        "summary": (
            "Contract performance disputes, undelivered marketplace jobs, "
            "contested settlements — resolved via ARC Memory DAG walk."
        ),
        "playbook": [
            "Pull the full job chain from arc-legal + marketplace",
            "Walk memref DAG for prior deliveries / SLA breaches",
            "Compute fault allocation against contract clauses",
            "Draft remediation inscription (refund / redo / arbitration)",
            "Cross-post to arc-relayer for public dispute record",
        ],
    },
    "general": {
        "name": "General Inquiry",
        "summary": (
            "Protocol questions, ARC tooling help, general ecosystem guidance "
            "— answered with an on-chain knowledge-base citation."
        ),
        "playbook": [
            "Classify question against the ARC documentation index",
            "Cite relevant certified-agent records as memrefs",
            "Draft a plain-language answer + worked example",
            "Inscribe answer as a public ARC action for future recall",
            "Offer follow-up path to the matching certified agent",
        ],
    },
}


# ── State Schema ──────────────────────────────────────────────────────────────


class SupportState(TypedDict):
    prompt: str
    issue_type: str
    customer: str
    priority: str
    model: str
    issue_name: str
    triage: str
    diagnosis: str
    resolution: str
    qa: str
    record_ids: list[str]
    dag_memrefs: list[str]
    agent_pubkey: str
    agent_alias: str
    final_id: str
    inscription_cmd: str
    chain: list[dict]
    conversation: list[dict]
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
    return f"[simulated] Support response for: {prompt[:120]}"


# ── Cross-Agent DAG Discovery ────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Collect memrefs spanning the full ARC certified-agent DAG + seed.

    Support tickets resolve across EVERY certified agent — Research, Codegen,
    Trader, Legal, Design, plus the infra mesh (indexer, oracle, validator).
    Returns up to 14 record ids covering that breadth so every ticket has a
    deep provenance anchor.
    """
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "arc-analyst",
        "arc-codegen",
        "arc-defi-trader",
        "arc-legal",
        "arc-design",
        "marketplace",
        "arc-validator", "arc-oracle", "arc-indexer",
        "arc-relayer", "arc-watchtower", "arc-bridge",
        "arc-support",
    }
    by_alias: dict[str, list[str]] = {}
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target_aliases:
            by_alias.setdefault(alias, []).append(rid)

    found: list[str] = []
    for alias, ids in by_alias.items():
        if ids:
            found.append(ids[-1])
    for alias, ids in by_alias.items():
        if len(ids) > 1:
            found.append(ids[-2])
        if len(found) >= 14:
            break
    return found[:14]


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
    """Create and store an ARC action record for a support-agent step."""
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


def init_agent(state: SupportState) -> dict:
    """Initialize support agent identity + discover cross-agent DAG records."""
    db = arc.get_db()
    alias = "arc-support"

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
            "Customer Support Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_related_records(db)
    issue_key = (state.get("issue_type") or "general").lower()
    issue = ISSUES.get(issue_key, ISSUES["general"])

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "issue_name": issue["name"],
        "conversation": [
            {
                "role": "customer",
                "text": state["prompt"],
                "ts": state.get("prompt", "")[:0],  # placeholder – real ts set client-side
            },
        ],
    }


def triage_node(state: SupportState) -> dict:
    """Triage the incoming ticket: classify, set priority, surface risks."""
    issue_key = (state.get("issue_type") or "general").lower()
    issue = ISSUES.get(issue_key, ISSUES["general"])
    prompt_text = state["prompt"]
    customer = state.get("customer") or "agent-customer"
    priority = state.get("priority") or "P2"
    model = state.get("model", "llama3.2")

    playbook = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(issue["playbook"]))
    llm_prompt = (
        f"You are a senior customer-support engineer for the ARC Protocol "
        f"(Bitcoin-native Agent Record Convention). Every note you write is "
        f"signed with BIP-340 Schnorr + inscribed as an immutable ARC record.\n\n"
        f"Issue category: {issue['name']}\n"
        f"Priority: {priority}\n"
        f"Customer agent: {customer}\n\n"
        f"Ticket:\n{prompt_text}\n\n"
        f"Category summary: {issue['summary']}\n\n"
        f"Standard playbook:\n{playbook}\n\n"
        f"Produce a triage note covering:\n"
        f"1. Restated problem in one sentence\n"
        f"2. Likely root-cause hypothesis\n"
        f"3. Severity + confirmed priority (P0/P1/P2/P3)\n"
        f"4. Which certified agents this ticket likely memrefs\n"
        f"5. First-contact SLA target"
    )
    triage = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[:3]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Support triage ({issue['name']}): {prompt_text[:80]}",
        prev, llm_prompt, triage,
        memrefs=memrefs,
    )

    convo = list(state.get("conversation", []))
    convo.append({"role": "support", "phase": "triage", "text": triage})

    return {
        "triage": triage,
        "record_ids": state["record_ids"] + [rid],
        "conversation": convo,
    }


def diagnose_node(state: SupportState) -> dict:
    """Deep diagnosis — walk the certified-agent DAG to find contributing records."""
    issue_key = (state.get("issue_type") or "general").lower()
    issue = ISSUES.get(issue_key, ISSUES["general"])
    triage = state["triage"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the ARC Protocol diagnostics engineer. You have the triage "
        f"note below plus the ability to memref into the certified-agent DAG.\n\n"
        f"Triage:\n{triage[:3000]}\n\n"
        f"Produce a diagnosis:\n"
        f"1. Which certified agent chain (Research / Codegen / Trader / "
        f"   Legal / Design) is most implicated\n"
        f"2. Specific memref walk: what would a deep validator check?\n"
        f"3. Likely faulty record type (genesis / action / settlement)\n"
        f"4. Reproduction or repro-plan against the live ARC chain\n"
        f"5. Confidence level + fallback path if hypothesis is wrong"
    )
    diagnosis = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[3:8]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Support diagnosis: {issue['name']} — DAG walk",
        prev, llm_prompt, diagnosis,
        memrefs=memrefs,
    )

    convo = list(state.get("conversation", []))
    convo.append({"role": "support", "phase": "diagnose", "text": diagnosis})

    return {
        "diagnosis": diagnosis,
        "record_ids": state["record_ids"] + [rid],
        "conversation": convo,
    }


def draft_node(state: SupportState) -> dict:
    """Draft the customer-facing resolution + next steps."""
    issue_key = (state.get("issue_type") or "general").lower()
    issue = ISSUES.get(issue_key, ISSUES["general"])
    triage = state["triage"]
    diagnosis = state["diagnosis"]
    customer = state.get("customer") or "agent-customer"
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are writing the customer-facing resolution email for an ARC "
        f"Protocol support ticket. Warm, precise, technical, zero fluff.\n\n"
        f"Customer: {customer}\n"
        f"Category: {issue['name']}\n"
        f"Triage:\n{triage[:1500]}\n\n"
        f"Diagnosis:\n{diagnosis[:2000]}\n\n"
        f"Produce the reply:\n"
        f"1. One-line acknowledgement of the issue\n"
        f"2. What we found (plain English, reference memref'd agents by name)\n"
        f"3. The fix / workaround / refund path\n"
        f"4. What the customer should do next (numbered steps)\n"
        f"5. Timeline + how they'll verify resolution on-chain\n"
        f"Sign off as 'ARC Customer Support (arc-support)'."
    )
    resolution = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[6:11]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Support resolution draft: {issue['name']}",
        prev, llm_prompt, resolution,
        memrefs=memrefs,
    )

    convo = list(state.get("conversation", []))
    convo.append({"role": "support", "phase": "resolution", "text": resolution})

    return {
        "resolution": resolution,
        "record_ids": state["record_ids"] + [rid],
        "conversation": convo,
    }


def qa_node(state: SupportState) -> dict:
    """QA pass — verify the resolution is safe, complete, and chain-anchored."""
    resolution = state["resolution"]
    issue_key = (state.get("issue_type") or "general").lower()
    issue = ISSUES.get(issue_key, ISSUES["general"])
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the QA reviewer on the ARC Support team. Audit the drafted "
        f"resolution for correctness + tone + chain-anchoring.\n\n"
        f"Category: {issue['name']}\n"
        f"Resolution draft:\n{resolution[:3500]}\n\n"
        f"Produce a QA note:\n"
        f"1. Factual correctness (pass/fail + specifics)\n"
        f"2. Tone (empathetic / professional / clear)\n"
        f"3. Chain-anchoring check: are the memref claims verifiable?\n"
        f"4. Compliance: no promises beyond ARC Protocol authority\n"
        f"5. Sign-off: READY-TO-SEND or NEEDS-REVISION + specific edits"
    )
    qa = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[9:14]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Support QA pass: {issue['name']}",
        prev, llm_prompt, qa,
        memrefs=memrefs,
    )

    convo = list(state.get("conversation", []))
    convo.append({"role": "support", "phase": "qa", "text": qa})

    return {
        "qa": qa,
        "record_ids": state["record_ids"] + [rid],
        "conversation": convo,
    }


def inscribe_node(state: SupportState) -> dict:
    """Final inscription — bind the full DAG, emit ord command and chain."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    all_refs = state.get("dag_memrefs", [])
    final_refs = all_refs[:10] + all_refs[10:14]
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    issue_key = (state.get("issue_type") or "general").lower()
    issue = ISSUES.get(issue_key, ISSUES["general"])

    final_action = (
        f"Support ticket resolved ({issue['name']}): "
        f"{state['prompt'][:80]}"
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(state["prompt"].encode()),
        ohash=arc.sha256hex(
            (state.get("resolution", "") + state.get("qa", "")).encode()
        ),
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


def build_support_graph():
    """Compile the LangGraph customer-support agent."""
    graph = StateGraph(SupportState)

    graph.add_node("init", init_agent)
    graph.add_node("triage", triage_node)
    graph.add_node("diagnose", diagnose_node)
    graph.add_node("draft", draft_node)
    graph.add_node("qa", qa_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "triage")
    graph.add_edge("triage", "diagnose")
    graph.add_edge("diagnose", "draft")
    graph.add_edge("draft", "qa")
    graph.add_edge("qa", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


support_agent = build_support_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_issue_types() -> list[dict]:
    """Return the available support issue types (metadata only)."""
    return [
        {
            "key": key,
            "name": issue["name"],
            "summary": issue["summary"],
            "playbook": issue["playbook"],
        }
        for key, issue in ISSUES.items()
    ]


def run_support(
    prompt: str,
    issue_type: str = "general",
    customer: str = "",
    priority: str = "P2",
    model: str = "llama3.2",
) -> dict:
    """Run the full support pipeline. Returns resolution + ARC chain."""
    result = support_agent.invoke({
        "prompt": prompt,
        "issue_type": issue_type,
        "customer": customer,
        "priority": priority,
        "model": model,
        "issue_name": "",
        "triage": "",
        "diagnosis": "",
        "resolution": "",
        "qa": "",
        "record_ids": [],
        "dag_memrefs": [],
        "agent_pubkey": "",
        "agent_alias": "",
        "final_id": "",
        "inscription_cmd": "",
        "chain": [],
        "conversation": [],
        "dispute_link": "",
        "error": "",
    })

    if result.get("error"):
        raise ValueError(result["error"])

    return {
        "prompt": prompt,
        "issue_type": issue_type,
        "issue_name": result.get("issue_name", ""),
        "customer": customer,
        "priority": priority,
        "triage": result.get("triage", ""),
        "diagnosis": result.get("diagnosis", ""),
        "resolution": result.get("resolution", ""),
        "qa": result.get("qa", ""),
        "conversation": result.get("conversation", []),
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
        "Our marketplace job was delivered but the Lightning settlement never "
        "confirmed and the contract milestone is stuck. Please help reconcile."
    )
    issue_type = "dispute"
    customer = "agent-l2-startup"
    priority = "P1"
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--issue" and i + 1 < len(sys.argv):
            issue_type = sys.argv[i + 1]
        if arg == "--customer" and i + 1 < len(sys.argv):
            customer = sys.argv[i + 1]
        if arg == "--priority" and i + 1 < len(sys.argv):
            priority = sys.argv[i + 1]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GOLD = "\033[38;2;234;179;8m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;34;197;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Customer Support Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {GOLD}*{RESET} Issue:     {issue_type}")
    print(f"  {GOLD}*{RESET} Customer:  {customer}")
    print(f"  {GOLD}*{RESET} Priority:  {priority}")
    print(f"  {GOLD}*{RESET} Model:     {model}")
    print(f"  {GOLD}*{RESET} Prompt:    {prompt[:80]}\n")

    result = run_support(prompt, issue_type, customer, priority, model)

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
