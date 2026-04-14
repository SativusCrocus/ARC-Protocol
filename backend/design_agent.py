"""ARC Design & Images Agent — LangGraph + Flux/Ollama
Autonomous generative-design agent. Every generated image is:

  1. Prompt-expanded via Ollama (styled by the selected aesthetic)
  2. Rendered via a configured Flux / Stable-Diffusion endpoint
     (FLUX_HOST / SD_HOST env) or, failing that, as a deterministic SVG
     composed from the prompt hash so the agent never degrades to a
     blank output on serverless hosts.
  3. Hashed into an IPFS-compatible CIDv1 (raw codec + sha256) so
     downstream consumers can pin / address the artifact.
  4. Inscribed as an ARC Action record whose memrefs anchor the full
     certified-agent DAG (Deep Research + Code Generator + DeFi Trader
     + Legal Contracts + the original seeded Memory DAG).

LangGraph topology:
    init → expand → render → caption → inscribe → END
"""

import base64
import hashlib
import os
from typing import Optional

from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

import arc


# ── Styles ────────────────────────────────────────────────────────────────────


STYLES: dict[str, dict] = {
    "photorealistic": {
        "name": "Photorealistic",
        "palette": ["#0a0a0f", "#1f2937", "#3b4252", "#9ca3af", "#f3f4f6"],
        "prompt_prefix": "photorealistic, DSLR, 85mm, natural light, cinematic",
    },
    "cyberpunk": {
        "name": "Cyberpunk",
        "palette": ["#0a0020", "#1b0033", "#EC4899", "#00F0FF", "#F7931A"],
        "prompt_prefix": "cyberpunk, neon, rain, high contrast, blade runner",
    },
    "abstract": {
        "name": "Abstract",
        "palette": ["#020202", "#a855f7", "#ec4899", "#f59e0b", "#00F0FF"],
        "prompt_prefix": "abstract, flowing geometry, chromatic, generative art",
    },
    "anime": {
        "name": "Anime",
        "palette": ["#111827", "#fb7185", "#60a5fa", "#fde047", "#fef2f2"],
        "prompt_prefix": "anime, studio ghibli, cel shaded, vivid colors",
    },
    "minimalist": {
        "name": "Minimalist",
        "palette": ["#0a0a0a", "#111827", "#9ca3af", "#F7931A", "#f3f4f6"],
        "prompt_prefix": "minimalist, flat, swiss design, lots of whitespace",
    },
    "retrofuturist": {
        "name": "Retrofuturist",
        "palette": ["#030114", "#7c3aed", "#ec4899", "#f59e0b", "#facc15"],
        "prompt_prefix": "retrofuturist, 1980s, synthwave, grid horizon, sunset",
    },
}


ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1":  (1024, 1024),
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "4:3":  (1024, 768),
    "3:4":  (768, 1024),
}


# ── State ─────────────────────────────────────────────────────────────────────


class DesignState(TypedDict):
    prompt: str
    style: str
    style_name: str
    aspect_ratio: str
    model: str
    expanded_prompt: str
    caption: str
    svg: str
    image_cid: str
    image_uri: str
    width: int
    height: int
    record_ids: list[str]
    dag_memrefs: list[str]
    agent_pubkey: str
    agent_alias: str
    final_id: str
    inscription_cmd: str
    chain: list[dict]
    error: str


# ── Ollama helper ────────────────────────────────────────────────────────────


def _llm(prompt: str, model: str = "llama3.2") -> str:
    result = arc.ollama_generate(prompt, model)
    if result:
        return result
    for alt in ("llama3.1:8b", "llama3.1", "qwen2.5:14b", "mistral"):
        if alt != model:
            result = arc.ollama_generate(prompt, alt)
            if result:
                return result
    return f"[simulated] {prompt[:120]}"


# ── Cross-agent DAG discovery ────────────────────────────────────────────────


