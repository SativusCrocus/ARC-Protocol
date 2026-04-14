import { Dashboard } from "./dashboard-client";
import type { RecordWithId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function Page() {
  const initialRecords = await fetchInitialRecords();
  return <Dashboard initialRecords={initialRecords} />;
}
