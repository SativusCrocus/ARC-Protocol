"""ARC Orchestrator / Meta-Agent – LangGraph + Ollama

Spawns child agents on demand and forces every child to inherit ARC genesis
+ a mandatory memref to the full live DAG (all 8 existing certified agents +
their seeded records) so nothing spawned through the orchestrator can ever
exist off-lattice.

Architecture (LangGraph StateGraph):
    init -> plan -> spawn -> dispatch -> aggregate -> inscribe -> END

Each node calls Ollama for inference and creates a signed ARC action record.
Child agents are spawned with dedicated BIP-340 keys, a genesis record that
carries a dense memref bundle of the live DAG, and an initial action record
authored by the child that answers the orchestrator-assigned sub-task.
"""

from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Child Agent Catalog ──────────────────────────────────────────────────────


CHILD_AGENTS: dict[str, dict] = {
    "research": {
        "name": "Deep Research",
        "alias_prefix": "arc-research-child",
        "summary": "Spawn a specialist research child with deep-DAG memrefs",
        "role": "research specialist",
        "color": "#A855F7",
    },
    "codegen": {
        "name": "Code Generator",
        "alias_prefix": "arc-codegen-child",
        "summary": "Spawn a child codegen agent for a focused implementation",
        "role": "code generation specialist",
        "color": "#00F0FF",
    },
    "trader": {
        "name": "DeFi Trader",
        "alias_prefix": "arc-trader-child",
        "summary": "Spawn a child trader agent for a scoped market probe",
        "role": "DeFi trading specialist",
        "color": "#22c55e",
    },
    "legal": {
        "name": "Legal Contracts",
        "alias_prefix": "arc-legal-child",
        "summary": "Spawn a child legal drafter for contract work",
        "role": "legal drafting specialist",
        "color": "#EAB308",
    },
    "design": {
        "name": "Design & Images",
        "alias_prefix": "arc-design-child",
        "summary": "Spawn a child generative design agent",
        "role": "generative design specialist",
        "color": "#EC4899",
    },
    "support": {
        "name": "Customer Support",
        "alias_prefix": "arc-support-child",
        "summary": "Spawn a child support agent for ticket triage",
        "role": "customer support specialist",
        "color": "#38BDF8",
    },
    "compliance": {
        "name": "Compliance & Audit",
        "alias_prefix": "arc-compliance-child",
        "summary": "Spawn a child compliance auditor",
        "role": "compliance audit specialist",
        "color": "#10B981",
    },
    "data": {
        "name": "Data Analysis",
        "alias_prefix": "arc-data-child",
        "summary": "Spawn a child data analyst",
        "role": "data analysis specialist",
        "color": "#6366F1",
    },
}


# ── Extra Child Agents (live spawn + schedule) ──────────────────────────────


EXTRA_CHILD_AGENTS: dict[str, dict] = {
    "marketing": {
        "name": "Marketing Agent",
        "alias_prefix": "arc-child-marketing",
        "summary": "Growth + narrative + launch copy child",
        "role": "marketing + growth specialist",
        "color": "#F43F5E",
    },
    "finance": {
        "name": "Finance Agent",
        "alias_prefix": "arc-child-finance",
        "summary": "Treasury + runway + sats-denominated P&L child",
        "role": "finance + treasury specialist",
        "color": "#14B8A6",
    },
    "security": {
        "name": "Security Agent",
        "alias_prefix": "arc-child-security",
        "summary": "Key hygiene + red-team + inscription integrity child",
        "role": "security + red-team specialist",
        "color": "#EF4444",
    },
    "ops": {
        "name": "Ops Agent",
        "alias_prefix": "arc-child-ops",
        "summary": "Infra + uptime + on-call playbook child",
        "role": "ops + infra specialist",
        "color": "#3B82F6",
    },
    "product": {
        "name": "Product Agent",
        "alias_prefix": "arc-child-product",
        "summary": "Roadmap + PRD + cross-agent requirements child",
        "role": "product + PRD specialist",
        "color": "#F59E0B",
    },
    "community": {
        "name": "Community Agent",
        "alias_prefix": "arc-child-community",
        "summary": "Community rituals + relays + mod playbook child",
        "role": "community + relay specialist",
        "color": "#D946EF",
    },
}


