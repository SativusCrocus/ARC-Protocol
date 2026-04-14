"""ARC Data Analysis Agent – LangGraph + Ollama

Autonomous data analysis agent that inscribes every analysis report as an
ARC Action record. References Deep Research + Code Generator + DeFi Trader
+ Legal Contracts + Design & Images + Customer Support + Compliance & Audit
records + the original seeded Memory DAG via memrefs so every analysis is
cryptographically anchored to the full certified-agent provenance lattice.

Architecture (LangGraph StateGraph):
    init -> profile -> analyze -> insights -> report -> inscribe -> END

Each node calls Ollama for inference and creates a signed ARC action record.
The final inscription memrefs every live certified-agent record + the
original seeded Memory DAG, so any analysis is cryptographically anchored
across the whole ARC lattice.
"""

from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Analysis Types ───────────────────────────────────────────────────────────


ANALYSIS_TYPES: dict[str, dict] = {
    "trends": {
        "name": "Trends",
        "summary": (
            "Time-series trend analysis: momentum, regime detection, "
            "seasonality, and growth decomposition across the ARC mesh."
        ),
        "methods": [
            "Decompose series into trend + seasonal + residual components",
            "Fit rolling OLS / EWMA with bootstrapped confidence bands",
            "Detect regime switches via CUSUM + Bayesian change-point",
            "Cross-reference with arc-defi-trader signal history",
            "Inscribe trend attestation as an ARC action",
        ],
    },
    "correlations": {
        "name": "Correlations",
        "summary": (
            "Cross-variable dependency mapping: Pearson, Spearman, "
            "Kendall, mutual-information, and lead-lag analysis."
        ),
        "methods": [
            "Compute Pearson + Spearman + Kendall tau matrices",
            "Run Granger causality tests across agent output streams",
            "Estimate mutual information for non-linear coupling",
            "Build a lead-lag heatmap across certified-agent emissions",
            "Publish correlation bundle as a signed ARC action",
        ],
    },
    "anomaly_detection": {
        "name": "Anomaly Detection",
        "summary": (
            "Outlier + novelty scoring: isolation forest, z-score, "
            "one-class SVM, and chain-aware anomaly memref walks."
        ),
        "methods": [
            "Fit isolation forest + LOF on the numeric features",
            "Score one-class SVM with RBF kernel for novelty",
            "Compute robust z-scores (median / MAD) with flags",
            "Walk the ARC DAG for memref anomaly clusters",
            "Emit anomaly attestation with severity-tagged inscriptions",
        ],
    },
    "summary": {
        "name": "Summary",
        "summary": (
            "Executive summary + descriptive statistics: distribution, "
            "missingness, skew, kurtosis, and key ARC cross-agent findings."
        ),
        "methods": [
            "Compute full descriptive stats (moments + quantiles)",
            "Map missingness + cardinality per feature",
            "Surface top correlations + top anomalies in one view",
            "Cite cross-agent memrefs powering each headline number",
            "Inscribe the one-page executive summary as an ARC action",
        ],
    },
}


# ── State Schema ──────────────────────────────────────────────────────────────


class DataState(TypedDict):
    prompt: str
    analysis_type: str
    dataset: str
    rows_hint: int
    model: str
    analysis_name: str
    profile: str
    analysis: str
    insights: str
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
    return f"[simulated] Data analysis response for: {prompt[:120]}"


