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
