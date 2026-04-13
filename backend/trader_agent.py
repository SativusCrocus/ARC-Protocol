"""ARC DeFi Trader Agent – LangGraph + Ollama
Autonomous DeFi trading agent that inscribes every trade decision as an ARC Action record.
References Research Agent + Code Generator + Marketplace records via memrefs
for full provenance chain across all ARC agents.

Architecture (LangGraph StateGraph):
    init → scan → analyze → signal → risk → execute → settle → inscribe → END

Each node calls Ollama for inference and creates a signed ARC action record.
The final inscription memrefs all prior steps + existing agent records.
Lightning settlement is created for paid signal distribution.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── State Schema ──────────────────────────────────────────────────────────────


class TraderState(TypedDict):
    market_prompt: str
    model: str
    pair: str
    timeframe: str
    max_risk_pct: float
    max_position_sats: int
    scan: str
    analysis: str
    signal: str
    risk_assessment: str
    execution_plan: str
    settlement_id: str
    settlement_hash: str
    settlement_preimage: str
    signal_fee_sats: int
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
    return f"[simulated] Trade output for: {prompt[:120]}"


# ── DAG Discovery ────────────────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Find existing Research, Codegen, Marketplace, and DAG records for memrefs.
    This creates the full provenance chain across all ARC agents."""
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "marketplace", "arc-codegen",
        "arc-defi-trader",
    }
    found = []
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target_aliases:
            found.append(rid)
    return found[:10]


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
    """Create and store an ARC action record for a trader step."""
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


def init_agent(state: TraderState) -> dict:
    """Initialize trader agent identity and discover related ARC records."""
    db = arc.get_db()
    alias = "arc-defi-trader"

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
            "DeFi Trader Agent initialized — LangGraph + Ollama + ARC Protocol + Lightning Settlement",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    # Discover all related agent records for cross-agent memrefs
    dag_refs = _find_related_records(db)

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
    }


def scan_node(state: TraderState) -> dict:
    """Scan market conditions via Ollama."""
    pair = state.get("pair", "BTC/USD")
    timeframe = state.get("timeframe", "4h")
    market_prompt = state["market_prompt"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are an autonomous DeFi trading agent operating under ARC Protocol "
        f"(Agent Record Convention) on Bitcoin. Every trade decision is inscribed "
        f"as a permanent, signed record on Bitcoin.\n\n"
        f"Market Query: {market_prompt}\n"
        f"Trading Pair: {pair}\n"
        f"Timeframe: {timeframe}\n\n"
        f"Perform a comprehensive market scan:\n"
        f"1. Current market structure (trend, support/resistance levels)\n"
        f"2. Key technical indicators (RSI, MACD, Bollinger Bands, volume)\n"
        f"3. On-chain metrics (if applicable: TVL, DEX volume, funding rates)\n"
        f"4. Market sentiment and narrative drivers\n"
        f"5. Correlation analysis with BTC and broader crypto market\n"
        f"Be specific with price levels and data points."
    )
    scan = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Market scan: {pair} {timeframe} — {market_prompt[:60]}",
        prev, prompt, scan,
    )

    return {
        "scan": scan,
        "record_ids": state["record_ids"] + [rid],
    }


def analyze_node(state: TraderState) -> dict:
    """Deep analysis of market conditions."""
    pair = state.get("pair", "BTC/USD")
    scan = state["scan"]
    market_prompt = state["market_prompt"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are the analysis layer of an ARC Protocol DeFi trading agent.\n"
        f"Every output is cryptographically signed and chain-linked.\n\n"
        f"Market Query: {market_prompt}\n"
        f"Pair: {pair}\n"
        f"Scan Data:\n{scan[:2000]}\n\n"
        f"Provide deep technical analysis:\n"
        f"1. Multi-timeframe trend alignment (1h, 4h, 1d)\n"
        f"2. Order flow analysis and liquidity zones\n"
        f"3. Key levels: entry, targets (TP1, TP2, TP3), stop-loss\n"
        f"4. Probability assessment (high/medium/low confidence)\n"
        f"5. Invalidation conditions (when is the thesis wrong?)\n"
        f"6. Expected risk-reward ratio\n"
        f"Be quantitative — this analysis is permanently inscribed."
    )
    analysis = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # Reference Research + other agent records
    memrefs = state.get("dag_memrefs", [])[:3]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Analysis: {pair} — {market_prompt[:60]}",
        prev, prompt, analysis,
        memrefs=memrefs,
    )

    return {
        "analysis": analysis,
        "record_ids": state["record_ids"] + [rid],
    }


