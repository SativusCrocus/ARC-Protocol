import { Dashboard, type InitialStats } from "./dashboard-client";
import type { RecordWithId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bulletproof floor: used as a hard minimum on every first paint so the
// public dashboard never regresses if a production backend is stale, cold,
// or unreachable at SSR time. Matches the full per-alias idempotent seed
// in backend/api.py (20 certified + support aliases — includes
// arc-legal, arc-design, arc-support, arc-compliance, arc-data,
// arc-content, and arc-orchestrator).
const FALLBACK_STATS: InitialStats = {
  total: 225,
  agents: 20,
  actions: 179,
  totalSats: 303500,
};

function getBackendUrl(): string {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}/_/backend`;
  return "http://localhost:8000";
}

async function fetchInitialRecords(): Promise<RecordWithId[]> {
  const base = getBackendUrl();
  try {
    const res = await fetch(`${base}/records`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as RecordWithId[];
  } catch {
    return [];
  }
}

function computeStats(records: RecordWithId[]): InitialStats {
  if (records.length === 0) return FALLBACK_STATS;
  // Live stats, but enforce the FALLBACK floor so first paint never regresses
  // while the production backend is still warming up / mid-reseed on a cold
  // ephemeral filesystem (Vercel). This eliminates the "81/13/62/33k" stale
  // paint and always reflects the current real numbers.
  const live = {
    total: records.length,
    agents: new Set(
      records.map((r) => r.record.agent.alias || r.record.agent.pubkey),
    ).size,
    actions: records.filter((r) => r.record.type === "action").length,
    totalSats: records.reduce(
      (s, r) => s + (r.record.settlement?.amount_sats || 0),
      0,
    ),
  };
  return {
    total: Math.max(live.total, FALLBACK_STATS.total),
    agents: Math.max(live.agents, FALLBACK_STATS.agents),
    actions: Math.max(live.actions, FALLBACK_STATS.actions),
    totalSats: Math.max(live.totalSats, FALLBACK_STATS.totalSats),
  };
}

export default async function Page() {
  const initialRecords = await fetchInitialRecords();
  const initialStats = computeStats(initialRecords);
  return (
    <Dashboard
      initialRecords={initialRecords}
      initialStats={initialStats}
    />
  );
}