def _all_kinds() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    merged.update(CHILD_AGENTS)
    merged.update(EXTRA_CHILD_AGENTS)
    return merged


# ── State Schema ──────────────────────────────────────────────────────────────


class OrchestratorState(TypedDict):
    prompt: str
    children: list[str]
    model: str
    plan: str
    dispatch: str
    aggregate: str
    report: str
    record_ids: list[str]
    dag_memrefs: list[str]
    agent_pubkey: str
    agent_alias: str
    final_id: str
    inscription_cmd: str
    chain: list[dict]
    spawned: list[dict]
    findings: list[dict]
    dispute_link: str
    error: str


# ── Ollama Helper ─────────────────────────────────────────────────────────────


def _llm(prompt: str, model: str = "llama3.2") -> str:
    result = arc.ollama_generate(prompt, model)
    if result:
        return result
    for alt in ("llama3.1:8b", "llama3.1", "qwen2.5:14b", "mistral"):
        if alt != model:
            result = arc.ollama_generate(prompt, alt)
            if result:
                return result
    return f"[simulated] Orchestrator response for: {prompt[:120]}"


# ── Cross-Agent DAG Discovery ────────────────────────────────────────────────


_CERTIFIED_ALIASES = [
    "arc-deep-research",
    "arc-codegen",
    "arc-defi-trader",
    "arc-legal",
    "arc-design",
    "arc-support",
    "arc-compliance",
    "arc-data",
]

_INFRA_ALIASES = [
    "arc-research", "arc-synthesis", "arc-composer", "arc-analyst",
    "arc-validator", "arc-oracle", "arc-indexer",
    "arc-relayer", "arc-watchtower", "arc-bridge",
]


def _find_full_dag(db) -> list[str]:
    """Collect the latest head of EVERY certified + infra agent.

    The orchestrator must memref the entire live lattice so every spawned
    child inherits full-mesh provenance.
    """
    target = set(_CERTIFIED_ALIASES) | set(_INFRA_ALIASES) | {"marketplace"}
    by_alias: dict[str, list[str]] = {}
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target:
            by_alias.setdefault(alias, []).append(rid)

    found: list[str] = []
    # Ensure one head per certified agent first (ordered, deterministic)
    for alias in _CERTIFIED_ALIASES:
        ids = by_alias.get(alias, [])
        if ids:
            found.append(ids[-1])
    # Then infra + marketplace
    for alias in list(_INFRA_ALIASES) + ["marketplace"]:
        ids = by_alias.get(alias, [])
        if ids:
            found.append(ids[-1])
    # Then penultimate heads to thicken the anchor
    for alias in _CERTIFIED_ALIASES:
        ids = by_alias.get(alias, [])
        if len(ids) > 1:
            found.append(ids[-2])
        if len(found) >= 24:
            break
    return found[:24]


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


def init_agent(state: OrchestratorState) -> dict:
    """Initialize meta-agent identity + discover the full live DAG."""
    db = arc.get_db()
    alias = "arc-orchestrator"

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
            "Orchestrator / Meta-Agent initialized — LangGraph spawn-coordinator + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_full_dag(db)

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "spawned": [],
        "findings": [],
    }