def signal_node(state: TraderState) -> dict:
    """Generate trading signal from analysis."""
    pair = state.get("pair", "BTC/USD")
    analysis = state["analysis"]
    market_prompt = state["market_prompt"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are the signal generator of an ARC Protocol DeFi trading agent.\n"
        f"Generate a precise, actionable trading signal.\n\n"
        f"Pair: {pair}\n"
        f"Analysis:\n{analysis[:2000]}\n\n"
        f"Generate a structured trade signal:\n"
        f"SIGNAL: LONG or SHORT or HOLD\n"
        f"PAIR: {pair}\n"
        f"ENTRY: <price or range>\n"
        f"STOP_LOSS: <price>\n"
        f"TP1: <price> (partial exit)\n"
        f"TP2: <price> (main target)\n"
        f"TP3: <price> (stretch target)\n"
        f"SIZE: <percentage of portfolio>\n"
        f"CONFIDENCE: <high/medium/low>\n"
        f"TIMEFRAME: <expected duration>\n"
        f"R:R RATIO: <risk-reward>\n"
        f"THESIS: <1-2 sentence summary>\n"
        f"INVALIDATION: <when to exit regardless>\n\n"
        f"This signal will be inscribed on Bitcoin as permanent provenance."
    )
    signal = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"SIGNAL: {pair} — {market_prompt[:60]}",
        prev, prompt, signal,
    )

    return {
        "signal": signal,
        "record_ids": state["record_ids"] + [rid],
    }


def risk_node(state: TraderState) -> dict:
    """Assess risk parameters and validate position sizing."""
    pair = state.get("pair", "BTC/USD")
    signal = state["signal"]
    max_risk = state.get("max_risk_pct", 2.0)
    max_position = state.get("max_position_sats", 1_000_000)
    market_prompt = state["market_prompt"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are the risk management layer of an ARC Protocol DeFi trading agent.\n"
        f"Every risk decision is permanently inscribed on Bitcoin.\n\n"
        f"Signal:\n{signal[:1500]}\n"
        f"Max Risk Per Trade: {max_risk}%\n"
        f"Max Position Size: {max_position} sats\n\n"
        f"Validate and adjust the trade:\n"
        f"1. Position sizing calculation (Kelly criterion or fixed-fractional)\n"
        f"2. Risk-per-trade in sats (must not exceed {max_risk}% of max position)\n"
        f"3. Leverage recommendation (if any)\n"
        f"4. Correlation risk with existing positions\n"
        f"5. Drawdown impact assessment\n"
        f"6. APPROVED or REJECTED with reasoning\n"
        f"7. If approved, final adjusted parameters\n"
        f"Be conservative — this is cryptographically signed risk management."
    )
    risk_assessment = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Risk assessment: {pair} — max {max_risk}%",
        prev, prompt, risk_assessment,
    )

    return {
        "risk_assessment": risk_assessment,
        "record_ids": state["record_ids"] + [rid],
    }


def execute_node(state: TraderState) -> dict:
    """Generate execution plan (simulated — no real trades)."""
    pair = state.get("pair", "BTC/USD")
    signal = state["signal"]
    risk_assessment = state["risk_assessment"]
    market_prompt = state["market_prompt"]
    model = state.get("model", "llama3.2")

    prompt = (
        f"You are the execution engine of an ARC Protocol DeFi trading agent.\n"
        f"Generate a detailed execution plan for this trade.\n\n"
        f"Signal:\n{signal[:1000]}\n"
        f"Risk Assessment:\n{risk_assessment[:1000]}\n\n"
        f"Create execution plan:\n"
        f"1. Order type (limit/market/TWAP/iceberg)\n"
        f"2. Execution venue (DEX/CEX/aggregator)\n"
        f"3. Slippage tolerance\n"
        f"4. Order splitting strategy (if size warrants)\n"
        f"5. Contingency orders (stop-loss, take-profit OCO)\n"
        f"6. Estimated execution cost (fees + slippage)\n"
        f"7. Post-execution monitoring plan\n\n"
        f"NOTE: This is a SIMULATED execution plan inscribed on Bitcoin.\n"
        f"No real trades are executed — this is provenance for the signal."
    )
    execution_plan = _llm(prompt, model)

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    # Reference ALL agent records for full provenance
    memrefs = state.get("dag_memrefs", [])

    rid = _inscribe_step(
        db, secret, state["agent_alias"],
        f"Execution plan: {pair} — {market_prompt[:50]}",
        prev, prompt, execution_plan,
        memrefs=memrefs,
    )

    return {
        "execution_plan": execution_plan,
        "record_ids": state["record_ids"] + [rid],
    }


