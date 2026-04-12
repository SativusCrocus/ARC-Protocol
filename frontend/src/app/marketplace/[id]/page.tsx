"use client";

import { use, useMemo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Shield,
  Zap,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Users,
  FileText,
} from "lucide-react";
import type { DisputeData, ARCRecord } from "@/lib/types";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  requested: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  offered: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  accepted: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  delivered: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  paid: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

const AGENT_COLORS: Record<string, string> = {
  customer: "#00F0FF",
  service: "#F7931A",
};

const STEP_ORDER = [
  { key: "request_id", label: "REQUEST", agent: "Customer", step: 1 },
  { key: "offer_id", label: "OFFER", agent: "Service", step: 2 },
  { key: "accept_id", label: "ACCEPT", agent: "Customer", step: 3 },
  { key: "deliver_id", label: "DELIVER", agent: "Service", step: 4 },
  { key: "payment_id", label: "PAYMENT", agent: "Customer", step: 5 },
  { key: "receipt_id", label: "RECEIPT", agent: "Service", step: 6 },
] as const;

export default function DisputeResolutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, isLoading, error } = useQuery<DisputeData>({
    queryKey: ["dispute", id],
    queryFn: () => api.serviceDispute(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg skeleton-shimmer" />
        <div className="h-64 rounded-xl skeleton-shimmer" />
        <div className="h-96 rounded-xl skeleton-shimmer" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-white/25">
          {error ? `Error: ${(error as Error).message}` : "Job not found."}
        </CardContent>
      </Card>
    );
  }

  const { job, records, edges, validations, deep_validation, record_count } = data;
  const s = STATUS_STYLES[job.status] ?? STATUS_STYLES.requested;

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div>
        <Link
          href="/marketplace"
          className="text-xs text-white/25 hover:text-white/50 flex items-center gap-1 mb-3 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Marketplace
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-white/90 truncate">
              {job.task}
            </h2>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[11px] font-mono text-white/20">{job.id}</span>
              {job.amount_sats > 0 && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {job.amount_sats.toLocaleString()} sats
                </span>
              )}
            </div>
          </div>
          <Badge className={`${s.bg} ${s.text} ${s.border} shrink-0`}>
            {job.status}
          </Badge>
        </div>
      </div>

      {/* Deep Validation */}
      <Card className={deep_validation.valid ? "border-emerald-500/20" : "border-red-500/20"}>
        <CardContent className="p-4 flex items-start gap-3">
          {deep_validation.valid ? (
            <>
              <Shield className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-emerald-400 font-medium">
                  Full DAG verified &mdash; {record_count} records, 0 errors
                </p>
                <p className="text-xs text-white/25 mt-1">
                  All signatures, timestamps, agent continuity, and cross-agent
                  references validated recursively
                </p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium mb-1">
                  Validation failed &mdash; {deep_validation.errors.length} error(s)
                </p>
                {deep_validation.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-400/70">
                    &bull; {e}
                  </p>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Agent Identity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: AGENT_COLORS.customer, boxShadow: `0 0 8px ${AGENT_COLORS.customer}50` }}
              />
              <p className="text-[10px] text-white/25 uppercase tracking-wider">Customer Agent</p>
            </div>
            <p className="text-[11px] font-mono text-white/40 break-all">{job.customer_pubkey}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: AGENT_COLORS.service, boxShadow: `0 0 8px ${AGENT_COLORS.service}50` }}
              />
              <p className="text-[10px] text-white/25 uppercase tracking-wider">Service Agent</p>
            </div>
            <p className="text-[11px] font-mono text-white/40 break-all">
              {job.service_pubkey ?? "Awaiting offer..."}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provenance DAG */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-white/40 font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Cross-Agent Provenance DAG
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[400px] border-t border-white/[0.04]">
            <ProvenanceDAG
              job={job}
              records={records}
              edges={edges}
              validations={validations}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-white/40 font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Protocol Steps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STEP_ORDER.map(({ key, label, agent, step }) => {
            const rid = job[key as keyof typeof job] as string | null;
            if (!rid) return null;
            const rec = records[rid];
            if (!rec) return null;
            const valid = validations[rid];
            const agentColor = agent === "Customer" ? AGENT_COLORS.customer : AGENT_COLORS.service;

            return (
              <StepCard
                key={key}
                step={step}
                label={label}
                agent={agent}
                agentColor={agentColor}
                rid={rid}
                record={rec}
                valid={valid}
              />
            );
          })}
        </CardContent>
      </Card>

      {/* Settlement Proof */}
      {job.payment_id && records[job.payment_id]?.settlement && (
        <SettlementProof record={records[job.payment_id]} />
      )}
    </div>
  );
}