def _find_related_records(db) -> list[str]:
    """Collect memrefs spanning every certified-agent lineage.

    The design agent's value proposition is that every generated image is
    anchored to the *entire* live ARC DAG — Research + Codegen + Trader +
    Legal + Memory DAG seed. We walk the DB, bucket by alias, and return
    up to 12 record ids so the final inscription is breadth-first across
    the whole lattice.
    """
    target_aliases = {
        "arc-deep-research", "arc-research", "arc-synthesis",
        "arc-composer", "arc-analyst",
        "arc-codegen",
        "arc-defi-trader",
        "arc-legal",
        "marketplace",
        "arc-validator", "arc-oracle", "arc-indexer",
        "arc-design",
    }
    by_alias: dict[str, list[str]] = {}
    for rid, rec in arc.all_records(db):
        alias = rec.get("agent", {}).get("alias", "")
        if alias in target_aliases:
            by_alias.setdefault(alias, []).append(rid)

    found: list[str] = []
    # Pass 1: latest from each alias
    for alias, ids in by_alias.items():
        if ids:
            found.append(ids[-1])
    # Pass 2: second-latest to deepen provenance
    for alias, ids in by_alias.items():
        if len(ids) > 1:
            found.append(ids[-2])
        if len(found) >= 12:
            break
    return found[:12]


# ── IPFS CID (CIDv1, raw codec, sha256) ──────────────────────────────────────


def _ipfs_cid(data: bytes) -> str:
    """Return a CIDv1-style identifier for the given bytes.

    Uses the CIDv1 prefix (0x01), raw codec (0x55), sha256 multihash
    (0x12 0x20 + digest), base32-encoded per the multibase `b` spec.
    The result is shaped exactly like a real `bafkrei...` CID so
    downstream IPFS clients can resolve / pin it.
    """
    h = hashlib.sha256(data).digest()
    multihash = b"\x12\x20" + h
    cid_bytes = b"\x01\x55" + multihash
    b32 = base64.b32encode(cid_bytes).decode("ascii").lower().rstrip("=")
    return "b" + b32


# ── Image rendering ──────────────────────────────────────────────────────────


def _flux_render(prompt: str, width: int, height: int) -> Optional[bytes]:
    """Call a configured Flux / SD endpoint if available; else None."""
    host = os.environ.get("FLUX_HOST") or os.environ.get("SD_HOST")
    if not host:
        return None
    try:
        import requests
        r = requests.post(
            f"{host.rstrip('/')}/sdapi/v1/txt2img",
            json={
                "prompt": prompt,
                "width": width,
                "height": height,
                "steps": int(os.environ.get("FLUX_STEPS", "24")),
                "cfg_scale": 7.0,
            },
            timeout=180,
        )
        if r.status_code != 200:
            return None
        data = r.json().get("images", [])
        if not data:
            return None
        return base64.b64decode(data[0])
    except Exception:
        return None


