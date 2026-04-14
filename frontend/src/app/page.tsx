import { Dashboard, type InitialStats } from "./dashboard-client";
import type { RecordWithId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Bulletproof floor: used if backend is unreachable at SSR time.
// Matches the per-alias idempotent seed in backend/api.py.
const FALLBACK_STATS: InitialStats = {
  total: 81,
  agents: 13,
  actions: 62,
  totalSats: 33000,
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
  return {
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