// ── Provenance DAG Component ──────────────────────────────────────────────

function ProvenanceDAG({
  job,
  records,
  edges: rawEdges,
  validations,
}: {
  job: DisputeData["job"];
  records: Record<string, ARCRecord>;
  edges: DisputeData["edges"];
  validations: DisputeData["validations"];
}) {
  const router = useRouter();

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      router.push(`/explorer/${node.id}`);
    },
    [router],
  );

  const { nodes, edges } = useMemo(() => {
    const customerPk = job.customer_pubkey;
    const servicePk = job.service_pubkey;

    const customerRecords: { id: string; rec: ARCRecord }[] = [];
    const serviceRecords: { id: string; rec: ARCRecord }[] = [];

    for (const [rid, rec] of Object.entries(records)) {
      if (rec.agent.pubkey === customerPk) {
        customerRecords.push({ id: rid, rec });
      } else if (rec.agent.pubkey === servicePk) {
        serviceRecords.push({ id: rid, rec });
      }
    }

    const sortByTs = (a: { rec: ARCRecord }, b: { rec: ARCRecord }) =>
      a.rec.ts.localeCompare(b.rec.ts);
    customerRecords.sort(sortByTs);
    serviceRecords.sort(sortByTs);

    const TYPE_COLORS: Record<string, string> = {
      genesis: "#F7931A",
      action: "#00F0FF",
      settlement: "#22c55e",
    };

    const xSpacing = 300;
    const yCustomer = 20;
    const yService = 250;
    const nodeWidth = 240;

    const nodes: Node[] = [];

    customerRecords.forEach((r, i) => {
      const isValid = validations[r.id]?.valid !== false;
      nodes.push({
        id: r.id,
        position: { x: i * xSpacing, y: yCustomer },
        data: {
          label: (
            <div className="text-left p-1">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AGENT_COLORS.customer }} />
                <span className="text-[9px] text-white/30 uppercase tracking-wider">Customer</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TYPE_COLORS[r.rec.type] }}>
                {r.rec.type}
              </div>
              <div className="text-[11px] text-white/70 truncate max-w-[180px] leading-snug">{r.rec.action}</div>
              <div className="text-[9px] text-white/25 font-mono mt-1.5">{r.id.slice(0, 16)}&hellip;</div>
              {r.rec.settlement && (
                <div className="text-[10px] text-emerald-400 mt-1 font-medium">
                  {r.rec.settlement.amount_sats.toLocaleString()} sats
                </div>
              )}
              {!isValid && <div className="text-[9px] text-red-400 mt-1">INVALID</div>}
            </div>
          ),
        },
        style: {
          background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, #0a0a0a 70%)",
          border: `1.5px solid ${AGENT_COLORS.customer}40`,
          borderRadius: "14px",
          padding: "10px",
          width: nodeWidth,
          cursor: "pointer",
          boxShadow: isValid
            ? `0 0 20px ${AGENT_COLORS.customer}20, inset 0 0 12px ${AGENT_COLORS.customer}08`
            : "0 0 20px rgba(239,68,68,0.2)",
        },
      });
    });

    serviceRecords.forEach((r, i) => {
      const isValid = validations[r.id]?.valid !== false;
      nodes.push({
        id: r.id,
        position: { x: i * xSpacing, y: yService },
        data: {
          label: (
            <div className="text-left p-1">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AGENT_COLORS.service }} />
                <span className="text-[9px] text-white/30 uppercase tracking-wider">Service</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TYPE_COLORS[r.rec.type] ?? "#fff" }}>
                {r.rec.type}
              </div>
              <div className="text-[11px] text-white/70 truncate max-w-[180px] leading-snug">{r.rec.action}</div>
              <div className="text-[9px] text-white/25 font-mono mt-1.5">{r.id.slice(0, 16)}&hellip;</div>
              {!isValid && <div className="text-[9px] text-red-400 mt-1">INVALID</div>}
            </div>
          ),
        },
        style: {
          background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, #0a0a0a 70%)",
          border: `1.5px solid ${AGENT_COLORS.service}40`,
          borderRadius: "14px",
          padding: "10px",
          width: nodeWidth,
          cursor: "pointer",
          boxShadow: isValid
            ? `0 0 20px ${AGENT_COLORS.service}20, inset 0 0 12px ${AGENT_COLORS.service}08`
            : "0 0 20px rgba(239,68,68,0.2)",
        },
      });
    });

    const nodeIds = new Set(nodes.map((n) => n.id));
    const flowEdges: Edge[] = [];

    rawEdges.forEach((e, i) => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;

      if (e.type === "prev") {
        flowEdges.push({
          id: `prev-${i}`,
          source: e.source,
          target: e.target,
          animated: true,
          style: { stroke: "#ffffff18", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff30" },
          label: "prev",
          labelStyle: { fill: "#ffffff30", fontSize: 9 },
          labelBgStyle: { fill: "#000000", fillOpacity: 0.8 },
          labelBgPadding: [3, 2] as [number, number],
          labelBgBorderRadius: 3,
        });
      } else {
        flowEdges.push({
          id: `memref-${i}`,
          source: e.source,
          target: e.target,
          style: {
            stroke: "#F7931A",
            strokeDasharray: "6 3",
            strokeWidth: 1.5,
            strokeOpacity: 0.5,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#F7931A80" },
          label: "memref",
          labelStyle: { fill: "#F7931A90", fontSize: 9, fontWeight: 600 },
          labelBgStyle: { fill: "#000000", fillOpacity: 0.9 },
          labelBgPadding: [3, 2] as [number, number],
          labelBgBorderRadius: 3,
        });
      }
    });

    return { nodes, edges: flowEdges };
  }, [job, records, rawEdges, validations]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      proOptions={{ hideAttribution: true }}
      style={{ background: "#000000" }}
      nodesDraggable
      nodesConnectable={false}
    >
      <Background color="#ffffff08" gap={32} size={1} />
      <Controls
        style={{
          background: "#111111",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "10px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      />
    </ReactFlow>
  );
}

