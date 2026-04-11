import type {
  KeyInfo,
  KeygenResult,
  CreateResult,
  ValidationResult,
  SettleResult,
  RecordWithId,
  InscriptionResult,
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
};