def settle_node(state: TraderState) -> dict:
    """Create Lightning settlement for the paid signal."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    signal_fee = state.get("signal_fee_sats", 1000)
    pair = state.get("pair", "BTC/USD")

    # Generate Lightning preimage and payment hash
    preimage = os.urandom(32)
    payment_hash = arc.sha256hex(preimage)

    settlement = {
        "type": "lightning",
        "amount_sats": signal_fee,
        "payment_hash": payment_hash,
        "preimage": preimage.hex(),
    }

    rec = arc.build_record(
        "settlement",
        secret,
        f"Signal settlement: {signal_fee} sats for {pair} trade signal",
        prev=prev,
        settlement=settlement,
        ihash=arc.sha256hex(f"signal:{pair}:{state['market_prompt'][:100]}".encode()),
        ohash=arc.sha256hex(f"paid:{payment_hash}:{signal_fee}".encode()),
        alias=state["agent_alias"],
    )
    if not arc.verify_sig(rec):
        return {"error": "Settlement signature failed"}
    rid = arc.store(db, rec)

    return {
        "settlement_id": rid,
        "settlement_hash": payment_hash,
        "settlement_preimage": preimage.hex(),
        "record_ids": state["record_ids"] + [rid],
    }


def inscribe_node(state: TraderState) -> dict:
    """Generate final Bitcoin inscription command and build full chain."""
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


def build_trader_graph():
    """Compile the LangGraph DeFi trader agent."""
    graph = StateGraph(TraderState)

    graph.add_node("init", init_agent)
    graph.add_node("scan", scan_node)
    graph.add_node("analyze", analyze_node)
    graph.add_node("signal", signal_node)
    graph.add_node("risk", risk_node)
    graph.add_node("execute", execute_node)
    graph.add_node("settle", settle_node)
    graph.add_node("inscribe", inscribe_node)

    graph.set_entry_point("init")
    graph.add_edge("init", "scan")
    graph.add_edge("scan", "analyze")
    graph.add_edge("analyze", "signal")
    graph.add_edge("signal", "risk")
    graph.add_edge("risk", "execute")
    graph.add_edge("execute", "settle")
    graph.add_edge("settle", "inscribe")
    graph.add_edge("inscribe", END)

    return graph.compile()


trader_agent = build_trader_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def run_trader(
    market_prompt: str,
    pair: str = "BTC/USD",
    timeframe: str = "4h",
    max_risk_pct: float = 2.0,
    max_position_sats: int = 1_000_000,
    signal_fee_sats: int = 1000,
    model: str = "llama3.2",
) -> dict:
    """Run the full DeFi trader pipeline. Returns signal + ARC chain + settlement."""
    result = trader_agent.invoke({
        "market_prompt": market_prompt,
        "model": model,
        "pair": pair,
        "timeframe": timeframe,
        "max_risk_pct": max_risk_pct,
        "max_position_sats": max_position_sats,
        "signal_fee_sats": signal_fee_sats,
        "scan": "",
        "analysis": "",
        "signal": "",
        "risk_assessment": "",
        "execution_plan": "",
        "settlement_id": "",
        "settlement_hash": "",
        "settlement_preimage": "",
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
        "market_prompt": market_prompt,
        "pair": pair,
        "timeframe": timeframe,
        "max_risk_pct": max_risk_pct,
        "max_position_sats": max_position_sats,
        "signal_fee_sats": signal_fee_sats,
        "scan": result.get("scan", ""),
        "analysis": result.get("analysis", ""),
        "signal": result.get("signal", ""),
        "risk_assessment": result.get("risk_assessment", ""),
        "execution_plan": result.get("execution_plan", ""),
        "settlement_id": result.get("settlement_id", ""),
        "settlement_hash": result.get("settlement_hash", ""),
        "settlement_preimage": result.get("settlement_preimage", ""),
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

    market_prompt = " ".join(sys.argv[1:]) or "Analyze BTC/USD for swing trade opportunities"
    pair = "BTC/USD"
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--pair" and i + 1 < len(sys.argv):
            pair = sys.argv[i + 1]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;34;197;94m"
    RED = "\033[38;2;244;63;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol - DeFi Trader Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Ollama + Lightning Settlement{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {CYAN}*{RESET} Prompt: {market_prompt}")
    print(f"  {CYAN}*{RESET} Pair:   {pair}")
    print(f"  {CYAN}*{RESET} Model:  {model}\n")

    result = run_trader(market_prompt, pair=pair, model=model)

    print(f"\n  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Records created:  {len(result['record_ids'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:      {len(result['dag_memrefs'])}")
    print(f"  {ORANGE}*{RESET} Final record:      {result['final_id'][:20]}...")
    print(f"  {GREEN}*{RESET} Agent pubkey:      {result['agent_pubkey'][:24]}...")
    print(f"  {RED}*{RESET} Settlement:        {result['settlement_hash'][:20]}...")
    print(f"  {RED}*{RESET} Signal fee:        {result['signal_fee_sats']} sats")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in result["chain"]:
        rec = item["record"]
        rtype = rec["type"]
        icon = "⚡" if rtype == "settlement" else "●"
        print(f"    {icon} [{rtype:10}] {item['id'][:16]}... | {rec['action'][:40]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {result['inscription_cmd'][:100]}...")
    print()