def _svg_render(prompt: str, style: str, width: int, height: int) -> str:
    """Deterministic SVG fallback — always produces a meaningful artifact.

    Uses the prompt+style SHA-256 to seed shape layout, color choice
    (from the style palette), and grid density. The result is visually
    distinct per-prompt while being byte-stable (same input → same CID).
    """
    style_cfg = STYLES.get(style, STYLES["abstract"])
    palette = style_cfg["palette"]
    h = hashlib.sha256(f"{style}:{prompt}".encode()).digest()

    shapes: list[str] = []
    for i in range(14):
        cx = (h[(i * 2) % 32] / 255.0) * width
        cy = (h[(i * 2 + 1) % 32] / 255.0) * height
        r = 48 + (h[(i * 3) % 32] / 255.0) * min(width, height) * 0.38
        color = palette[(i + h[i % 32]) % len(palette)]
        opacity = 0.16 + (h[(i * 5) % 32] / 255.0) * 0.55
        shapes.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" '
            f'fill="{color}" opacity="{opacity:.3f}" />'
        )

    lines: list[str] = []
    gx = max(40, width // 20)
    gy = max(40, height // 16)
    for i in range(0, width + 1, gx):
        lines.append(
            f'<line x1="{i}" y1="0" x2="{i}" y2="{height}" '
            f'stroke="{palette[-1]}" stroke-opacity="0.08" stroke-width="1" />'
        )
    for j in range(0, height + 1, gy):
        lines.append(
            f'<line x1="0" y1="{j}" x2="{width}" y2="{j}" '
            f'stroke="{palette[-1]}" stroke-opacity="0.08" stroke-width="1" />'
        )

    bg = palette[0]
    mid = palette[1] if len(palette) > 1 else bg
    accent = palette[2] if len(palette) > 2 else palette[-1]
    short_prompt = (
        prompt[:64].replace("<", "").replace(">", "").replace("&", "and")
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" preserveAspectRatio="xMidYMid meet">'
        f'<defs>'
        f'<radialGradient id="bg" cx="50%" cy="50%" r="75%">'
        f'<stop offset="0%" stop-color="{mid}"/>'
        f'<stop offset="100%" stop-color="{bg}"/>'
        f'</radialGradient>'
        f'<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">'
        f'<feGaussianBlur stdDeviation="24" />'
        f'</filter>'
        f'</defs>'
        f'<rect width="100%" height="100%" fill="url(#bg)" />'
        f'<g filter="url(#glow)">{"".join(shapes)}</g>'
        f'<g>{"".join(lines)}</g>'
        f'<g fill="{accent}" font-family="monospace" font-size="14" opacity="0.6">'
        f'<text x="24" y="30">arc-design // {style_cfg["name"].lower()}</text>'
        f'<text x="24" y="{height - 18}">{short_prompt}</text>'
        f'</g>'
        f'</svg>'
    )


# ── LangGraph nodes ──────────────────────────────────────────────────────────


def init_agent(state: DesignState) -> dict:
    """Load or create the arc-design identity and discover cross-agent DAG."""
    db = arc.get_db()
    alias = "arc-design"

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
            "Design & Images Agent initialized — LangGraph + Flux/Ollama + ARC Protocol",
            alias=alias,
        )
        if not arc.verify_sig(genesis):
            return {"error": "Genesis signature failed"}
        genesis_id = arc.store(db, genesis)
        record_ids = [genesis_id]
    else:
        record_ids = [rows[-1][0]]

    dag_refs = _find_related_records(db)
    style_key = (state.get("style") or "abstract").lower()
    style_cfg = STYLES.get(style_key, STYLES["abstract"])
    aspect = state.get("aspect_ratio") or "1:1"
    w, h = ASPECT_RATIOS.get(aspect, ASPECT_RATIOS["1:1"])

    return {
        "record_ids": record_ids,
        "dag_memrefs": dag_refs,
        "agent_pubkey": pubkey,
        "agent_alias": alias,
        "style_name": style_cfg["name"],
        "width": w,
        "height": h,
    }


def expand_node(state: DesignState) -> dict:
    """Expand the user prompt into a dense, style-conditioned image prompt."""
    style_cfg = STYLES.get(state["style"], STYLES["abstract"])
    model = state.get("model", "llama3.2")
    prompt = state["prompt"]
    llm_prompt = (
        f"You are a prompt engineer for a generative image model under the "
        f"ARC Protocol (Bitcoin-native Agent Record Convention). Every word "
        f"of your output will be cryptographically signed and inscribed "
        f"on-chain.\n\n"
        f"Base prompt: {prompt}\n"
        f"Target style: {style_cfg['name']} — {style_cfg['prompt_prefix']}\n"
        f"Aspect ratio: {state.get('aspect_ratio', '1:1')}\n\n"
        f"Expand this into ONE dense, visually specific prompt suitable "
        f"for Flux / Stable Diffusion. Include subject, setting, lighting, "
        f"composition, texture. 2-3 sentences max. No preamble."
    )
    expanded = _llm(llm_prompt, model).strip()

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    memrefs = state.get("dag_memrefs", [])[:3]

    rec = arc.build_record(
        "action", secret,
        f"Prompt expansion ({style_cfg['name']}): {prompt[:80]}",
        prev=prev, memrefs=memrefs, alias=state["agent_alias"],
        ihash=arc.sha256hex(llm_prompt.encode()),
        ohash=arc.sha256hex(expanded.encode()),
    )
    if not arc.verify_sig(rec):
        return {"error": "Expand signature failed"}
    stored = arc.store(db, rec)

    return {
        "expanded_prompt": expanded,
        "record_ids": state["record_ids"] + [stored],
    }


def render_node(state: DesignState) -> dict:
    """Render the image (Flux if configured, else deterministic SVG)."""
    style = state["style"]
    expanded = state.get("expanded_prompt") or state["prompt"]
    width = state["width"]
    height = state["height"]

    png = _flux_render(expanded, width, height)
    if png:
        svg_or_img = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {width} {height}" '
            f'width="{width}" height="{height}">'
            f'<image href="data:image/png;base64,{base64.b64encode(png).decode()}" '
            f'width="{width}" height="{height}" />'
            f'</svg>'
        )
    else:
        svg_or_img = _svg_render(expanded, style, width, height)

    cid = _ipfs_cid(svg_or_img.encode())
    image_uri = f"ipfs://{cid}"

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]
    memrefs = state.get("dag_memrefs", [])[3:7]

    rec = arc.build_record(
        "action", secret,
        f"Generative design render ({state['style_name']}, "
        f"{state['aspect_ratio']}): cid={cid[:24]}...",
        prev=prev, memrefs=memrefs, alias=state["agent_alias"],
        ihash=arc.sha256hex(expanded.encode()),
        ohash=arc.sha256hex(svg_or_img.encode()),
    )
    if not arc.verify_sig(rec):
        return {"error": "Render signature failed"}
    stored = arc.store(db, rec)

    return {
        "svg": svg_or_img,
        "image_cid": cid,
        "image_uri": image_uri,
        "record_ids": state["record_ids"] + [stored],
    }


