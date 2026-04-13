import type {
  KeyInfo,
  KeygenResult,
  CreateResult,
  ValidationResult,
  SettleResult,
  RecordWithId,
  InscriptionResult,
  MarketplaceItem,
  GenerateResult,
  ContentResult,
  ARCRecord,
  ServiceJob,
  DemoResult,
  DisputeData,
  ResearchResult,
  ResearchChainResult,
  CodegenResult,
  CodegenChainResult,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "/api/arc";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; arc_version: string }>("/health"),

  keygen: (alias?: string) =>
    request<KeygenResult>("/keygen", {
      method: "POST",
      body: JSON.stringify({ alias }),
    }),

  keys: () => request<KeyInfo[]>("/keys"),

  genesis: (data: { alias?: string; action: string; input_data?: string }) =>
    request<CreateResult>("/genesis", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  action: (data: {
    prev: string;
    action: string;
    memrefs?: string[];
    prompt?: string;
  }) =>
    request<CreateResult>("/action", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  validate: (id: string) => request<ValidationResult>(`/validate/${id}`),

  settle: (data: { record_id: string; amount: number }) =>
    request<SettleResult>("/settle", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  record: (id: string) => request<RecordWithId>(`/record/${id}`),

  chain: (id: string) => request<RecordWithId[]>(`/chain/${id}`),

  records: () => request<RecordWithId[]>("/records"),

  inscription: (id: string) =>
    request<InscriptionResult>(`/inscription/${id}`),

  // ── Marketplace ──────────────────────────────────────────────────────
  generate: (data: {
    prompt: string;
    content_type: string;
    price_sats: number;
    model?: string;
  }) =>
    request<GenerateResult>("/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  content: (id: string) => request<ContentResult>(`/content/${id}`),

  marketplace: () => request<MarketplaceItem[]>("/marketplace"),

  // ── Service Marketplace ───────────────────────────────────────────────

  serviceJobs: () => request<ServiceJob[]>("/marketplace/jobs"),

  serviceJob: (id: string) => request<ServiceJob>(`/marketplace/job/${id}`),

  serviceDispute: (id: string) =>
    request<DisputeData>(`/marketplace/dispute/${id}`),

  serviceDemo: () =>
    request<DemoResult>("/marketplace/demo", { method: "POST" }),

  serviceRequest: (data: { task: string; max_sats: number }) =>
    request<{ job_id: string; request_id: string; record: ARCRecord; status: string }>(
      "/marketplace/request",
      { method: "POST", body: JSON.stringify(data) },
    ),

  serviceOffer: (data: { job_id: string; price_sats: number }) =>
    request<{ job_id: string; offer_id: string; record: ARCRecord; status: string }>(
      "/marketplace/offer",
      { method: "POST", body: JSON.stringify(data) },
    ),

  serviceAccept: (data: { job_id: string }) =>
    request<{ job_id: string; accept_id: string; record: ARCRecord; status: string }>(
      "/marketplace/accept",
      { method: "POST", body: JSON.stringify(data) },
    ),

  serviceDeliver: (data: { job_id: string; result: string }) =>
    request<{ job_id: string; deliver_id: string; record: ARCRecord; status: string }>(
      "/marketplace/deliver",
      { method: "POST", body: JSON.stringify(data) },
    ),

  servicePay: (data: { job_id: string }) =>
    request<{ job_id: string; payment_id: string; payment_hash: string; preimage: string }>(
      "/marketplace/pay",
      { method: "POST", body: JSON.stringify(data) },
    ),

  serviceReceipt: (data: { job_id: string }) =>
    request<{ job_id: string; receipt_id: string; record: ARCRecord; status: string }>(
      "/marketplace/receipt",
      { method: "POST", body: JSON.stringify(data) },
    ),

  // ── Research Agent ──────────────────────────────────────────────────────
  research: (data: { query: string; model?: string }) =>
    request<ResearchResult>("/research", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  researchChain: (id: string) =>
    request<ResearchChainResult>(`/research/chain/${id}`),

  // ── Code Generator ──────────────────────────────────────────────────────
  codegen: (data: { prompt: string; language?: string; model?: string }) =>
    request<CodegenResult>("/codegen", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  codegenChain: (id: string) =>
    request<CodegenChainResult>(`/codegen/chain/${id}`),
};