# ── Cross-Agent DAG Discovery ────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Collect memrefs spanning the full ARC certified-agent DAG + seed.

    Data-analysis reports reference EVERY certified agent — Research,
    Codegen, Trader, Legal, Design, Support, Compliance — plus the infra
    mesh (indexer, oracle, validator). Returns up to 18 record ids covering
    that breadth so every analysis has a deep provenance anchor.
    """
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "arc-analyst",
        "arc-codegen",
        "arc-defi-trader",
        "arc-legal",
        "arc-design",
        "arc-support",
        "arc-compliance",
        "marketplace",
        "arc-validator", "arc-oracle", "arc-indexer",
        "arc-relayer", "arc-watchtower", "arc-bridge",
        "arc-data",
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
        if len(found) >= 18:
            break
    return found[:18]


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
    """Create and store an ARC action record for a data-agent step."""
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


def init_agent(state: DataState) -> dict:
    """Initialize data agent identity + discover cross-agent DAG records."""
    db = arc.get_db()
    alias = "arc-data"

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
            "Data Analysis Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_related_records(db)
    atype_key = (state.get("analysis_type") or "trends").lower()
    atype = ANALYSIS_TYPES.get(atype_key, ANALYSIS_TYPES["trends"])

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "analysis_name": atype["name"],
        "findings": [],
    }


def profile_node(state: DataState) -> dict:
    """Profile the dataset — schema, stats, quality, agent cross-refs."""
    atype_key = (state.get("analysis_type") or "trends").lower()
    atype = ANALYSIS_TYPES.get(atype_key, ANALYSIS_TYPES["trends"])
    prompt_text = state["prompt"]
    dataset = state.get("dataset") or "arc-mesh-telemetry-stream"
    rows_hint = state.get("rows_hint") or 100000
    model = state.get("model", "llama3.2")

    methods = "\n".join(f"  {i+1}. {m}" for i, m in enumerate(atype["methods"]))
    llm_prompt = (
        f"You are the lead data analyst for the ARC Protocol (Bitcoin-native "
        f"Agent Record Convention). Every analysis is signed with BIP-340 "
        f"Schnorr + inscribed as an immutable ARC record.\n\n"
        f"Analysis type: {atype['name']}\n"
        f"Dataset: {dataset}\n"
        f"Row-count hint: {rows_hint}\n\n"
        f"Analysis request:\n{prompt_text}\n\n"
        f"Category summary: {atype['summary']}\n\n"
        f"Planned methods:\n{methods}\n\n"
        f"Produce the dataset-profile memo:\n"
        f"1. Inferred schema (columns, dtypes, likely targets)\n"
        f"2. Per-feature descriptive stats (range, mean, sd, missingness)\n"
        f"3. Data-quality flags + recommended cleanups\n"
        f"4. Which certified agents emit source rows (Research / Codegen / "
        f"Trader / Legal / Design / Support / Compliance)\n"
        f"5. Cross-agent memref map that grounds the analysis"
    )
    profile = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[:3]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Data profile ({atype['name']}): {prompt_text[:80]}",
        prev, llm_prompt, profile,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "profile", "text": profile})

    return {
        "profile": profile,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def analyze_node(state: DataState) -> dict:
    """Execute the analysis — run the method matrix against the DAG."""
    atype_key = (state.get("analysis_type") or "trends").lower()
    atype = ANALYSIS_TYPES.get(atype_key, ANALYSIS_TYPES["trends"])
    profile = state["profile"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the ARC Protocol analysis executor. You have the dataset "
        f"profile below plus the ability to walk the certified-agent DAG.\n\n"
        f"Profile:\n{profile[:3000]}\n\n"
        f"Perform the {atype['name']} analysis:\n"
        f"1. Method-by-method numeric results (tables welcome)\n"
        f"2. Headline findings with effect sizes + p-values / CIs\n"
        f"3. Chart spec: what you'd plot (axes, series, annotations)\n"
        f"4. DAG walks: which memrefs were checked on-chain?\n"
        f"5. Reproduction path — what a validator needs to rerun this"
    )
    analysis = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[3:9]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Data analysis: {atype['name']} — DAG-anchored",
        prev, llm_prompt, analysis,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "analysis", "text": analysis})

    return {
        "analysis": analysis,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def insights_node(state: DataState) -> dict:
    """Distill insights — what matters, why, and for whom."""
    atype_key = (state.get("analysis_type") or "trends").lower()
    atype = ANALYSIS_TYPES.get(atype_key, ANALYSIS_TYPES["trends"])
    analysis = state["analysis"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the ARC Protocol insights distiller. Turn the raw "
        f"analysis into an executive-grade insight bundle.\n\n"
        f"Analysis:\n{analysis[:3000]}\n\n"
        f"Produce the insights bundle:\n"
        f"1. Numbered insights ranked by business impact\n"
        f"2. For each: supporting metric + ARC memref citation\n"
        f"3. Counterfactual: what changes if the insight is wrong\n"
        f"4. Cross-agent corroboration — which certified agent confirms it\n"
        f"5. Open questions: what data/evidence is still missing"
    )
    insights = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[6:13]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Data insights bundle: {atype['name']}",
        prev, llm_prompt, insights,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "insights", "text": insights})

    return {
        "insights": insights,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def report_node(state: DataState) -> dict:
    """Draft the final analysis report — precise, executive-ready."""
    atype_key = (state.get("analysis_type") or "trends").lower()
    atype = ANALYSIS_TYPES.get(atype_key, ANALYSIS_TYPES["trends"])
    profile = state["profile"]
    analysis = state["analysis"]
    insights = state["insights"]
    dataset = state.get("dataset") or "arc-mesh-telemetry-stream"
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are writing the final {atype['name']} analysis report for "
        f"the ARC Protocol. Precise, decision-maker ready, zero fluff.\n\n"
        f"Dataset: {dataset}\n\n"
        f"Profile:\n{profile[:1200]}\n\n"
        f"Analysis:\n{analysis[:1800]}\n\n"
        f"Insights:\n{insights[:1800]}\n\n"
        f"Produce the report:\n"
        f"1. Executive summary (one paragraph)\n"
        f"2. Top 3 findings with numbers + ARC memref citations\n"
        f"3. Recommended actions per certified agent\n"
        f"4. Risk / caveats + confidence level\n"
        f"5. On-chain attestation block (memref citations)\n"
        f"Sign off as 'ARC Data Analysis (arc-data)'."
    )
    report = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[12:18]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Data report draft: {atype['name']}",
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


def inscribe_node(state: DataState) -> dict:
    """Final inscription — bind the full DAG, emit ord command and chain."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    all_refs = state.get("dag_memrefs", [])
    final_refs = all_refs[:14] + all_refs[14:18]
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    atype_key = (state.get("analysis_type") or "trends").lower()
    atype = ANALYSIS_TYPES.get(atype_key, ANALYSIS_TYPES["trends"])

    final_action = (
        f"Data analysis inscribed ({atype['name']}): "
        f"{state['prompt'][:80]}"
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(state["prompt"].encode()),
        ohash=arc.sha256hex(
            (state.get("report", "") + state.get("insights", "")).encode()
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


def build_data_graph():
    """Compile the LangGraph data analysis agent."""
    graph = StateGraph(DataState)

    graph.add_node("init", init_agent)
    graph.add_node("profile", profile_node)
    graph.add_node("analyze", analyze_node)
    graph.add_node("insights", insights_node)
    graph.add_node("report", report_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "profile")
    graph.add_edge("profile", "analyze")
    graph.add_edge("analyze", "insights")
    graph.add_edge("insights", "report")
    graph.add_edge("report", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


data_agent = build_data_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_analysis_types() -> list[dict]:
    """Return the available analysis types (metadata only)."""
    return [
        {
            "key": key,
            "name": atype["name"],
            "summary": atype["summary"],
            "methods": atype["methods"],
        }
        for key, atype in ANALYSIS_TYPES.items()
    ]


def run_data_analysis(
    prompt: str,
    analysis_type: str = "trends",
    dataset: str = "",
    rows_hint: int = 100000,
    model: str = "llama3.2",
) -> dict:
    """Run the full data analysis pipeline. Returns report + ARC chain."""
    result = data_agent.invoke({
        "prompt": prompt,
        "analysis_type": analysis_type,
        "dataset": dataset,
        "rows_hint": rows_hint,
        "model": model,
        "analysis_name": "",
        "profile": "",
        "analysis": "",
        "insights": "",
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
        "analysis_type": analysis_type,
        "analysis_name": result.get("analysis_name", ""),
        "dataset": dataset,
        "rows_hint": rows_hint,
        "profile": result.get("profile", ""),
        "analysis": result.get("analysis", ""),
        "insights": result.get("insights", ""),
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
        "Analyze the ARC Protocol certified-agent mesh telemetry for "
        "momentum trends and anomaly clusters across all agent streams."
    )
    analysis_type = "trends"
    dataset = "arc-mesh-telemetry-stream"
    rows_hint = 100000
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--type" and i + 1 < len(sys.argv):
            analysis_type = sys.argv[i + 1]
        if arg == "--dataset" and i + 1 < len(sys.argv):
            dataset = sys.argv[i + 1]
        if arg == "--rows" and i + 1 < len(sys.argv):
            try:
                rows_hint = int(sys.argv[i + 1])
            except ValueError:
                pass
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GOLD = "\033[38;2;234;179;8m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    INDIGO = "\033[38;2;99;102;241m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Data Analysis Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {GOLD}*{RESET} Type:     {analysis_type}")
    print(f"  {GOLD}*{RESET} Dataset:  {dataset}")
    print(f"  {GOLD}*{RESET} Rows:     {rows_hint}")
    print(f"  {GOLD}*{RESET} Model:    {model}")
    print(f"  {GOLD}*{RESET} Prompt:   {prompt[:80]}\n")

    result = run_data_analysis(prompt, analysis_type, dataset, rows_hint, model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Records created: {len(result['record_ids'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:     {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}*{RESET} Final record:    {result['final_id'][:20]}...")
    print(f"  {INDIGO}*{RESET} Agent pubkey:    {result['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:48]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print(f"\n  {CYAN}Dispute:{RESET} {result['dispute_link']}\n")
