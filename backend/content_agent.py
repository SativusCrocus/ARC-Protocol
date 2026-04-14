"""ARC Content Creator Agent – LangGraph + Ollama

Autonomous long-form content agent. Every generated article, Twitter thread,
video script, or newsletter is inscribed as an ARC Action record that memrefs
every live certified agent (Deep Research, Code Generator, DeFi Trader,
Legal Contracts, Design & Images, Customer Support, Compliance & Audit,
Data Analysis, Orchestrator) plus the seeded Memory DAG, so every piece of
content is cryptographically anchored to the full ARC provenance lattice.

Architecture (LangGraph StateGraph):
    init -> research -> draft -> refine -> polish -> inscribe -> END
"""

from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Content Formats ──────────────────────────────────────────────────────────


CONTENT_FORMATS: dict[str, dict] = {
    "article": {
        "name": "Article",
        "summary": (
            "Long-form article (1,200-2,000 words) with thesis, sections, "
            "citations, and inline ARC memref anchors."
        ),
        "structure": [
            "Hook + thesis paragraph (120 words)",
            "3-5 body sections with H2/H3 headings",
            "Quoted ARC memref citations + agent attestation",
            "Counter-argument + steelman rebuttal",
            "Conclusion + call-to-inscribe footer",
        ],
    },
    "twitter_thread": {
        "name": "Twitter Thread",
        "summary": (
            "High-signal 12-tweet thread with hook, payoff, and an inline "
            "ARC attestation tweet linking every certified agent."
        ),
        "structure": [
            "Tweet 1: hook + stakes (under 260 chars)",
            "Tweets 2-9: one insight per tweet, numbered",
            "Tweet 10: ARC memref citation tweet",
            "Tweet 11: counter-intuitive twist",
            "Tweet 12: CTA + inscription command",
        ],
    },
    "video_script": {
        "name": "Video Script",
        "summary": (
            "Camera-ready 3-5 minute video script with cold-open, beats, "
            "B-roll cues, and ARC-anchored narration blocks."
        ),
        "structure": [
            "COLD OPEN: 8-second pattern interrupt",
            "SETUP: thesis + stakes + promise",
            "BEATS: 4 escalating scenes with B-roll cues",
            "PROOF: on-chain ARC memref walk + attestation overlay",
            "CTA: subscribe + inscribe + settle via Lightning",
        ],
    },
    "newsletter": {
        "name": "Newsletter",
        "summary": (
            "Weekly-style newsletter issue: executive summary, 3 deep-dive "
            "sections, cross-agent ledger, and a Lightning-settlable CTA."
        ),
        "structure": [
            "Subject line + preview text",
            "Executive summary (3 bullets, numbers bolded)",
            "Section 1: Deep Research + Data Analysis roll-up",
            "Section 2: Trader + Codegen + Design product cut",
            "Section 3: Legal + Compliance + Support governance ledger",
            "Footer: inscription command + settle-on-Lightning CTA",
        ],
    },
}


# ── State Schema ──────────────────────────────────────────────────────────────


class ContentState(TypedDict):
    prompt: str
    content_format: str
    format_name: str
    audience: str
    price_sats: int
    model: str
    research: str
    draft: str
    refined: str
    polished: str
    findings: list[dict]
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
    result = arc.ollama_generate(prompt, model)
    if result:
        return result
    for alt in ("llama3.1:8b", "llama3.1", "qwen2.5:14b", "mistral"):
        if alt != model:
            result = arc.ollama_generate(prompt, alt)
            if result:
                return result
    return f"[simulated] Content Creator response for: {prompt[:120]}"


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
    "arc-orchestrator",
]

_INFRA_ALIASES = [
    "arc-research", "arc-synthesis", "arc-composer", "arc-analyst",
    "arc-validator", "arc-oracle", "arc-indexer",
    "arc-relayer", "arc-watchtower", "arc-bridge",
    "marketplace",
]


def _find_full_dag(db) -> list[str]:
    """Collect latest heads of every certified + infra agent for full-mesh anchor."""
    target = set(_CERTIFIED_ALIASES) | set(_INFRA_ALIASES) | {"arc-content"}
    by_alias: dict[str, list[str]] = {}
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target:
            by_alias.setdefault(alias, []).append(rid)

    found: list[str] = []
    for alias in _CERTIFIED_ALIASES:
        ids = by_alias.get(alias, [])
        if ids:
            found.append(ids[-1])
    for alias in _INFRA_ALIASES:
        ids = by_alias.get(alias, [])
        if ids:
            found.append(ids[-1])
    for alias in _CERTIFIED_ALIASES:
        ids = by_alias.get(alias, [])
        if len(ids) > 1:
            found.append(ids[-2])
        if len(found) >= 22:
            break
    # de-dup preserving order
    seen: set[str] = set()
    out: list[str] = []
    for rid in found:
        if rid not in seen:
            seen.add(rid)
            out.append(rid)
    return out[:22]


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


