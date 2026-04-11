#!/usr/bin/env python3
"""Example ARC Agent Loop
Demonstrates a complete agent lifecycle: genesis -> actions -> settlement.
Uses Ollama when available, falls back to simulated responses.

Usage:
    python example_agent.py             # simulated mode
    python example_agent.py --ollama    # with local LLM
"""

import os
import sys
import time

import arc


def run_agent(use_ollama: bool = False):
    print("=" * 60)
    print("  ARC Protocol – Example Agent Loop")
    print("=" * 60)

    # 1. Generate identity
    secret_hex, pubkey = arc.generate_keypair("example-agent")
    secret = bytes.fromhex(secret_hex)
    db = arc.get_db()
    print(f"\n  Agent pubkey: {pubkey}")

    # 2. Genesis
    genesis = arc.build_record(
        "genesis", secret, "Agent initialized: market analysis bot",
        alias="example-agent",
    )
    gid = arc.store(db, genesis)
    print(f"\n  [genesis]    {gid[:24]}...")

    # 3. Action loop
    prev_id = gid
    prompts = [
        "Analyze current Bitcoin mempool congestion and recommend fee rate",
        "Summarize recent Lightning Network capacity changes in 3 bullets",
        "Evaluate risk profile for opening a 2M sat channel to ACINQ node",
    ]

    for i, prompt in enumerate(prompts, 1):
        time.sleep(0.05)
        if use_ollama:
            output = arc.ollama_generate(prompt)
            print(f"\n  LLM: {output[:80]}...")
        else:
            output = f"[simulated] Analysis complete for task {i}"

        ihash = arc.sha256hex(prompt.encode())
        ohash = arc.sha256hex(output.encode())
        rec = arc.build_record(
            "action", secret, f"Task {i}: {prompt[:50]}...",
            prev=prev_id, ihash=ihash, ohash=ohash,
        )
        rid = arc.store(db, rec)
        prev_id = rid
        print(f"  [action {i}]   {rid[:24]}... | {prompt[:50]}")

    # 4. Settlement
    time.sleep(0.05)
    preimage = os.urandom(32)
    phash = arc.sha256hex(preimage)
    settlement = {
        "type": "lightning",
        "amount_sats": 1000,
        "payment_hash": phash,
        "preimage": preimage.hex(),
    }
    rec = arc.build_record(
        "settlement", secret, "Settlement: 1000 sats for analysis work",
        prev=prev_id, settlement=settlement,
        ihash=arc.sha256hex(f"settle:{prev_id}".encode()),
        ohash=arc.sha256hex(f"paid:{phash}".encode()),
    )
    sid = arc.store(db, rec)
    print(f"  [settlement] {sid[:24]}... | 1000 sats")

    # 5. Validate full chain
    print(f"\n{'─' * 60}")
    print("  Validating full chain...")
    errs = arc.validate(db, sid, deep=True)
    if not errs:
        print("  PASS: Full chain valid (genesis -> 3 actions -> settlement)")
    else:
        print("  FAIL:")
        for e in errs:
            print(f"    x {e}")

    # 6. Print chain
    print(f"\n{'─' * 60}")
    print("  Full provenance chain:\n")
    chain = []
    cur = sid
    while cur:
        r = arc.fetch(db, cur)
        if not r:
            break
        chain.append((cur, r))
        cur = r.get("prev")
    for rid, r in reversed(chain):
        settle = ""
        if r.get("settlement"):
            settle = f" | {r['settlement']['amount_sats']} sats"
        print(f"    [{r['type']:10}] {rid[:20]}... | {r['action'][:40]}{settle}")

    print(f"\n  Records stored: {arc.DB_PATH}")
    print(f"  Total records:  {len(arc.all_records(db))}")
    print()


if __name__ == "__main__":
    run_agent(use_ollama="--ollama" in sys.argv)
