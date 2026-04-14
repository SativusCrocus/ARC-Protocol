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
  TraderResult,
  TraderChainResult,
  LegalResult,
  LegalChainResult,
  LegalTemplate,
  LegalVerifyResult,
  DesignResult,
  DesignChainResult,
  DesignVerifyResult,
  DesignStyle,
  DesignAspectRatio,
  SupportResult,
  SupportChainResult,
  SupportVerifyResult,
  SupportIssueType,
  ComplianceResult,
  ComplianceChainResult,
  ComplianceVerifyResult,
  ComplianceType,
  DataResult,
  DataChainResult,
  DataVerifyResult,
  DataAnalysisType,
  ContentCreatorResult,
  ContentCreatorChainResult,
  ContentCreatorVerifyResult,
  ContentFormatSpec,
  OrchestratorChildAgent,
  OrchestratorPreviewResult,
  OrchestratorResult,
  OrchestratorChainResult,
  OrchestratorVerifyResult,
  LiveSpawnResult,
  ScheduleStatus,
  ScheduleTickResult,
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

  // ── DeFi Trader ──────────────────────────────────────────────────────
  trader: (data: {
    market_prompt: string;
    pair?: string;
    timeframe?: string;
    max_risk_pct?: number;
    max_position_sats?: number;
    signal_fee_sats?: number;
    model?: string;
  }) =>
    request<TraderResult>("/trader", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  traderChain: (id: string) =>
    request<TraderChainResult>(`/trader/chain/${id}`),

  // ── Legal Contracts ──────────────────────────────────────────────────────
  legalTemplates: () =>
    request<{ templates: LegalTemplate[] }>("/legal/templates"),

  legal: (data: {
    prompt: string;
    template?: string;
    parties?: string;
    jurisdiction?: string;
    model?: string;
  }) =>
    request<LegalResult>("/legal", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  legalChain: (id: string) =>
    request<LegalChainResult>(`/legal/chain/${id}`),

  legalVerify: (id: string) =>
    request<LegalVerifyResult>(`/legal/verify/${id}`),

  // ── Design & Images ──────────────────────────────────────────────────────
  designStyles: () =>
    request<{ styles: DesignStyle[]; aspect_ratios: DesignAspectRatio[] }>(
      "/design/styles",
    ),

  design: (data: {
    prompt: string;
    style?: string;
    aspect_ratio?: string;
    model?: string;
  }) =>
    request<DesignResult>("/design", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  designChain: (id: string) =>
    request<DesignChainResult>(`/design/chain/${id}`),

  designVerify: (id: string) =>
    request<DesignVerifyResult>(`/design/verify/${id}`),

  // ── Customer Support ────────────────────────────────────────────────────
  supportIssues: () =>
    request<{ issues: SupportIssueType[] }>("/support/issues"),

  support: (data: {
    prompt: string;
    issue_type?: string;
    customer?: string;
    priority?: string;
    model?: string;
  }) =>
    request<SupportResult>("/support", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  supportChain: (id: string) =>
    request<SupportChainResult>(`/support/chain/${id}`),

  supportVerify: (id: string) =>
    request<SupportVerifyResult>(`/support/verify/${id}`),

  // ── Compliance & Audit ──────────────────────────────────────────────────
  complianceTypes: () =>
    request<{ types: ComplianceType[] }>("/compliance/types"),

  compliance: (data: {
    prompt: string;
    compliance_type?: string;
    subject?: string;
    severity?: string;
    model?: string;
  }) =>
    request<ComplianceResult>("/compliance", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  complianceChain: (id: string) =>
    request<ComplianceChainResult>(`/compliance/chain/${id}`),

  complianceVerify: (id: string) =>
    request<ComplianceVerifyResult>(`/compliance/verify/${id}`),

  // ── Data Analysis ───────────────────────────────────────────────────────
  dataTypes: () =>
    request<{ types: DataAnalysisType[] }>("/data/types"),

  data: (data: {
    prompt: string;
    analysis_type?: string;
    dataset?: string;
    rows_hint?: number;
    model?: string;
  }) =>
    request<DataResult>("/data", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  dataChain: (id: string) =>
    request<DataChainResult>(`/data/chain/${id}`),

  dataVerify: (id: string) =>
    request<DataVerifyResult>(`/data/verify/${id}`),

  // ── Content Creator Agent ──────────────────────────────────────────────
  contentFormats: () =>
    request<{ formats: ContentFormatSpec[] }>("/content-agent/formats"),

  contentCreate: (data: {
    prompt: string;
    content_format?: string;
    audience?: string;
    price_sats?: number;
    model?: string;
  }) =>
    request<ContentCreatorResult>("/content-agent", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  contentChain: (id: string) =>
    request<ContentCreatorChainResult>(`/content-agent/chain/${id}`),

  contentVerify: (id: string) =>
    request<ContentCreatorVerifyResult>(`/content-agent/verify/${id}`),

  // ── Orchestrator / Meta-Agent ──────────────────────────────────────────
  orchestratorChildren: () =>
    request<{ children: OrchestratorChildAgent[] }>("/orchestrator/children"),

  orchestratorPreview: (data: { prompt: string; children: string[] }) =>
    request<OrchestratorPreviewResult>("/orchestrator/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  orchestrator: (data: {
    prompt: string;
    children: string[];
    model?: string;
  }) =>
    request<OrchestratorResult>("/orchestrator", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  orchestratorChain: (id: string) =>
    request<OrchestratorChainResult>(`/orchestrator/chain/${id}`),

  orchestratorVerify: (id: string) =>
    request<OrchestratorVerifyResult>(`/orchestrator/verify/${id}`),

  orchestratorChildrenExtra: () =>
    request<{ children: OrchestratorChildAgent[] }>(
      "/orchestrator/children/extra",
    ),

  orchestratorLiveSpawn: (data: { kinds: string[]; trigger?: string }) =>
    request<LiveSpawnResult>("/orchestrator/live-spawn", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  orchestratorSchedule: () =>
    request<ScheduleStatus>("/orchestrator/schedule"),

  orchestratorScheduleTick: (force = true) =>
    request<ScheduleTickResult>(
      `/orchestrator/schedule/tick?force=${force ? "true" : "false"}`,
      { method: "POST", body: JSON.stringify({}) },
    ),
};
