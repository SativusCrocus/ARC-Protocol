export interface Agent {
  pubkey: string;
  alias?: string;
}

export interface Settlement {
  type: "lightning";
  amount_sats: number;
  payment_hash: string;
  preimage?: string;
}

export interface ARCRecord {
  arc: string;
  type: "genesis" | "action" | "settlement";
  agent: Agent;
  prev: string | null;
  memrefs: string[];
  ts: string;
  ihash: string;
  ohash: string;
  action: string;
  settlement?: Settlement;
  sig: string;
}

export interface RecordWithId {
  id: string;
  record: ARCRecord;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  id: string;
}

export interface KeyInfo {
  name: string;
  pubkey: string;
}

export interface KeygenResult {
  pubkey: string;
  alias: string;
  secret: string;
}

export interface CreateResult {
  id: string;
  record: ARCRecord;
}

export interface SettleResult {
  id: string;
  record: ARCRecord;
  payment_hash: string;
  preimage: string;
}

export interface InscriptionResult {
  command: string;
  record: ARCRecord;
}

export interface MarketplaceItem {
  id: string;
  record: ARCRecord;
  prompt: string;
  output: string;
  content_type: string;
  price_sats: number;
  created_at: string;
  valid: boolean;
}

export interface GenerateResult {
  id: string;
  record: ARCRecord;
  content: string;
  prompt: string;
  content_type: string;
  price_sats: number;
  genesis?: { id: string; record: ARCRecord } | null;
}

export interface ContentResult {
  id: string;
  record: ARCRecord;
  prompt: string;
  output: string;
  content_type: string;
  price_sats: number;
  created_at: string;
  settled: boolean;
  settlement_id?: string | null;
}

// ── Service Marketplace Types ─────────────────────────────────────────────

export interface ServiceJob {
  id: string;
  status: "requested" | "offered" | "accepted" | "delivered" | "paid" | "completed";
  customer_pubkey: string;
  service_pubkey: string | null;
  task: string;
  amount_sats: number;
  request_id: string | null;
  offer_id: string | null;
  accept_id: string | null;
  deliver_id: string | null;
  payment_id: string | null;
  receipt_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemoStep {
  step: number;
  agent: "customer" | "service";
  action: string;
  job_id: string;
  record: ARCRecord;
  status: string;
  payment_hash?: string;
  preimage?: string;
  [key: string]: unknown;
}

export interface DemoResult {
  job_id: string;
  steps: DemoStep[];
  status: string;
}

export interface DisputeEdge {
  source: string;
  target: string;
  type: "prev" | "memref";
}

export interface DisputeData {
  job: ServiceJob;
  records: Record<string, ARCRecord>;
  edges: DisputeEdge[];
  validations: Record<string, { valid: boolean; errors: string[] }>;
  deep_validation: { valid: boolean; errors: string[] };
  record_count: number;
}

// ── Research Agent Types ─────────────────────────────────────────────────────

export interface ResearchResult {
  query: string;
  plan: string;
  research: string;
  analysis: string;
  synthesis: string;
  record_ids: string[];
  dag_memrefs: string[];
  final_id: string;
  inscription_cmd: string;
  chain: RecordWithId[];
  agent_pubkey: string;
}

export interface ResearchChainResult {
  chain: RecordWithId[];
  memref_records: RecordWithId[];
}

// ── Code Generator Types ─────────────────────────────────────────────────────

export interface CodegenResult {
  prompt: string;
  language: string;
  plan: string;
  code: string;
  review: string;
  record_ids: string[];
  dag_memrefs: string[];
  final_id: string;
  inscription_cmd: string;
  chain: RecordWithId[];
  agent_pubkey: string;
}

export interface CodegenChainResult {
  chain: RecordWithId[];
  memref_records: RecordWithId[];
}

// ── DeFi Trader Types ───────────────────────────────────────────────────────

export interface TraderResult {
  market_prompt: string;
  pair: string;
  timeframe: string;
  max_risk_pct: number;
  max_position_sats: number;
  signal_fee_sats: number;
  scan: string;
  analysis: string;
  signal: string;
  risk_assessment: string;
  execution_plan: string;
  settlement_id: string;
  settlement_hash: string;
  settlement_preimage: string;
  record_ids: string[];
  dag_memrefs: string[];
  final_id: string;
  inscription_cmd: string;
  chain: RecordWithId[];
  agent_pubkey: string;
}

export interface TraderChainResult {
  chain: RecordWithId[];
  memref_records: RecordWithId[];
}

// ── Legal Contracts Agent Types ─────────────────────────────────────────────

export interface LegalTemplate {
  key: string;
  name: string;
  preamble: string;
  clauses: string[];
}

export interface LegalResult {
  prompt: string;
  template: string;
  template_name: string;
  parties: string;
  jurisdiction: string;
  draft: string;
  clauses: string;
  compliance: string;
  record_ids: string[];
  dag_memrefs: string[];
  final_id: string;
  inscription_cmd: string;
  chain: RecordWithId[];
  agent_pubkey: string;
  dispute_link: string;
}

export interface LegalChainResult {
  chain: RecordWithId[];
  memref_records: RecordWithId[];
}

export interface LegalVerifyResult {
  id: string;
  valid: boolean;
  signature_valid: boolean;
  errors: string[];
  memref_count: number;
  action: string;
  alias: string;
  inscription_cmd: string;
}

// ── Design & Images Agent Types ─────────────────────────────────────────────

export interface DesignStyle {
  key: string;
  name: string;
  prompt_prefix: string;
  palette: string[];
}

export interface DesignAspectRatio {
  key: string;
  width: number;
  height: number;
}

export interface DesignResult {
  prompt: string;
  style: string;
  style_name: string;
  aspect_ratio: string;
  width: number;
  height: number;
  expanded_prompt: string;
  caption: string;
  svg: string;
  image_cid: string;
  image_uri: string;
  record_ids: string[];
  dag_memrefs: string[];
  final_id: string;
  inscription_cmd: string;
  chain: RecordWithId[];
  agent_pubkey: string;
}

export interface DesignChainResult {
  chain: RecordWithId[];
  memref_records: RecordWithId[];
}

export interface DesignVerifyResult {
  id: string;
  valid: boolean;
  signature_valid: boolean;
  errors: string[];
  memref_count: number;
  action: string;
  alias: string;
  inscription_cmd: string;
}
