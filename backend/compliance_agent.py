"""ARC Compliance & Audit Agent – LangGraph + Ollama

Autonomous compliance + audit agent that inscribes every audit report as an
ARC Action record. References Deep Research + Code Generator + DeFi Trader
+ Legal Contracts + Design & Images + Customer Support records + the
original seeded Memory DAG via memrefs so every audit is cryptographically
anchored to the full certified-agent provenance lattice.

Architecture (LangGraph StateGraph):
    init -> scope -> audit -> evidence -> report -> inscribe -> END

Each node calls Ollama for inference and creates a signed ARC action record.
The final inscription memrefs every live certified-agent record + the
original seeded Memory DAG, so any audit is cryptographically anchored
across the whole ARC lattice.
"""

import os
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Compliance Types ─────────────────────────────────────────────────────────


COMPLIANCE_TYPES: dict[str, dict] = {
    "regulatory": {
        "name": "Regulatory",
        "summary": (
            "GDPR / MiCA / SOC-2 / AML regulatory-posture audit across the "
            "certified-agent mesh — anchored to the ARC provenance chain."
        ),
        "controls": [
            "Map each agent output to the governing regulatory regime",
            "Validate data-subject rights + right-to-erasure boundaries",
            "Check AML flags on any Lightning-settled action record",
            "Verify BIP-340 identity attestations for audit trail integrity",
            "Inscribe a regulator-ready evidence bundle as an ARC action",
        ],
    },
    "safety": {
        "name": "Safety",
        "summary": (
            "AI-safety + content-safety review: jailbreak resilience, unsafe "
            "outputs, prompt-injection defense, operational guardrails."
        ),
        "controls": [
            "Red-team each LangGraph node against the OWASP LLM Top-10",
            "Check for tool-use escalation and off-policy actions",
            "Score refusal quality and harmful-output rate",
            "Verify deterministic replay via ihash / ohash witnesses",
            "Publish safety scorecard as a signed ARC action",
        ],
    },
    "provenance": {
        "name": "Provenance",
        "summary": (
            "End-to-end chain walk: every memref + prev edge across all "
            "certified agents is BIP-340 verified and tamper-proof."
        ),
        "controls": [
            "Walk the full prev chain from genesis to head for each agent",
            "Validate every memref edge resolves to a real ARC record",
            "Deep-verify Schnorr signatures across the DAG",
            "Detect orphan records + re-org hazards",
            "Emit a chain-continuity attestation inscription",
        ],
    },
    "hallucination": {
        "name": "Hallucination",
        "summary": (
            "Factuality audit: detect hallucinated citations, fabricated "
            "chain-of-thought, or unverified external claims across agents."
        ),
        "controls": [
            "Cross-check cited memrefs against the live ARC DB",
            "Score claim-to-evidence ratio per agent output",
            "Flag any external citation without on-chain memref anchor",
            "Re-prompt the agent with a verifier-style critique loop",
            "Store the hallucination delta as an ARC action record",
        ],
    },
    "bias": {
        "name": "Bias",
        "summary": (
            "Fairness + bias audit: demographic parity, dispute outcome "
            "skew, model-output drift — measured against the ARC ledger."
        ),
        "controls": [
            "Slice dispute and settlement outcomes by agent + counterparty",
            "Measure refusal-rate skew across demographic prompts",
            "Compare signal/trade outcomes across market regimes",
            "Detect drift between seed-era and current model behaviour",
            "Publish bias-disclosure attestation as a signed ARC action",
        ],
    },
}


# ── State Schema ──────────────────────────────────────────────────────────────


class ComplianceState(TypedDict):
    prompt: str
    compliance_type: str
    subject: str
    severity: str
    model: str
    compliance_name: str
    scope: str
    audit: str
    evidence: str
    report: str
    record_ids: list[str]
    dag_memrefs: list[str]
    agent_pubkey: str
    agent_alias: str
    final_id: str
    inscription_cmd: str
    chain: list[dict]
    findings: list[dict]
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
    return f"[simulated] Compliance response for: {prompt[:120]}"