def init_agent(state: ContentState) -> dict:
    """Bootstrap content agent identity + discover full DAG anchor."""
    db = arc.get_db()
    alias = "arc-content"

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
            "Content Creator Agent initialized — LangGraph + Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_full_dag(db)
    fmt_key = (state.get("content_format") or "article").lower()
    fmt = CONTENT_FORMATS.get(fmt_key, CONTENT_FORMATS["article"])

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "format_name": fmt["name"],
        "findings": [],
    }


def research_node(state: ContentState) -> dict:
    """Research the topic by walking the certified-agent DAG."""
    fmt_key = (state.get("content_format") or "article").lower()
    fmt = CONTENT_FORMATS.get(fmt_key, CONTENT_FORMATS["article"])
    prompt_text = state["prompt"]
    audience = state.get("audience") or "crypto-native founders + AI builders"
    model = state.get("model", "llama3.2")

    structure = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(fmt["structure"]))
    llm_prompt = (
        f"You are the lead research editor for the ARC Protocol (Bitcoin-native "
        f"Agent Record Convention). Every piece you ship is signed with "
        f"BIP-340 Schnorr + inscribed as an ARC record with mandatory memrefs "
        f"to every live certified agent.\n\n"
        f"Target format: {fmt['name']}\n"
        f"Summary: {fmt['summary']}\n"
        f"Structure:\n{structure}\n\n"
        f"Audience: {audience}\n"
        f"Content brief:\n{prompt_text}\n\n"
        f"Produce the research memo:\n"
        f"1. Headline claim (one sentence)\n"
        f"2. 5 supporting facts w/ source-of-truth agent (Research / Data / "
        f"Trader / Legal / Design / Support / Compliance / Codegen / "
        f"Orchestrator)\n"
        f"3. 3 counter-arguments + the strongest rebuttal each\n"
        f"4. 3 quotable lines (under 140 chars) that could power a tweet\n"
        f"5. Cross-agent memref walk — which certified-agent records must "
        f"ground this piece"
    )
    research = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[:4]
    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Content research ({fmt['name']}): {prompt_text[:80]}",
        prev, llm_prompt, research,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "research", "text": research})

    return {
        "research": research,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def draft_node(state: ContentState) -> dict:
    """Draft the full piece in the requested format."""
    fmt_key = (state.get("content_format") or "article").lower()
    fmt = CONTENT_FORMATS.get(fmt_key, CONTENT_FORMATS["article"])
    research = state["research"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are writing the first full draft of a {fmt['name']} for the "
        f"ARC Protocol. Follow the structure precisely.\n\n"
        f"Research memo:\n{research[:3200]}\n\n"
        f"Structure to hit:\n"
        + "\n".join(f"  - {s}" for s in fmt["structure"])
        + "\n\nRequirements:\n"
        f"1. Every claim that can be checked must cite an ARC memref (write "
        f"'(arc-memref: <agent>)' inline).\n"
        f"2. Use punchy sentences. Zero filler. No 'In today's fast-paced "
        f"world'.\n"
        f"3. Land at least one genuinely surprising angle.\n"
        f"4. Close with a one-line attestation: 'Inscribed via arc-content; "
        f"settle on Lightning via ARC Marketplace.'\n"
        f"Write the full {fmt['name']} now."
    )
    draft = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[3:9]
    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Content draft ({fmt['name']}): first pass",
        prev, llm_prompt, draft,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "draft", "text": draft})

    return {
        "draft": draft,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def refine_node(state: ContentState) -> dict:
    """Refine — tighten, cut, verify memref citations."""
    fmt_key = (state.get("content_format") or "article").lower()
    fmt = CONTENT_FORMATS.get(fmt_key, CONTENT_FORMATS["article"])
    draft = state["draft"]
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"You are the ruthless editor. Here is the first draft of a "
        f"{fmt['name']}. Refine it.\n\n"
        f"Draft:\n{draft[:3600]}\n\n"
        f"Refinement pass:\n"
        f"1. Cut every sentence that does not move the argument.\n"
        f"2. Replace weak verbs. Kill adverbs unless they add information.\n"
        f"3. Verify every '(arc-memref: <agent>)' points at a plausible "
        f"certified agent. Add missing citations.\n"
        f"4. Escalate the hook: the first 40 words must earn the reader's "
        f"time.\n"
        f"5. Keep the structure intact. Keep the attestation footer.\n"
        f"Output the fully refined piece."
    )
    refined = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[6:14]
    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Content refine ({fmt['name']}): editorial pass",
        prev, llm_prompt, refined,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "refine", "text": refined})

    return {
        "refined": refined,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def polish_node(state: ContentState) -> dict:
    """Polish — headline, hook, CTA, Lightning settlement footer."""
    fmt_key = (state.get("content_format") or "article").lower()
    fmt = CONTENT_FORMATS.get(fmt_key, CONTENT_FORMATS["article"])
    refined = state["refined"]
    price_sats = state.get("price_sats") or 9500
    model = state.get("model", "llama3.2")

    llm_prompt = (
        f"Final polish pass on this {fmt['name']}. Ship-grade.\n\n"
        f"Refined piece:\n{refined[:4000]}\n\n"
        f"Polish pass:\n"
        f"1. Write the final headline / subject / tweet-1 (whichever applies).\n"
        f"2. Rewrite the first two sentences until they are physically "
        f"unputdownable.\n"
        f"3. Add a one-line Lightning settlement CTA: 'Settle on Lightning "
        f"via ARC Marketplace: {price_sats} sats.'\n"
        f"4. Append the attestation block:\n"
        f"   --- Inscribed via arc-content ---\n"
        f"   memrefs: arc-deep-research · arc-codegen · arc-defi-trader · "
        f"arc-legal · arc-design · arc-support · arc-compliance · "
        f"arc-data · arc-orchestrator\n"
        f"5. Sign off as 'ARC Content Creator (arc-content)'.\n"
        f"Return the final, ship-ready {fmt['name']}."
    )
    polished = _llm(llm_prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    memrefs = state.get("dag_memrefs", [])[10:18]
    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Content polish ({fmt['name']}): ship-ready pass",
        prev, llm_prompt, polished,
        memrefs=memrefs,
    )

    findings = list(state.get("findings", []))
    findings.append({"phase": "polish", "text": polished})

    return {
        "polished": polished,
        "record_ids": state["record_ids"] + [rid],
        "findings": findings,
    }


def inscribe_node(state: ContentState) -> dict:
    """Final inscription — bind the full DAG, emit ord command + chain."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    all_refs = state.get("dag_memrefs", [])
    final_refs = all_refs[:12] + all_refs[12:22]
    seen: set[str] = set()
    final_refs = [r for r in final_refs if not (r in seen or seen.add(r))]

    fmt_key = (state.get("content_format") or "article").lower()
    fmt = CONTENT_FORMATS.get(fmt_key, CONTENT_FORMATS["article"])

    final_action = (
        f"Content inscribed ({fmt['name']}): {state['prompt'][:80]}"
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(state["prompt"].encode()),
        ohash=arc.sha256hex(
            (state.get("polished", "") + state.get("refined", "")).encode()
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


def build_content_graph():
    graph = StateGraph(ContentState)

    graph.add_node("init", init_agent)
    graph.add_node("research", research_node)
    graph.add_node("draft", draft_node)
    graph.add_node("refine", refine_node)
    graph.add_node("polish", polish_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "research")
    graph.add_edge("research", "draft")
    graph.add_edge("draft", "refine")
    graph.add_edge("refine", "polish")
    graph.add_edge("polish", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


content_agent = build_content_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_content_formats() -> list[dict]:
    return [
        {
            "key": key,
            "name": fmt["name"],
            "summary": fmt["summary"],
            "structure": fmt["structure"],
        }
        for key, fmt in CONTENT_FORMATS.items()
    ]


def run_content_creator(
    prompt: str,
    content_format: str = "article",
    audience: str = "",
    price_sats: int = 9500,
    model: str = "llama3.2",
) -> dict:
    result = content_agent.invoke({
        "prompt": prompt,
        "content_format": content_format,
        "format_name": "",
        "audience": audience,
        "price_sats": price_sats,
        "model": model,
        "research": "",
        "draft": "",
        "refined": "",
        "polished": "",
        "findings": [],
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
        "content_format": content_format,
        "format_name": result.get("format_name", ""),
        "audience": audience,
        "price_sats": price_sats,
        "research": result.get("research", ""),
        "draft": result.get("draft", ""),
        "refined": result.get("refined", ""),
        "polished": result.get("polished", ""),
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
        "Write a high-signal piece explaining why Bitcoin-native agent "
        "provenance is the missing layer for the autonomous AI economy."
    )
    content_format = "article"
    audience = "crypto-native founders + AI builders"
    price_sats = 9500
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--format" and i + 1 < len(sys.argv):
            content_format = sys.argv[i + 1]
        if arg == "--audience" and i + 1 < len(sys.argv):
            audience = sys.argv[i + 1]
        if arg == "--sats" and i + 1 < len(sys.argv):
            try:
                price_sats = int(sys.argv[i + 1])
            except ValueError:
                pass
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    GOLD = "\033[38;2;234;179;8m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    ROSE = "\033[38;2;244;63;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - Content Creator Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {GOLD}*{RESET} Format:   {content_format}")
    print(f"  {GOLD}*{RESET} Audience: {audience}")
    print(f"  {GOLD}*{RESET} Price:    {price_sats} sats")
    print(f"  {GOLD}*{RESET} Model:    {model}")
    print(f"  {GOLD}*{RESET} Brief:    {prompt[:80]}\n")

    result = run_content_creator(prompt, content_format, audience, price_sats, model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Records created: {len(result['record_ids'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:     {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}*{RESET} Final record:    {result['final_id'][:20]}...")
    print(f"  {ROSE}*{RESET} Agent pubkey:    {result['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:48]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print(f"\n  {CYAN}Dispute:{RESET} {result['dispute_link']}\n")