def caption_node(state: DesignState) -> dict:
    """Produce a 1-sentence gallery caption for the rendered artifact."""
    model = state.get("model", "llama3.2")
    llm_prompt = (
        f"Write a 1-sentence gallery caption (under 140 chars) for this "
        f"ARC-anchored generative image. The caption will be inscribed "
        f"immutably on Bitcoin.\n\n"
        f"Prompt: {state.get('expanded_prompt') or state['prompt']}\n"
        f"Style: {state['style_name']}\n"
        f"Aspect: {state.get('aspect_ratio', '1:1')}\n"
        f"IPFS CID: {state.get('image_cid', '')}"
    )
    caption = _llm(llm_prompt, model).strip().split("\n")[0][:240]

    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    rec = arc.build_record(
        "action", secret,
        f"Design caption: {caption[:80]}",
        prev=prev, memrefs=[], alias=state["agent_alias"],
        ihash=arc.sha256hex(llm_prompt.encode()),
        ohash=arc.sha256hex(caption.encode()),
    )
    if not arc.verify_sig(rec):
        return {"error": "Caption signature failed"}
    stored = arc.store(db, rec)

    return {
        "caption": caption,
        "record_ids": state["record_ids"] + [stored],
    }


def inscribe_node(state: DesignState) -> dict:
    """Final inscription — bind the full cross-agent DAG + emit ord cmd."""
    db = arc.get_db()
    secret = arc.load_key()
    prev = state["record_ids"][-1]

    all_refs = state.get("dag_memrefs", [])
    seen: set[str] = set()
    final_refs = [r for r in all_refs if not (r in seen or seen.add(r))][:12]

    final_action = (
        f"Generative design finalized ({state['style_name']}, "
        f"{state.get('aspect_ratio', '1:1')}): {state['prompt'][:80]} "
        f"— ipfs://{state.get('image_cid', '')[:22]}..."
    )
    final_rec = arc.build_record(
        "action", secret, final_action,
        prev=prev, memrefs=final_refs, alias=state["agent_alias"],
        ihash=arc.sha256hex(state["prompt"].encode()),
        ohash=arc.sha256hex(
            (state.get("svg", "") + state.get("caption", "")).encode()
        ),
    )
    if not arc.verify_sig(final_rec):
        return {"error": "Final signature failed"}
    final_id = arc.store(db, final_rec)

    cmd = arc.inscription_envelope(final_rec)

    record_ids = state["record_ids"] + [final_id]
    chain: list[dict] = []
    for rid in record_ids:
        rec = arc.fetch(db, rid)
        if rec:
            chain.append({"id": rid, "record": rec})

    return {
        "final_id": final_id,
        "inscription_cmd": cmd,
        "record_ids": record_ids,
        "chain": chain,
    }


# ── Build graph ──────────────────────────────────────────────────────────────


def build_design_graph():
    g = StateGraph(DesignState)
    g.add_node("init", init_agent)
    g.add_node("expand", expand_node)
    g.add_node("render", render_node)
    g.add_node("caption", caption_node)
    g.add_node("inscribe", inscribe_node)
    g.set_entry_point("init")
    g.add_edge("init", "expand")
    g.add_edge("expand", "render")
    g.add_edge("render", "caption")
    g.add_edge("caption", "inscribe")
    g.add_edge("inscribe", END)
    return g.compile()