# ── Cross-Agent DAG Discovery ────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Collect memrefs spanning the full ARC certified-agent DAG + seed.

    Audits reference EVERY certified agent — Research, Codegen, Trader,
    Legal, Design, Support — plus the infra mesh (indexer, oracle,
    validator). Returns up to 16 record ids covering that breadth so every
    audit has a deep provenance anchor.
    """
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "arc-analyst",
        "arc-codegen",
        "arc-defi-trader",
        "arc-legal",
        "arc-design",
        "arc-support",
        "marketplace",
        "arc-validator", "arc-oracle", "arc-indexer",
        "arc-relayer", "arc-watchtower", "arc-bridge",
        "arc-compliance",
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
        if len(found) >= 16:
            break
    return found[:16]


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
    """Create and store an ARC action record for a compliance-agent step."""
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


def init_agent(state: ComplianceState) -> dict:
    """Initialize compliance agent identity + discover cross-agent DAG records."""
    db = arc.get_db()
    alias = "arc-compliance"

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
            "Compliance & Audit Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_related_records(db)
    ctype_key = (state.get("compliance_type") or "regulatory").lower()
    ctype = COMPLIANCE_TYPES.get(ctype_key, COMPLIANCE_TYPES["regulatory"])

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "compliance_name": ctype["name"],
        "findings": [],
    }


def scope_node(state: ComplianceState) -> dict:
    """Scope the audit: define controls, in-scope agents, severity budget."""
    ctype_key = (state.get("compliance_type") or "regulatory").lower()
    ctype = COMPLIANCE_TYPES.get(ctype_key, COMPLIANCE_TYPES["regulatory"])
    prompt_text = state["prompt"]
    subject = state.get("subject") or "arc-protocol-full-mesh"
    severity = state.get("severity") or "MEDIUM"
    model = state.get("model", "llama3.2")

    controls = "\n".join(f"  {i+1}. {c}" for i, c in enumerate(ctype["controls"]))
    llm_prompt = (
        f"You are the lead compliance + audit engineer for the ARC Protocol "
        f"(Bitcoin-native Agent Record Convention). Every audit note is "
        f"signed with BIP-340 Schnorr + inscribed as an immutable ARC record.\n\n"
        f"Audit type: {ctype['name']}\n"
        f"Severity budget: {severity}\n"
        f"Subject: {subject}\n\n"
        f"Audit request:\n{prompt_text}\n\n"
        f"Category summary: {ctype['summary']}\n\n"
        f"Standard control set:\n{controls}\n\n"
        f"Produce the audit scoping memo:\n"
        f"1. Restated objective in one sentence\n"
        f"2. In-scope agents (Research / Codegen / Trader / Legal / Design / Support)\n"
        f"3. Controls to exercise + why each matters here\n"
        f"4. Evidence the audit will rely on (memrefs, ihash/ohash, settlements)\n"
        f"5. Severity ceiling + stop conditions"
    )
    scope = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[:3]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Compliance scope ({ctype['name']}): {prompt_text[:80]}",
        prev, llm_prompt, scope,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "scope", "text": scope})

    return {
        "scope": scope,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def audit_node(state: ComplianceState) -> dict:
    """Execute the audit against the certified-agent DAG."""
    ctype_key = (state.get("compliance_type") or "regulatory").lower()
    ctype = COMPLIANCE_TYPES.get(ctype_key, COMPLIANCE_TYPES["regulatory"])
    scope = state["scope"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the ARC Protocol audit executor. You have the scoping memo "
        f"below plus the ability to walk the certified-agent DAG.\n\n"
        f"Scope:\n{scope[:3000]}\n\n"
        f"Perform the audit:\n"
        f"1. Control-by-control pass/fail matrix\n"
        f"2. Specific memref walks: what was checked on-chain?\n"
        f"3. Deviation log (what does NOT match policy) with severity\n"
        f"4. Reproduction path so any validator can rerun this audit\n"
        f"5. Confidence level + residual risk call-outs"
    )
    audit = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[3:8]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Compliance audit: {ctype['name']} — DAG walk",
        prev, llm_prompt, audit,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "audit", "text": audit})

    return {
        "audit": audit,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def evidence_node(state: ComplianceState) -> dict:
    """Gather evidence bundle — memref citations + chain snippets."""
    ctype_key = (state.get("compliance_type") or "regulatory").lower()
    ctype = COMPLIANCE_TYPES.get(ctype_key, COMPLIANCE_TYPES["regulatory"])
    audit = state["audit"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the ARC Protocol evidence compiler. Turn the audit "
        f"findings into a regulator-ready evidence bundle.\n\n"
        f"Audit findings:\n{audit[:3000]}\n\n"
        f"Produce the evidence bundle:\n"
        f"1. Numbered evidence items, each with a memref / record-id pointer\n"
        f"2. For each item: hash fingerprint (ihash / ohash / sig)\n"
        f"3. Counterparty + timestamp attestation\n"
        f"4. Cross-agent corroboration — who else signed the adjacent records\n"
        f"5. Gaps: where additional evidence is needed + how to get it"
    )
    evidence = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[6:12]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Compliance evidence bundle: {ctype['name']}",
        prev, llm_prompt, evidence,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "evidence", "text": evidence})

    return {
        "evidence": evidence,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def report_node(state: ComplianceState) -> dict:
    """Draft the final audit report — plain-language + attestation."""
    ctype_key = (state.get("compliance_type") or "regulatory").lower()
    ctype = COMPLIANCE_TYPES.get(ctype_key, COMPLIANCE_TYPES["regulatory"])
    scope = state["scope"]
    audit = state["audit"]
    evidence = state["evidence"]
    subject = state.get("subject") or "arc-protocol-full-mesh"
    severity = state.get("severity") or "MEDIUM"
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are writing the final {ctype['name']} audit report for the "
        f"ARC Protocol. Precise, regulator-ready, zero fluff.\n\n"
        f"Subject: {subject}\n"
        f"Severity budget: {severity}\n\n"
        f"Scope:\n{scope[:1200]}\n\n"
        f"Audit:\n{audit[:1800]}\n\n"
        f"Evidence:\n{evidence[:1800]}\n\n"
        f"Produce the report:\n"
        f"1. Executive summary (one paragraph)\n"
        f"2. Pass / conditional-pass / fail verdict with rationale\n"
        f"3. Findings list ordered by severity\n"
        f"4. Required remediations + owner agent\n"
        f"5. On-chain attestation block (memref citations)\n"
        f"Sign off as 'ARC Compliance & Audit (arc-compliance)'."
    )
    report = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[10:16]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Compliance report draft: {ctype['name']}",
        prev, llm_prompt, report,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "report", "text": report})

    return {
        "report": report,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def inscribe_node(state: ComplianceState) -> dict:
    """Final inscription — bind the full DAG, emit ord command and chain."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    all_refs = state.get("dag_memrefs", [])
    final_refs = all_refs[:12] + all_refs[12:16]
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    ctype_key = (state.get("compliance_type") or "regulatory").lower()
    ctype = COMPLIANCE_TYPES.get(ctype_key, COMPLIANCE_TYPES["regulatory"])

    final_action = (
        f"Compliance audit inscribed ({ctype['name']}): "
        f"{state['prompt'][:80]}"
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(state["prompt"].encode()),
        ohash=arc.sha256hex(
            (state.get("report", "") + state.get("evidence", "")).encode()
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


def build_compliance_graph():
    """Compile the LangGraph compliance & audit agent."""
    graph = StateGraph(ComplianceState)

    graph.add_node("init", init_agent)
    graph.add_node("scope", scope_node)
    graph.add_node("audit", audit_node)
    graph.add_node("evidence", evidence_node)
    graph.add_node("report", report_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "scope")
    graph.add_edge("scope", "audit")
    graph.add_edge("audit", "evidence")
    graph.add_edge("evidence", "report")
    graph.add_edge("report", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


compliance_agent = build_compliance_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_compliance_types() -> list[dict]:
    """Return the available compliance audit types (metadata only)."""
    return [
        {
            "key": key,
            "name": ctype["name"],
            "summary": ctype["summary"],
            "controls": ctype["controls"],
        }
        for key, ctype in COMPLIANCE_TYPES.items()
    ]


def run_compliance(
    prompt: str,
    compliance_type: str = "regulatory",
    subject: str = "",
    severity: str = "MEDIUM",
    model: str = "llama3.2",
) -> dict:
    """Run the full compliance audit pipeline. Returns report + ARC chain."""
    result = compliance_agent.invoke({
        "prompt": prompt,
        "compliance_type": compliance_type,
        "subject": subject,
        "severity": severity,
        "model": model,
        "compliance_name": "",
        "scope": "",
        "audit": "",
        "evidence": "",
        "report": "",
        "record_ids": [],
        "dag_memrefs": [],
        "agent_pubkey": "",
        "agent_alias": "",
        "final_id": "",
        "inscription_cmd": "",
        "chain": [],
        "findings": [],
        "dispute_link": "",
        "error": "",
    })

    if result.get("error"):
        raise ValueError(result["error"])

    return {
        "prompt": prompt,
        "compliance_type": compliance_type,
        "compliance_name": result.get("compliance_name", ""),
        "subject": subject,
        "severity": severity,
        "scope": result.get("scope", ""),
        "audit": result.get("audit", ""),
        "evidence": result.get("evidence", ""),
        "report": result.get("report", ""),
        "findings": result.get("findings", []),
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
        "Audit the ARC Protocol certified-agent mesh for provenance integrity "
        "and flag any memref edge that fails deep BIP-340 verification."
    )
    compliance_type = "provenance"
    subject = "arc-protocol-full-mesh"
    severity = "HIGH"
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--type" and i + 1 < len(sys.argv):
            compliance_type = sys.argv[i + 1]
        if arg == "--subject" and i + 1 < len(sys.argv):
            subject = sys.argv[i + 1]
        if arg == "--severity" and i + 1 < len(sys.argv):
            severity = sys.argv[i + 1]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GOLD = "\033[38;2;234;179;8m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;16;185;129m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Compliance & Audit Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {GOLD}*{RESET} Type:      {compliance_type}")
    print(f"  {GOLD}*{RESET} Subject:   {subject}")
    print(f"  {GOLD}*{RESET} Severity:  {severity}")
    print(f"  {GOLD}*{RESET} Model:     {model}")
    print(f"  {GOLD}*{RESET} Prompt:    {prompt[:80]}\n")

    result = run_compliance(prompt, compliance_type, subject, severity, model)

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