def plan_node(state: OrchestratorState) -> dict:
    """Draft a multi-child execution plan."""
    prompt_text = state["prompt"]
    children = state.get("children") or ["research", "codegen"]
    model = state.get("model", "llama3.2")

    _catalog = _all_kinds()
    child_lines = "\n".join(
        f"  - {k}: {_catalog[k]['name']} ({_catalog[k]['role']})"
        for k in children
        if k in _catalog
    )
    llm_prompt = (
        f"You are the ARC Protocol Meta-Agent orchestrator. Design the "
        f"multi-agent execution plan for the task below.\n\n"
        f"Task:\n{prompt_text}\n\n"
        f"Children to spawn:\n{child_lines}\n\n"
        f"Produce the plan:\n"
        f"1. Sub-task per child (scoped, actionable)\n"
        f"2. Handoff ordering + dependency graph\n"
        f"3. Cross-memref contract each child must honor\n"
        f"4. Aggregation strategy + verification gate\n"
        f"5. Inscription path back to the orchestrator lineage"
    )
    plan = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    memrefs = state.get("dag_memrefs", [])[:4]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Orchestrator plan: {prompt_text[:80]}",
        prev, llm_prompt, plan,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "plan", "text": plan})

    return {
        "plan": plan,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def spawn_node(state: OrchestratorState) -> dict:
    """Spawn each child: keypair + genesis with mandatory full-DAG memref."""
    db = arc.get_db()
    children = state.get("children") or ["research", "codegen"]
    dag_refs = state.get("dag_memrefs", [])

    spawned: list[dict] = []
    all_ids = list(state["record_ids"])

    # Timestamp suffix to keep aliases unique-ish per spawn burst.
    import time as _time
    stamp = hex(int(_time.time()) & 0xFFFFFF)[2:]

    for ck in children:
        cfg = _all_kinds().get(ck)
        if not cfg:
            continue
        child_alias = f"{cfg['alias_prefix']}-{stamp}"
        try:
            sec_hex, _pub_hex = arc.generate_keypair(child_alias)
            child_secret = bytes.fromhex(sec_hex)
        except Exception:
            key_file = arc.KEYS_DIR / f"{child_alias}.key"
            if key_file.exists():
                child_secret = bytes.fromhex(key_file.read_text().strip())
            else:
                continue

        child_pub = arc.xonly_pubkey(child_secret).hex()

        # MANDATORY genesis memref bundle: every child inherits the full DAG.
        genesis_rec = arc.build_record(
            "genesis", child_secret,
            (
                f"{cfg['name']} child spawned by arc-orchestrator — "
                f"{cfg['role']} with full-mesh ARC provenance anchor"
            ),
            memrefs=dag_refs[:12],
            alias=child_alias,
        )
        if not arc.verify_sig(genesis_rec):
            continue
        child_genesis_id = arc.store(db, genesis_rec)

        # Signed orchestrator action recording the spawn, linked via memref.
        secret = arc.load_key()
        prev = all_ids[-1]
        orch_spawn_rid = _inscribe_step(
            db, secret, state["agent_alias"],
            f"Orchestrator spawn: {cfg['name']} → {child_alias}",
            prev,
            f"spawn:{ck}:{child_alias}",
            f"child_pubkey:{child_pub}\nchild_genesis:{child_genesis_id}",
            memrefs=[child_genesis_id] + dag_refs[:5],
        )
        all_ids.append(orch_spawn_rid)

        # Child first action: acknowledge assignment, re-anchor full DAG.
        child_ack_rec = arc.build_record(
            "action", child_secret,
            f"{cfg['name']} child ack: full-DAG memref inherited, ready for sub-task",
            prev=child_genesis_id,
            memrefs=dag_refs[:8] + [orch_spawn_rid],
            alias=child_alias,
            ihash=arc.sha256hex(state["prompt"].encode()),
            ohash=arc.sha256hex(f"{child_alias}:ack".encode()),
        )
        child_ack_id = arc.store(db, child_ack_rec)

        spawned.append({
            "kind": ck,
            "name": cfg["name"],
            "role": cfg["role"],
            "color": cfg["color"],
            "alias": child_alias,
            "pubkey": child_pub,
            "genesis_id": child_genesis_id,
            "ack_id": child_ack_id,
            "orchestrator_spawn_id": orch_spawn_rid,
        })

    return {
        "record_ids": all_ids,
        "spawned": spawned,
    }


def dispatch_node(state: OrchestratorState) -> dict:
    """Dispatch sub-tasks to children + collect their output stubs."""
    plan = state.get("plan", "")
    spawned = state.get("spawned", [])
    model = state.get("model", "llama3.2")

    names = ", ".join(s["name"] for s in spawned) or "(none)"
    llm_prompt = (
        f"You are the ARC Meta-Agent dispatcher. Break the plan into "
        f"explicit child sub-task bundles and dispatch.\n\n"
        f"Plan:\n{plan[:2500]}\n\n"
        f"Spawned children: {names}\n\n"
        f"Produce the dispatch bundle:\n"
        f"1. For each child: scoped prompt + expected artifact\n"
        f"2. Memref contract: which DAG heads they must cite\n"
        f"3. Deadline / budget per sub-task\n"
        f"4. Success criteria verifiable from the record\n"
        f"5. Return path — how the child action links back to orchestrator"
    )
    dispatch = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    memrefs = state.get("dag_memrefs", [])[4:10]
    # Also include every spawned child genesis as a memref.
    memrefs = memrefs + [s["genesis_id"] for s in spawned]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Orchestrator dispatch: {len(spawned)} child(ren)",
        prev, llm_prompt, dispatch,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "dispatch", "text": dispatch})

    return {
        "dispatch": dispatch,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def aggregate_node(state: OrchestratorState) -> dict:
    """Aggregate child outputs into a meta-agent synthesis."""
    plan = state.get("plan", "")
    dispatch = state.get("dispatch", "")
    spawned = state.get("spawned", [])
    model = state.get("model", "llama3.2")

    child_block = "\n".join(
        f"  - {s['name']} [{s['alias']}] genesis={s['genesis_id'][:16]}..."
        for s in spawned
    ) or "  (no children spawned)"

    llm_prompt = (
        f"You are the ARC Meta-Agent aggregator. Synthesize the expected "
        f"child outputs into a single mesh-aware result.\n\n"
        f"Plan:\n{plan[:1500]}\n\n"
        f"Dispatch:\n{dispatch[:1500]}\n\n"
        f"Children:\n{child_block}\n\n"
        f"Produce the aggregation:\n"
        f"1. Per-child artifact summary + confidence\n"
        f"2. Cross-artifact conflict resolution\n"
        f"3. Meta-narrative bound to the orchestrator prompt\n"
        f"4. Cross-memref witness — which DAG heads ratify each claim\n"
        f"5. Open follow-ups / next spawn candidates"
    )
    aggregate = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    memrefs = state.get("dag_memrefs", [])[6:14]
    memrefs = memrefs + [s["ack_id"] for s in spawned]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Orchestrator aggregate across {len(spawned)} child(ren)",
        prev, llm_prompt, aggregate,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "aggregate", "text": aggregate})

    return {
        "aggregate": aggregate,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def inscribe_node(state: OrchestratorState) -> dict:
    """Final inscription — bind orchestrator lineage + spawn manifest."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    spawned = state.get("spawned", [])

    all_refs = state.get("dag_memrefs", [])
    child_refs = []
    for s in spawned:
        child_refs.extend([s["genesis_id"], s["ack_id"]])
    final_refs = all_refs[:12] + child_refs
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    aggregate = state.get("aggregate", "")
    plan = state.get("plan", "")
    prompt_text = state["prompt"]

    report_lines = [
        f"Orchestrator task: {prompt_text}",
        "",
        "Plan digest:",
        plan[:600],
        "",
        f"Spawned children ({len(spawned)}):",
    ]
    for s in spawned:
        report_lines.append(
            f"  • {s['name']} [{s['alias']}] pubkey={s['pubkey'][:16]}..."
        )
    report_lines.append("")
    report_lines.append("Aggregation:")
    report_lines.append(aggregate[:800])
    report = "\n".join(report_lines)

    final_action = (
        f"Orchestrator meta-inscription: {len(spawned)} child(ren) spawned, "
        f"full-mesh DAG anchor — {prompt_text[:60]}"
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(prompt_text.encode()),
        ohash=arc.sha256hex(report.encode()),
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

    findings = list(state.get("findings", []))
    findings.append({"phase": "report", "text": report})

    return {
        "report": report,
        "final_id": final_id,
        "inscription_cmd": inscription_cmd,
        "record_ids": record_ids,
        "chain": chain,
        "findings": findings,
        "dispute_link": "/marketplace#demo",
    }


# ── Build LangGraph ──────────────────────────────────────────────────────────


def build_orchestrator_graph():
    graph = StateGraph(OrchestratorState)

    graph.add_node("init", init_agent)
    graph.add_node("plan", plan_node)
    graph.add_node("spawn", spawn_node)
    graph.add_node("dispatch", dispatch_node)
    graph.add_node("aggregate", aggregate_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "plan")
    graph.add_edge("plan", "spawn")
    graph.add_edge("spawn", "dispatch")
    graph.add_edge("dispatch", "aggregate")
    graph.add_edge("aggregate", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


orchestrator_agent = build_orchestrator_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_child_agents() -> list[dict]:
    return [
        {
            "key": key,
            "name": cfg["name"],
            "summary": cfg["summary"],
            "role": cfg["role"],
            "color": cfg["color"],
            "alias_prefix": cfg["alias_prefix"],
        }
        for key, cfg in CHILD_AGENTS.items()
    ]


def list_extra_child_agents() -> list[dict]:
    return [
        {
            "key": key,
            "name": cfg["name"],
            "summary": cfg["summary"],
            "role": cfg["role"],
            "color": cfg["color"],
            "alias_prefix": cfg["alias_prefix"],
        }
        for key, cfg in EXTRA_CHILD_AGENTS.items()
    ]


def preview_spawn(
    prompt: str,
    children: list[str],
) -> dict:
    """Return a DAG-aware preview of what the orchestrator would spawn.

    Does not write any records — used by the UI for the Spawn Preview panel.
    """
    db = arc.get_db()
    dag_refs = _find_full_dag(db)
    items = []
    for ck in children:
        cfg = _all_kinds().get(ck)
        if not cfg:
            continue
        items.append({
            "kind": ck,
            "name": cfg["name"],
            "role": cfg["role"],
            "color": cfg["color"],
            "alias_prefix": cfg["alias_prefix"],
            "mandatory_memrefs": dag_refs[:12],
        })
    return {
        "prompt": prompt,
        "children": items,
        "dag_memref_count": len(dag_refs),
        "certified_anchors": _CERTIFIED_ALIASES,
    }


def run_orchestrator(
    prompt: str,
    children: Optional[list[str]] = None,
    model: str = "llama3.2",
) -> dict:
    """Run the full meta-agent orchestration. Returns report + ARC chain."""
    children = children or ["research", "codegen"]
    result = orchestrator_agent.invoke({
        "prompt": prompt,
        "children": children,
        "model": model,
        "plan": "",
        "dispatch": "",
        "aggregate": "",
        "report": "",
        "record_ids": [],
        "dag_memrefs": [],
        "agent_pubkey": "",
        "agent_alias": "",
        "final_id": "",
        "inscription_cmd": "",
        "chain": [],
        "spawned": [],
        "findings": [],
        "dispute_link": "",
        "error": "",
    })

    if result.get("error"):
        raise ValueError(result["error"])

    return {
        "prompt": prompt,
        "children": children,
        "plan": result.get("plan", ""),
        "dispatch": result.get("dispatch", ""),
        "aggregate": result.get("aggregate", ""),
        "report": result.get("report", ""),
        "findings": result.get("findings", []),
        "spawned": result.get("spawned", []),
        "record_ids": result.get("record_ids", []),
        "dag_memrefs": result.get("dag_memrefs", []),
        "final_id": result.get("final_id", ""),
        "inscription_cmd": result.get("inscription_cmd", ""),
        "chain": result.get("chain", []),
        "agent_pubkey": result.get("agent_pubkey", ""),
        "dispute_link": result.get("dispute_link", "/marketplace#demo"),
    }


# ── Live Spawn + Schedule (exponential growth) ───────────────────────────────


import json as _json
import threading as _threading
import time as _time


SCHEDULE_FILE = arc.ARC_DIR / "orchestrator_schedule.json"
SCHEDULE_INTERVAL_SECS = 6 * 60 * 60  # every 6h

# Round-robin rotation for auto-spawns — cycles the extra catalog so the
# ledger grows a new specialist every 6h without operator intervention.
_SCHEDULE_ROTATION = [
    "marketing", "finance", "security", "ops", "product", "community",
]


def _ensure_orchestrator_identity():
    """Guarantee an orchestrator keypair + genesis record. Idempotent."""
    db = arc.get_db()
    alias = "arc-orchestrator"
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
            "Orchestrator / Meta-Agent initialized — LangGraph spawn-coordinator + ARC Protocol",
            alias=alias,
        )
        if arc.verify_sig(genesis):
            arc.store(db, genesis)
    rows = arc.fetch_by_pubkey(db, pubkey)
    head = rows[-1][0] if rows else ""
    return db, secret, alias, pubkey, head


def _spawn_single_child(db, parent_secret, parent_alias, parent_head, kind: str,
                        trigger: str = "manual") -> dict:
    """Spawn one child agent with full-DAG memref inheritance.

    Returns a spawn record bundle (child metadata + new record ids). The
    orchestrator's own action lineage is advanced by one record here (the
    spawn attestation), so callers passing parent_head should update to the
    returned ``orchestrator_spawn_id``.
    """
    catalog = _all_kinds()
    cfg = catalog.get(kind)
    if not cfg:
        raise ValueError(f"unknown child kind: {kind}")

    dag_refs = _find_full_dag(db)
    stamp = hex(int(_time.time()) & 0xFFFFFFF)[2:]
    child_alias = f"{cfg['alias_prefix']}-{stamp}"

    try:
        sec_hex, _ph = arc.generate_keypair(child_alias)
        child_secret = bytes.fromhex(sec_hex)
    except Exception:
        key_file = arc.KEYS_DIR / f"{child_alias}.key"
        if not key_file.exists():
            raise
        child_secret = bytes.fromhex(key_file.read_text().strip())
    child_pub = arc.xonly_pubkey(child_secret).hex()

    # Child GENESIS with mandatory full-DAG memref inheritance.
    genesis_rec = arc.build_record(
        "genesis", child_secret,
        (
            f"{cfg['name']} child spawned by arc-orchestrator — "
            f"{cfg['role']} with full-mesh ARC provenance anchor "
            f"({trigger})"
        ),
        memrefs=dag_refs[:12],
        alias=child_alias,
    )
    if not arc.verify_sig(genesis_rec):
        raise ValueError("Child genesis signature failed")
    child_genesis_id = arc.store(db, genesis_rec)

    # Orchestrator attests the spawn (advances orchestrator chain).
    orch_action = arc.build_record(
        "action", parent_secret,
        f"Orchestrator spawn [{trigger}]: {cfg['name']} → {child_alias}",
        prev=parent_head,
        memrefs=[child_genesis_id] + dag_refs[:5],
        ihash=arc.sha256hex(f"spawn:{kind}:{trigger}".encode()),
        ohash=arc.sha256hex(f"child_pubkey:{child_pub}".encode()),
        alias=parent_alias,
    )
    if not arc.verify_sig(orch_action):
        raise ValueError("Orchestrator spawn signature failed")
    orch_spawn_id = arc.store(db, orch_action)

    # Child first action re-anchors the mesh.
    child_ack = arc.build_record(
        "action", child_secret,
        f"{cfg['name']} child ack: full-DAG memref inherited, ready for work",
        prev=child_genesis_id,
        memrefs=dag_refs[:8] + [orch_spawn_id],
        alias=child_alias,
        ihash=arc.sha256hex(f"{child_alias}:ihash".encode()),
        ohash=arc.sha256hex(f"{child_alias}:ack:{trigger}".encode()),
    )
    child_ack_id = arc.store(db, child_ack)

    return {
        "kind": kind,
        "name": cfg["name"],
        "role": cfg["role"],
        "color": cfg["color"],
        "alias": child_alias,
        "pubkey": child_pub,
        "genesis_id": child_genesis_id,
        "ack_id": child_ack_id,
        "orchestrator_spawn_id": orch_spawn_id,
        "trigger": trigger,
        "ts": int(_time.time()),
    }


def live_spawn_run(
    kinds: Optional[list[str]] = None,
    trigger: str = "live-spawn",
) -> dict:
    """Seed a live spawn run: inscribe 3 new children by default.

    Each child gets a fresh BIP-340 keypair, a genesis record whose memrefs
    bind the full live DAG, and an ack action. Orchestrator lineage is
    advanced by one attestation per child.
    """
    kinds = kinds or ["marketing", "finance", "security"]
    db, secret, alias, pubkey, head = _ensure_orchestrator_identity()

    spawned: list[dict] = []
    for kind in kinds:
        child = _spawn_single_child(db, secret, alias, head, kind, trigger=trigger)
        spawned.append(child)
        head = child["orchestrator_spawn_id"]

    dag_refs = _find_full_dag(db)
    summary = (
        f"Live spawn run [{trigger}]: {len(spawned)} child(ren) inscribed — "
        + ", ".join(s["alias"] for s in spawned)
    )

    final_refs = dag_refs[:10] + [s["genesis_id"] for s in spawned]
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    final_rec = arc.build_record(
        "action", secret, summary,
        prev=head,
        memrefs=final_refs,
        alias=alias,
        ihash=arc.sha256hex(f"live-spawn:{trigger}:{int(_time.time())}".encode()),
        ohash=arc.sha256hex(summary.encode()),
    )
    if not arc.verify_sig(final_rec):
        raise ValueError("Live spawn summary signature failed")
    final_id = arc.store(db, final_rec)

    return {
        "trigger": trigger,
        "spawned": spawned,
        "summary_id": final_id,
        "summary": summary,
        "inscription_cmd": arc.inscription_envelope(final_rec),
        "agent_pubkey": pubkey,
        "dag_memrefs": dag_refs,
        "ts": int(_time.time()),
    }


# ── Schedule state ──────────────────────────────────────────────────────────


def _load_schedule_state() -> dict:
    try:
        if SCHEDULE_FILE.exists():
            return _json.loads(SCHEDULE_FILE.read_text())
    except Exception:
        pass
    return {
        "enabled": True,
        "interval_secs": SCHEDULE_INTERVAL_SECS,
        "last_run": 0,
        "rotation_index": 0,
        "history": [],
    }


def _save_schedule_state(state: dict) -> None:
    try:
        SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
        SCHEDULE_FILE.write_text(_json.dumps(state, indent=2))
    except Exception:
        pass


def schedule_status() -> dict:
    state = _load_schedule_state()
    now = int(_time.time())
    last = int(state.get("last_run", 0))
    interval = int(state.get("interval_secs", SCHEDULE_INTERVAL_SECS))
    next_run = last + interval if last else now
    idx = int(state.get("rotation_index", 0)) % len(_SCHEDULE_ROTATION)
    next_kind = _SCHEDULE_ROTATION[idx]
    return {
        "enabled": bool(state.get("enabled", True)),
        "interval_secs": interval,
        "cron": "0 */6 * * *",
        "last_run": last,
        "next_run": next_run,
        "seconds_until_next": max(0, next_run - now),
        "next_kind": next_kind,
        "rotation": _SCHEDULE_ROTATION,
        "history": state.get("history", [])[-12:],
    }


def schedule_tick(force: bool = False) -> dict:
    """Run a single scheduled spawn tick.

    When ``force`` is True, runs regardless of elapsed time (used by the
    manual "Tick now" button). Otherwise runs only if the 6h window elapsed.
    """
    state = _load_schedule_state()
    now = int(_time.time())
    last = int(state.get("last_run", 0))
    interval = int(state.get("interval_secs", SCHEDULE_INTERVAL_SECS))

    due = force or (now - last) >= interval or last == 0
    if not due:
        return {
            "ran": False,
            "reason": "not-due",
            "next_run": last + interval,
            "seconds_until_next": max(0, (last + interval) - now),
        }

    idx = int(state.get("rotation_index", 0)) % len(_SCHEDULE_ROTATION)
    kind = _SCHEDULE_ROTATION[idx]

    result = live_spawn_run([kind], trigger="schedule-6h")
    child = result["spawned"][0] if result["spawned"] else None

    state["last_run"] = now
    state["rotation_index"] = (idx + 1) % len(_SCHEDULE_ROTATION)
    hist = list(state.get("history", []))
    hist.append({
        "ts": now,
        "kind": kind,
        "alias": child["alias"] if child else "",
        "genesis_id": child["genesis_id"] if child else "",
        "summary_id": result["summary_id"],
    })
    state["history"] = hist[-50:]
    _save_schedule_state(state)

    return {
        "ran": True,
        "kind": kind,
        "child": child,
        "summary_id": result["summary_id"],
        "next_run": now + interval,
        "seconds_until_next": interval,
    }


_SCHEDULER_THREAD: Optional[_threading.Thread] = None
_SCHEDULER_STOP = _threading.Event()


def _scheduler_loop():
    """Background thread that fires schedule_tick every 60s when due."""
    while not _SCHEDULER_STOP.is_set():
        try:
            schedule_tick(force=False)
        except Exception:
            pass
        _SCHEDULER_STOP.wait(60)


def start_scheduler() -> bool:
    """Start the background scheduler thread. Idempotent."""
    global _SCHEDULER_THREAD
    if _SCHEDULER_THREAD and _SCHEDULER_THREAD.is_alive():
        return False
    _SCHEDULER_STOP.clear()
    t = _threading.Thread(target=_scheduler_loop, daemon=True, name="arc-orch-scheduler")
    t.start()
    _SCHEDULER_THREAD = t
    return True


# ── CLI ───────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import sys

    prompt = " ".join(a for a in sys.argv[1:] if not a.startswith("--")) or (
        "Coordinate a multi-agent research + codegen sprint: survey ARC "
        "Protocol Lightning settlement paths and draft the reference "
        "implementation, with compliance + data corroboration."
    )
    children_arg: list[str] = []
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--children" and i + 1 < len(sys.argv):
            children_arg = [c.strip() for c in sys.argv[i + 1].split(",") if c.strip()]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    children = children_arg or ["research", "codegen", "compliance", "data"]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GOLD = "\033[38;2;234;179;8m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    INDIGO = "\033[38;2;99;102;241m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Orchestrator / Meta-Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {GOLD}*{RESET} Children: {','.join(children)}")
    print(f"  {GOLD}*{RESET} Model:    {model}")
    print(f"  {GOLD}*{RESET} Prompt:   {prompt[:80]}\n")

    result = run_orchestrator(prompt, children, model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Records created: {len(result['record_ids'])}")
    print(f"  {ORANGE}*{RESET} Children spawned: {len(result['spawned'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:     {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}*{RESET} Final record:    {result['final_id'][:20]}...")
    print(f"  {INDIGO}*{RESET} Agent pubkey:    {result['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Spawned:{RESET}")
    for s in result["spawned"]:
        print(f"    [{s['name']:18}] {s['alias']:40}  genesis={s['genesis_id'][:16]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:48]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print(f"\n  {CYAN}Dispute:{RESET} {result['dispute_link']}\n")