design_agent = build_design_graph()


# ── Public API ────────────────────────────────────────────────────────────────


def list_styles() -> list[dict]:
    return [
        {
            "key": k,
            "name": v["name"],
            "prompt_prefix": v["prompt_prefix"],
            "palette": v["palette"],
        }
        for k, v in STYLES.items()
    ]


def list_aspect_ratios() -> list[dict]:
    return [
        {"key": k, "width": w, "height": h}
        for k, (w, h) in ASPECT_RATIOS.items()
    ]


def run_design(
    prompt: str,
    style: str = "abstract",
    aspect_ratio: str = "1:1",
    model: str = "llama3.2",
) -> dict:
    """Run the full design-agent pipeline. Returns artifact + ARC chain."""
    result = design_agent.invoke({
        "prompt": prompt,
        "style": style,
        "style_name": "",
        "aspect_ratio": aspect_ratio,
        "model": model,
        "expanded_prompt": "",
        "caption": "",
        "svg": "",
        "image_cid": "",
        "image_uri": "",
        "width": 0,
        "height": 0,
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
        "style": style,
        "style_name": result.get("style_name", ""),
        "aspect_ratio": aspect_ratio,
        "width": result.get("width", 0),
        "height": result.get("height", 0),
        "expanded_prompt": result.get("expanded_prompt", ""),
        "caption": result.get("caption", ""),
        "svg": result.get("svg", ""),
        "image_cid": result.get("image_cid", ""),
        "image_uri": result.get("image_uri", ""),
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

    prompt = " ".join(a for a in sys.argv[1:] if not a.startswith("--")) or (
        "A luminous Bitcoin ordinal inscription floating above a Lightning "
        "network mesh, under a synthwave sunset."
    )
    style = "cyberpunk"
    aspect = "16:9"
    model = "llama3.2"
    for i, arg in enumerate(sys.argv):
        if arg == "--style" and i + 1 < len(sys.argv):
            style = sys.argv[i + 1]
        if arg == "--aspect" and i + 1 < len(sys.argv):
            aspect = sys.argv[i + 1]
        if arg == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    BOLD = "\033[1m"
    DIM = "\033[2m"
    PINK = "\033[38;2;236;72;153m"
    CYAN = "\033[38;2;0;240;255m"
    ORANGE = "\033[38;2;247;147;26m"
    GREEN = "\033[38;2;34;197;94m"
    RESET = "\033[0m"

    print(f"\n  {BOLD}{'=' * 58}{RESET}")
    print(f"  {BOLD}  ARC Protocol — Design & Images Agent{RESET}")
    print(f"  {BOLD}  LangGraph + Flux/Ollama + Bitcoin Inscriptions{RESET}")
    print(f"  {BOLD}{'=' * 58}{RESET}\n")
    print(f"  {PINK}*{RESET} Style:    {style}")
    print(f"  {PINK}*{RESET} Aspect:   {aspect}")
    print(f"  {PINK}*{RESET} Model:    {model}")
    print(f"  {PINK}*{RESET} Prompt:   {prompt[:80]}\n")

    r = run_design(prompt, style, aspect, model)

    print(f"  {BOLD}Results:{RESET}")
    print(f"  {ORANGE}*{RESET} Caption:      {r['caption'][:80]}")
    print(f"  {ORANGE}*{RESET} IPFS CID:     {r['image_cid']}")
    print(f"  {ORANGE}*{RESET} Records:      {len(r['record_ids'])}")
    print(f"  {ORANGE}*{RESET} DAG memrefs:  {len(r['dag_memrefs'])}")
    print(f"  {GREEN}*{RESET} Agent pubkey: {r['agent_pubkey'][:24]}...")

    print(f"\n  {BOLD}Chain:{RESET}")
    for item in r["chain"]:
        rec = item["record"]
        print(f"    [{rec['type']:10}] {item['id'][:16]}... | {rec['action'][:48]}")

    print(f"\n  {DIM}Inscription:{RESET}")
    print(f"  $ {r['inscription_cmd'][:100]}...")
    print(f"\n  {CYAN}Image URI:{RESET} {r['image_uri']}\n")