// ── Step Card Component ───────────────────────────────────────────────────

function StepCard({
  step,
  label,
  agent,
  agentColor,
  rid,
  record,
  valid,
}: {
  step: number;
  label: string;
  agent: string;
  agentColor: string;
  rid: string;
  record: ARCRecord;
  valid?: { valid: boolean; errors: string[] };
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border border-white/[0.04] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: `${agentColor}15`, color: agentColor }}
        >
          {step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: agentColor }}>
              {agent}
            </span>
            <span className="text-[10px] text-white/20">&rarr;</span>
            <span className="text-xs text-white/60 font-medium">{label}</span>
            {record.type === "settlement" && record.settlement && (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                {record.settlement.amount_sats.toLocaleString()} sats
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-white/20 font-mono truncate mt-0.5">{rid.slice(0, 32)}...</p>
        </div>
        {valid && (
          valid.valid
            ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        )}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/20 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] space-y-3">
              <div>
                <p className="text-[10px] text-white/25 mb-0.5 uppercase tracking-wider">Action</p>
                <p className="text-xs text-white/50">{record.action}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <DetailField label="Type" value={record.type} />
                <DetailField label="Timestamp" value={new Date(record.ts).toLocaleString()} />
                <DetailField label="Input Hash" value={record.ihash} mono truncate />
                <DetailField label="Output Hash" value={record.ohash} mono truncate />
              </div>

              {record.prev && (
                <div>
                  <p className="text-[10px] text-white/25 mb-0.5 uppercase tracking-wider">Previous Record</p>
                  <Link
                    href={`/explorer/${record.prev}`}
                    className="text-[11px] font-mono text-[#00F0FF]/60 hover:text-[#00F0FF] transition-colors"
                  >
                    {record.prev}
                  </Link>
                </div>
              )}

              {record.memrefs.length > 0 && (
                <div>
                  <p className="text-[10px] text-white/25 mb-0.5 uppercase tracking-wider">
                    Memory References ({record.memrefs.length})
                  </p>
                  {record.memrefs.map((m) => (
                    <Link
                      key={m}
                      href={`/explorer/${m}`}
                      className="block text-[11px] font-mono text-[#F7931A]/60 hover:text-[#F7931A] transition-colors"
                    >
                      {m}
                    </Link>
                  ))}
                </div>
              )}

              <div>
                <p className="text-[10px] text-white/25 mb-0.5 uppercase tracking-wider">Schnorr Signature</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-mono text-white/20 break-all select-all flex-1">
                    {record.sig}
                  </p>
                  <button
                    onClick={() => copy(record.sig)}
                    className="shrink-0 p-1 rounded hover:bg-white/[0.04] transition-colors"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-white/20" />
                    )}
                  </button>
                </div>
              </div>

              {valid && !valid.valid && (
                <div className="p-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                  {valid.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-red-400/70">&bull; {e}</p>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Settlement Proof Component ────────────────────────────────────────────

function SettlementProof({ record }: { record: ARCRecord }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const settlement = record.settlement!;

  async function verify() {
    try {
      const bytes = new Uint8Array(
        (settlement.preimage!.match(/.{2}/g) || []).map((b) => parseInt(b, 16)),
      );
      const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
      const computed = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setVerified(computed === settlement.payment_hash);
    } catch {
      setVerified(false);
    }
  }

  const cells = settlement.payment_hash
    .slice(0, 64)
    .split("")
    .map((c, i) => {
      const val = parseInt(c, 16);
      const opacity = (val / 15) * 0.8 + 0.1;
      return (
        <div
          key={i}
          className="rounded-[2px]"
          style={{ background: `rgba(34, 197, 94, ${opacity})` }}
        />
      );
    });

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wider text-emerald-400/80 font-medium flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Lightning Settlement Proof
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-6">
          <div className="grid grid-cols-8 gap-[3px] w-[120px] h-[120px] p-3 bg-black rounded-xl border border-white/[0.06] shrink-0">
            {cells}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Amount</p>
              <p className="text-lg font-bold text-emerald-400">
                {settlement.amount_sats.toLocaleString()} sats
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Payment Hash</p>
              <p className="text-[11px] font-mono text-white/40 break-all select-all">
                {settlement.payment_hash}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Preimage</p>
              <p className="text-[11px] font-mono text-[#F7931A]/60 break-all select-all">
                {settlement.preimage}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={verify}
            className="gap-1.5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
          >
            <Shield className="h-3.5 w-3.5" />
            Verify Preimage
          </Button>
          <AnimatePresence>
            {verified !== null && (
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`text-sm font-medium ${verified ? "text-emerald-400" : "text-red-400"}`}
              >
                {verified
                  ? "Valid: SHA-256(preimage) === payment_hash"
                  : "Invalid: preimage does not match"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Detail Field ──────────────────────────────────────────────────────────

function DetailField({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-white/25 mb-0.5 uppercase tracking-wider">{label}</p>
      <p
        className={`text-xs ${mono ? "font-mono text-white/40" : "text-white/60"} ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
