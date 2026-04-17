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
  MemoryType,
  MemoryRecord,
  MemorySearchResult,
  MemoryLatestResult,
  MemoryTimelineResult,
  MemoryStats,
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

  // ── Memory Layer ───────────────────────────────────────────────────
  memoryStore: (data: {
    memory_key: string;
    memory_value: string;
    memory_type?: MemoryType;
    ttl?: number | null;
    supersedes?: string | null;
    alias?: string;
  }) =>
    request<{ id: string; record: MemoryRecord["record"] }>("/memory", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  memorySearch: (q: string = "", agent?: string, limit = 100) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (agent) params.set("agent", agent);
    params.set("limit", String(limit));
    return request<MemorySearchResult>(`/memory/search?${params.toString()}`);
  },

  memoryLatest: (key: string) =>
    request<MemoryLatestResult>(`/memory/latest/${encodeURIComponent(key)}`),

  memoryTimeline: (key: string) =>
    request<MemoryTimelineResult>(`/memory/timeline/${encodeURIComponent(key)}`),

  memoryAgent: (pubkey: string) =>
    request<{ agent: string; results: MemoryRecord[] }>(
      `/memory/agent/${pubkey}`,
    ),

  memoryStats: () => request<MemoryStats>("/memory/stats"),

  memoryDelete: (id: string) =>
    request<{ id: string; record: MemoryRecord["record"]; tombstoned: string }>(
      `/memory/${id}`,
      { method: "DELETE" },
    ),
};

// ── Goose-powered orchestrator runtime (separate service) ───────────
// Talks to /orchestrator service (default :8100). Every dispatch here
// spawns a real (or dry-run) Goose session; records appear on the ARC
// backend via the MCP server, not synthesised by a cron.

export const GOOSE_ORCH_BASE =
  process.env.NEXT_PUBLIC_GOOSE_ORCH_URL || "http://localhost:8100";

export type GooseAgent = {
  agent_name: string;
  display_name: string;
  role: string;
  color: string;
  trigger: "on_demand" | "scheduled" | "webhook";
  schedule: string | null;
  webhook_path: string | null;
  provider: string;
  mcp_servers: string[];
  tools: string[];
  is_meta: boolean;
  child_agents: string[];
  pubkey: string | null;
};

export type GooseDispatchResult = {
  agent: string;
  task: string;
  ok: boolean;
  started_at: number;
  finished_at: number;
  dry_run: boolean;
  goose: Record<string, unknown>;
  extracted_record_ids: string[];
  new_head: string | null;
  error: string | null;
};

export type GooseActivityEvent = {
  kind: string;
  ts: number;
  agent: string | null;
  payload: Record<string, unknown>;
};

async function gooseRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${GOOSE_ORCH_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const gooseApi = {
  health: () =>
    gooseRequest<{
      ok: boolean;
      agents: number;
      goose_available: boolean;
      dry_run: boolean;
      arc_api_url: string;
    }>("/health"),

  agents: () => gooseRequest<GooseAgent[]>("/orchestrator/agents"),

  dispatch: (task: string, agent?: string) =>
    gooseRequest<GooseDispatchResult>("/orchestrator/dispatch", {
      method: "POST",
      body: JSON.stringify(agent ? { task, agent } : { task }),
    }),

  trigger: (agentName: string, task: string) =>
    gooseRequest<GooseDispatchResult>(
      `/orchestrator/agent/${encodeURIComponent(agentName)}/trigger`,
      { method: "POST", body: JSON.stringify({ task }) },
    ),

  activity: (limit = 50) =>
    gooseRequest<GooseActivityEvent[]>(
      `/orchestrator/activity?limit=${limit}`,
    ),

  streamURL: () =>
    GOOSE_ORCH_BASE.replace(/^http/, "ws") + "/orchestrator/stream",

  // ── Recipes ───────────────────────────────────────────────────────
  recipes: () => gooseRequest<RecipeSummary[]>("/recipes"),

  recipe: (name: string) =>
    gooseRequest<RecipeSummary>(`/recipe/${encodeURIComponent(name)}`),

  runRecipe: (recipe: string, params: Record<string, unknown>) =>
    gooseRequest<{ run_id: string; status: string; recipe: string }>(
      "/recipe/run",
      { method: "POST", body: JSON.stringify({ recipe, params }) },
    ),

  recipeRun: (id: string) =>
    gooseRequest<RecipeRunStatus>(`/recipe/run/${id}`),

  recipeReport: (id: string) =>
    gooseRequest<RecipeReport>(`/recipe/run/${id}/report`),

  recipeRuns: (limit = 25) =>
    gooseRequest<RecipeRunStatus[]>(`/recipe/runs?limit=${limit}`),
};

export type RecipeParameter = {
  name: string;
  description?: string;
  required?: boolean;
  default?: unknown;
};

export type RecipeSummary = {
  name: string;
  description: string;
  parameters: RecipeParameter[];
  arc: {
    enabled: boolean;
    agent: string | null;
    settle_on_complete: boolean;
    settlement_amount_sats: number;
    memref_strategy: "full_chain" | "previous_only" | "none";
    inscription: boolean;
  };
  steps: { name: string; action_label: string; memrefs: string[] }[];
};

export type RecipeStepExecution = {
  name: string;
  action_label: string;
  prompt: string;
  ihash: string;
  ohash: string | null;
  output: string;
  record_id: string | null;
  prev: string | null;
  memrefs: string[];
  started_at: number;
  finished_at: number;
  status: "pending" | "running" | "ok" | "skipped" | "failed";
  error: string | null;
  cached: boolean;
};

export type RecipeRunStatus = {
  id: string;
  recipe: string;
  agent: string | null;
  params: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  steps: RecipeStepExecution[];
  chain_head_before: string | null;
  chain_head_after: string | null;
  settlement_id: string | null;
  settlement_sats: number | null;
  settlement_preimage: string | null;
  inscription_cmd: string | null;
  started_at: number;
  finished_at: number | null;
  error: string | null;
  dry_run: boolean;
};

export type RecipeReportStep = {
  index: number;
  name: string;
  action_label: string;
  status: string;
  cached: boolean;
  record_id: string | null;
  prev: string | null;
  ihash: string;
  ohash: string | null;
  memref_count: number;
  memrefs: string[];
  duration_seconds: number | null;
  error: string | null;
  explorer_url: string | null;
};

export type RecipeReport = {
  run_id: string;
  recipe: string;
  agent: string | null;
  params: Record<string, unknown>;
  status: string;
  dry_run: boolean;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  chain_head_before: string | null;
  chain_head_after: string | null;
  steps: RecipeReportStep[];
  settlement: {
    settled: boolean;
    record_id: string | null;
    amount_sats: number | null;
    preimage: string | null;
  };
  inscription_cmd: string | null;
  validation: { verified: boolean; failed_steps: string[] };
  explorer_url: string | null;
  error: string | null;
  recipe_description?: string;
  memref_strategy?: string;
  dag_ascii: string;
  summary_text: string;
};
