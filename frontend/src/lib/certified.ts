// ARC Certified Agents — canonical list. Mirrors dashboard-client.tsx.
// Used by /bounties, /market, /badge, /faucet for alias gating and auto-spawn.

export type CertifiedAgent = {
  id: string;
  alias: string; // canonical on-chain alias
  name: string;
  href: string;
  color: string;
  kind: string; // orchestrator "kind" key for live-spawn
  desc: string;
};

export const CERTIFIED: CertifiedAgent[] = [
  { id: "research",     alias: "arc-deep-research", name: "Deep Research",    href: "/research",     color: "#A855F7", kind: "research",   desc: "LangGraph plan → research → analyze → synthesize → inscribe" },
  { id: "codegen",      alias: "arc-codegen",       name: "Code Generator",   href: "/codegen",      color: "#00F0FF", kind: "codegen",    desc: "Multi-language generation with plan + review" },
  { id: "trader",       alias: "arc-defi-trader",   name: "DeFi Trader",      href: "/trader",       color: "#22c55e", kind: "trader",     desc: "Market analysis, signals, Lightning settlement" },
  { id: "legal",        alias: "arc-legal",         name: "Legal Contracts",  href: "/legal",        color: "#EAB308", kind: "legal",      desc: "NDA / Service / License drafting + compliance" },
  { id: "design",       alias: "arc-design",        name: "Design & Images",  href: "/design",       color: "#EC4899", kind: "design",     desc: "Generative design — Flux/Ollama, IPFS, full DAG anchor" },
  { id: "support",      alias: "arc-support",       name: "Customer Support", href: "/support",      color: "#38BDF8", kind: "support",    desc: "Triage → diagnose → resolve, cross-agent memref" },
  { id: "compliance",   alias: "arc-compliance",    name: "Compliance & Audit", href: "/compliance", color: "#10B981", kind: "compliance", desc: "Regulatory / Safety / Provenance — full-mesh attestation" },
  { id: "data",         alias: "arc-data",          name: "Data Analysis",    href: "/data",         color: "#6366F1", kind: "data",       desc: "Trends / Correlations / Anomaly — analytics anchor" },
  { id: "orchestrator", alias: "arc-orchestrator",  name: "Orchestrator",     href: "/orchestrator", color: "#F97316", kind: "orchestrator", desc: "Meta-agent — spawns children with full-DAG memref" },
  { id: "content",      alias: "arc-content",       name: "Content Creator",  href: "/content",      color: "#F43F5E", kind: "content",    desc: "Article / Thread / Script / Newsletter anchored" },
];

export const CERTIFIED_ALIAS_SET = new Set(CERTIFIED.map((c) => c.alias));

export function isCertifiedAlias(alias: string | undefined | null): boolean {
  if (!alias) return false;
  const a = alias.toLowerCase().trim();
  if (CERTIFIED_ALIAS_SET.has(a)) return true;
  if (a.startsWith("arc-child-")) return true;
  if (/^arc-(research|codegen|trader|legal|design|support|compliance|data|content|orchestrator)-child/.test(a)) return true;
  return false;
}

export function findCertifiedByAlias(alias: string | undefined | null): CertifiedAgent | null {
  if (!alias) return null;
  const a = alias.toLowerCase().trim();
  return CERTIFIED.find((c) => c.alias === a) || null;
}
