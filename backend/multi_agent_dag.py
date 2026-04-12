#!/usr/bin/env python3
"""Multi-Agent ARC Memory DAG
Three agents (Research, Synthesis, Composer) share memory via ARC Protocol.
Creates the composability moat: agents reference each other's inscriptions
through memrefs, building a growing DAG of shared knowledge.

Flow:
  Agent A (Research)  → inscribes specialized knowledge
  Agent B (Synthesis) → pays Lightning sat fee, references A's records via memrefs
  Agent C (Composer)  → composes from both A and B, builds the full DAG

Usage:
    python multi_agent_dag.py                # simulated mode
    python multi_agent_dag.py --ollama       # with local LLM
    python multi_agent_dag.py --cycles 5     # run 5 DAG cycles
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import arc


# ── Agent Definitions ──────────────────────────────────────────────────────

AGENTS = {
    "agent-a": {
        "alias": "arc-research",
        "role": "Research Specialist",
        "color": "\033[38;2;247;147;26m",  # orange
        "prompts": [
            "Analyze Bitcoin UTXO set growth patterns and implications for node operators",
            "Research BIP-340 Schnorr signature aggregation benefits for multi-agent systems",
            "Investigate Taproot script path spending for agent identity revocation",
            "Map Lightning Network gossip protocol efficiency for agent discovery",
            "Evaluate Ordinals inscription economics for permanent agent memory storage",
        ],
    },
    "agent-b": {
        "alias": "arc-synthesis",
        "role": "Synthesis Agent",
        "color": "\033[38;2;0;240;255m",  # cyan
        "prompts": [
            "Synthesize research on UTXO growth into actionable node optimization strategy",
            "Combine Schnorr aggregation findings with multi-agent coordination patterns",
            "Derive agent identity lifecycle from Taproot revocation research",
            "Synthesize gossip protocol analysis into agent mesh network design",
            "Build cost model for inscription-based permanent memory from economics research",
        ],
    },
    "agent-c": {
        "alias": "arc-composer",
        "role": "Composer Agent",
        "color": "\033[38;2;34;197;94m",  # green
        "prompts": [
            "Compose unified agent infrastructure plan from research and synthesis",
            "Build composable agent memory architecture from all prior findings",
            "Design cross-agent settlement protocol from synthesis and research layers",
            "Architect agent discovery mesh combining gossip and identity findings",
            "Draft ARC Protocol v2 spec from all composed agent memory insights",
        ],
    },
}

RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"


def log(agent_key: str, msg: str):
    agent = AGENTS[agent_key]
    color = agent["color"]
    print(f"  {color}●{RESET} {DIM}[{agent['alias']}]{RESET} {msg}")


def header(text: str):
    print(f"\n  {BOLD}{text}{RESET}")
    print(f"  {'─' * 58}")


# ── Multi-Agent DAG Loop ───────────────────────────────────────────────────


def run_multi_agent_dag(use_ollama: bool = False, cycles: int = 3):
    print()
    print(f"  {BOLD}{'═' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol – Multi-Agent Memory DAG{RESET}")
    print(f"  {BOLD}{'═' * 58}{RESET}")

    db = arc.get_db()

    # ── Phase 1: Generate agent identities ─────────────────────────────
    header("Phase 1 · Agent Identity Generation")

    secrets = {}
    pubkeys = {}
    genesis_ids = {}

    for key, agent in AGENTS.items():
        secret_hex, pubkey = arc.generate_keypair(agent["alias"])
        secrets[key] = bytes.fromhex(secret_hex)
        pubkeys[key] = pubkey

        genesis = arc.build_record(
            "genesis", secrets[key],
            f"{agent['role']} initialized for ARC memory DAG",
            alias=agent["alias"],
        )
        gid = arc.store(db, genesis)
        genesis_ids[key] = gid
        log(key, f"genesis {gid[:20]}... | pubkey {pubkey[:16]}...")

    # Track head of each agent's chain
    heads = dict(genesis_ids)

    # Track all record IDs per agent for memref composition
    agent_records: dict[str, list[str]] = {k: [v] for k, v in genesis_ids.items()}

    # ── Phase 2: DAG construction cycles ───────────────────────────────
    for cycle in range(cycles):
        header(f"Phase 2.{cycle + 1} · DAG Cycle {cycle + 1}/{cycles}")

        # ── Agent A: Research ──────────────────────────────────────────
        prompt_idx = cycle % len(AGENTS["agent-a"]["prompts"])
        prompt = AGENTS["agent-a"]["prompts"][prompt_idx]

        if use_ollama:
            output = arc.ollama_generate(prompt)
            log("agent-a", f"LLM: {output[:60]}...")
        else:
            output = f"[research] {prompt[:40]} — findings indexed"

        ihash = arc.sha256hex(prompt.encode())
        ohash = arc.sha256hex(output.encode())
        rec_a = arc.build_record(
            "action", secrets["agent-a"],
            f"Research: {prompt[:50]}...",
            prev=heads["agent-a"],
            ihash=ihash, ohash=ohash,
            alias="arc-research",
        )
        rid_a = arc.store(db, rec_a)
        heads["agent-a"] = rid_a
        agent_records["agent-a"].append(rid_a)
        log("agent-a", f"action  {rid_a[:20]}... | {prompt[:45]}...")

        time.sleep(0.05)

        # ── Agent B: Synthesis (references Agent A via memrefs) ────────
        prompt_idx_b = cycle % len(AGENTS["agent-b"]["prompts"])
        prompt_b = AGENTS["agent-b"]["prompts"][prompt_idx_b]

        if use_ollama:
            output_b = arc.ollama_generate(prompt_b)
            log("agent-b", f"LLM: {output_b[:60]}...")
        else:
            output_b = f"[synthesis] Composed from research {rid_a[:16]}..."

        ihash_b = arc.sha256hex(prompt_b.encode())
        ohash_b = arc.sha256hex(output_b.encode())

        # Agent B references Agent A's latest record
        rec_b = arc.build_record(
            "action", secrets["agent-b"],
            f"Synthesis: {prompt_b[:50]}...",
            prev=heads["agent-b"],
            memrefs=[rid_a],  # ← cross-agent memref to A's research
            ihash=ihash_b, ohash=ohash_b,
            alias="arc-synthesis",
        )
        rid_b = arc.store(db, rec_b)
        heads["agent-b"] = rid_b
        agent_records["agent-b"].append(rid_b)
        log("agent-b", f"action  {rid_b[:20]}... | memref→{rid_a[:12]}...")

        time.sleep(0.05)

        # ── Agent B: Lightning settlement for using A's research ───────
        preimage = os.urandom(32)
        phash = arc.sha256hex(preimage)
        settle_amount = 10 + cycle * 5  # increasing fees per cycle

        settlement = {
            "type": "lightning",
            "amount_sats": settle_amount,
            "payment_hash": phash,
            "preimage": preimage.hex(),
        }
        rec_settle = arc.build_record(
            "settlement", secrets["agent-b"],
            f"Settlement: {settle_amount} sats for research access",
            prev=rid_b, settlement=settlement,
            ihash=arc.sha256hex(f"settle:{rid_b}:{settle_amount}".encode()),
            ohash=arc.sha256hex(f"paid:{phash}".encode()),
            alias="arc-synthesis",
        )
        sid = arc.store(db, rec_settle)
        heads["agent-b"] = sid
        agent_records["agent-b"].append(sid)
        log("agent-b", f"settle  {sid[:20]}... | ⚡ {settle_amount} sats → research fee")

        time.sleep(0.05)

        # ── Agent C: Compose from both A and B ─────────────────────────
        prompt_idx_c = cycle % len(AGENTS["agent-c"]["prompts"])
        prompt_c = AGENTS["agent-c"]["prompts"][prompt_idx_c]

        if use_ollama:
            output_c = arc.ollama_generate(prompt_c)
            log("agent-c", f"LLM: {output_c[:60]}...")
        else:
            output_c = f"[composed] Merged {rid_a[:12]} + {rid_b[:12]}"

        ihash_c = arc.sha256hex(prompt_c.encode())
        ohash_c = arc.sha256hex(output_c.encode())

        # Agent C references BOTH A's research AND B's synthesis
        rec_c = arc.build_record(
            "action", secrets["agent-c"],
            f"Compose: {prompt_c[:50]}...",
            prev=heads["agent-c"],
            memrefs=[rid_a, rid_b],  # ← DAG: references both agents
            ihash=ihash_c, ohash=ohash_c,
            alias="arc-composer",
        )
        rid_c = arc.store(db, rec_c)
        heads["agent-c"] = rid_c
        agent_records["agent-c"].append(rid_c)
        log("agent-c", f"action  {rid_c[:20]}... | memref→[{rid_a[:8]},{rid_b[:8]}]")

    # ── Phase 3: Final composition + settlement ────────────────────────
    header("Phase 3 · Final Composition & Settlement")

    # Agent C settles for the full composed work
    preimage_final = os.urandom(32)
    phash_final = arc.sha256hex(preimage_final)
    total_sats = 100

    settlement_final = {
        "type": "lightning",
        "amount_sats": total_sats,
        "payment_hash": phash_final,
        "preimage": preimage_final.hex(),
    }
    rec_final = arc.build_record(
        "settlement", secrets["agent-c"],
        f"Final settlement: {total_sats} sats for composed DAG output",
        prev=heads["agent-c"], settlement=settlement_final,
        ihash=arc.sha256hex(f"final-settle:{heads['agent-c']}".encode()),
        ohash=arc.sha256hex(f"paid:{phash_final}".encode()),
        alias="arc-composer",
    )
    final_id = arc.store(db, rec_final)
    agent_records["agent-c"].append(final_id)
    log("agent-c", f"settle  {final_id[:20]}... | ⚡ {total_sats} sats → final DAG output")

    # ── Phase 4: Validate all chains ───────────────────────────────────
    header("Phase 4 · Chain Validation")

    all_valid = True
    for key, agent in AGENTS.items():
        last_id = agent_records[key][-1]
        errs = arc.validate(db, last_id, deep=True)
        if errs:
            log(key, f"FAIL: {errs}")
            all_valid = False
        else:
            log(key, f"PASS: chain valid ({len(agent_records[key])} records)")

    # ── Phase 5: DAG summary ───────────────────────────────────────────
    header("Phase 5 · Memory DAG Summary")

    total_records = sum(len(v) for v in agent_records.values())
    total_memrefs = 0
    total_sats_settled = 0

    for key in agent_records:
        for rid in agent_records[key]:
            rec = arc.fetch(db, rid)
            if rec:
                total_memrefs += len(rec.get("memrefs", []))
                if rec.get("settlement"):
                    total_sats_settled += rec["settlement"]["amount_sats"]

    print(f"\n  {BOLD}DAG Statistics:{RESET}")
    print(f"    Agents:          {len(AGENTS)}")
    print(f"    Total records:   {total_records}")
    print(f"    Cross-agent refs:{total_memrefs}")
    print(f"    Sats settled:    {total_sats_settled}")
    print(f"    DAG cycles:      {cycles}")
    print(f"    All valid:       {'YES' if all_valid else 'NO'}")

    # ── Print DAG structure ────────────────────────────────────────────
    header("DAG Structure")

    for key, agent in AGENTS.items():
        color = agent["color"]
        print(f"\n  {color}{'━' * 50}{RESET}")
        print(f"  {color}{agent['role']}{RESET} ({agent['alias']})")
        print(f"  {DIM}pubkey: {pubkeys[key][:24]}...{RESET}")

        for rid in agent_records[key]:
            rec = arc.fetch(db, rid)
            if not rec:
                continue
            rtype = rec["type"]
            settle_info = ""
            if rec.get("settlement"):
                settle_info = f" | ⚡ {rec['settlement']['amount_sats']} sats"
            memref_info = ""
            if rec.get("memrefs"):
                refs = [m[:8] for m in rec["memrefs"]]
                memref_info = f" | refs→[{','.join(refs)}]"

            print(
                f"    {color}│{RESET} [{rtype:10}] {rid[:16]}... "
                f"| {rec['action'][:35]}{settle_info}{memref_info}"
            )

    # ── Inscription commands ───────────────────────────────────────────
    header("Bitcoin Inscription Commands")

    print(f"\n  {DIM}To inscribe the final composed DAG output:{RESET}")
    final_rec = arc.fetch(db, final_id)
    if final_rec:
        cmd = arc.inscription_envelope(final_rec)
        print(f"  $ {cmd[:100]}...")

    print(f"\n  {DIM}All records stored in: {arc.DB_PATH}{RESET}")
    print(f"  {DIM}View in dashboard:     http://localhost:3000/dag{RESET}")
    print()

    return {
        "agents": {k: pubkeys[k] for k in AGENTS},
        "records": agent_records,
        "total_records": total_records,
        "total_memrefs": total_memrefs,
        "total_sats": total_sats_settled,
        "valid": all_valid,
    }


if __name__ == "__main__":
    use_ollama = "--ollama" in sys.argv
    cycles = 3
    for i, arg in enumerate(sys.argv):
        if arg == "--cycles" and i + 1 < len(sys.argv):
            cycles = int(sys.argv[i + 1])
    run_multi_agent_dag(use_ollama=use_ollama, cycles=cycles)
