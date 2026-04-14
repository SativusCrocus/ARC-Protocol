"use client";

import { useState, Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Zap,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  FileText,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Gavel,
  ExternalLink,
  Terminal,
  ClipboardList,
  Search,
  Scroll,
  Scale,
  Activity,
  Brain,
  Fingerprint,
  ScanSearch,
  Scale as ScaleIcon,
  BookOpenCheck,
  User,
} from "lucide-react";
import type {
  ComplianceResult,
  RecordWithId,
  ComplianceVerifyResult,
} from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false },
);

// ── Compliance Types (mirrors backend/compliance_agent.py COMPLIANCE_TYPES) ──

const COMPLIANCE_TYPES = [
  {
    key: "regulatory",
    label: "Regulatory",
    icon: Scale,
    desc: "GDPR / MiCA / SOC-2 / AML posture audit",
  },
  {
    key: "safety",
    label: "Safety",
    icon: ShieldCheck,
    desc: "OWASP LLM Top-10 + jailbreak resilience",
  },
  {
    key: "provenance",
    label: "Provenance",
    icon: Fingerprint,
    desc: "Full chain + memref BIP-340 continuity",
  },
  {
    key: "hallucination",
    label: "Hallucination",
    icon: ScanSearch,
    desc: "Factuality + cited-memref verification",
  },
  {
    key: "bias",
    label: "Bias",
    icon: BookOpenCheck,
    desc: "Fairness + dispute-outcome skew audit",
  },
] as const;

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

// ── Pipeline Steps ───────────────────────────────────────────────────────────

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "scope", label: "Scope", icon: ClipboardList, color: "#10B981" },
  { key: "audit", label: "Audit", icon: Search, color: "#a855f7" },
  { key: "evidence", label: "Evidence", icon: Scroll, color: "#38BDF8" },
  { key: "report", label: "Report", icon: FileText, color: "#EAB308" },
  { key: "inscribe", label: "Inscribe", icon: GitBranch, color: "#F7931A" },
];

function StepIndicator({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-all duration-300 ${
                isActive
                  ? "bg-white/[0.06] border border-white/[0.1]"
                  : isDone
                    ? "opacity-60"
                    : "opacity-20"
              }`}
              style={{ color: isActive || isDone ? step.color : undefined }}
            >
              {isActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isDone ? (
                <Check className="h-3 w-3" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-4 h-px mx-0.5 transition-all ${
                  isDone ? "bg-white/20" : "bg-white/[0.04]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Collapsible Output Section ───────────────────────────────────────────────

function OutputSection({
  title,
  icon: Icon,
  color,
  content,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;
  return (
    <Card className="border-white/[0.04] bg-[#0a0a0a] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 p-4 text-left hover:bg-white/[0.01] transition-colors"
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color }} />
        <span className="text-sm font-medium" style={{ color }}>
          {title}
        </span>
        <span className="ml-auto text-white/20">
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-0">
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-4 max-h-[500px] overflow-y-auto text-white/60 bg-white/[0.02]">
            {content}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Run Audit & Inscribe Button (one-click ARC CLI + verify) ────────────────

function RunAuditInscribeButton({
  result,
  onVerified,
}: {
  result: ComplianceResult;
  onVerified: (v: ComplianceVerifyResult) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.complianceVerify(result.final_id),
    onSuccess: (data) => onVerified(data),
  });

  const handleClick = useCallback(async () => {
    navigator.clipboard.writeText(result.inscription_cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    setVerifying(true);
    try {
      await verify.mutateAsync();
    } finally {
      setVerifying(false);
    }
  }, [result, verify]);

  return (
    <Button
      onClick={handleClick}
      disabled={verifying || verify.isPending}
      className="bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/20 compliance-btn-glow transition-all"
    >
      {verifying || verify.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Inscribing...
        </>
      ) : copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-emerald-400" />
          Audit Inscribed
        </>
      ) : (
        <>
          <ShieldCheck className="h-4 w-4 mr-2" />
          Run Audit &amp; Inscribe
        </>
      )}
    </Button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [prompt, setPrompt] = useState("");
  const [complianceType, setComplianceType] = useState<string>("provenance");
  const [subject, setSubject] = useState("arc-protocol-full-mesh");
  const [severity, setSeverity] = useState<string>("HIGH");
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [verification, setVerification] =
    useState<ComplianceVerifyResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: {
      prompt: string;
      compliance_type: string;
      subject: string;
      severity: string;
      model: string;
    }) => api.compliance(data),
    onSuccess: (data) => {
      setResult(data);
      setVerification(null);
    },
  });

  const chainQuery = useQuery({
    queryKey: ["compliance-chain", result?.final_id],
    queryFn: () => api.complianceChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  // Fallback: live arc-compliance seed chain so the DAG viewer is never empty.
  const seedRecordsQuery = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    staleTime: 10_000,
  });

  const seedComplianceRecords: RecordWithId[] = useMemo(
    () =>
      (seedRecordsQuery.data || [])
        .filter(
          (r) =>
            (r.record.agent.alias || "").toLowerCase() === "arc-compliance",
        )
        .sort((a, b) => (a.record.ts < b.record.ts ? -1 : 1)),
    [seedRecordsQuery.data],
  );

  const activeRecords: RecordWithId[] = useMemo(
    () => [
      ...(chainQuery.data?.chain || result?.chain || []),
      ...(chainQuery.data?.memref_records || []),
    ],
    [chainQuery.data, result],
  );

  const allRecords: RecordWithId[] =
    activeRecords.length > 0 ? activeRecords : seedComplianceRecords;

  const selectedType = COMPLIANCE_TYPES.find((t) => t.key === complianceType);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || mutation.isPending) return;
      setResult(null);
      setVerification(null);
      mutation.mutate({
        prompt: prompt.trim(),
        compliance_type: complianceType,
        subject: subject.trim(),
        severity,
        model,
      });
    },
    [prompt, complianceType, subject, severity, model, mutation],
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  const copyReport = useCallback(() => {
    if (result?.report) {
      navigator.clipboard.writeText(result.report);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  }, [result]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[48px] font-bold tracking-tighter leading-none">
            <span className="text-[#10B981]">Compliance</span>{" "}
            <span className="text-white/90">&amp; Audit</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            LangGraph + Ollama audit agent &middot; scope &rarr; audit &rarr;
            evidence &rarr; report &middot; every attestation anchored to the
            full ARC DAG
          </p>
        </div>
        <Link href="/marketplace#demo">
          <Button
            variant="outline"
            className="gap-2 border-[#10B981]/20 text-[#10B981]/80 hover:border-[#10B981]/40 hover:text-[#10B981]"
          >
            <Gavel className="h-3.5 w-3.5" />
            Dispute Resolution
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>
        </Link>
      </div>

      {/* Audit Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] compliance-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Compliance Type Selector */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-2 block">
                Compliance Type
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {COMPLIANCE_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = t.key === complianceType;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setComplianceType(t.key)}
                      className={`group relative flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all duration-200 ${
                        active
                          ? "border-[#10B981]/40 bg-[#10B981]/[0.06] shadow-[0_0_18px_rgba(16,185,129,0.14)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          active ? "text-[#10B981]" : "text-white/40"
                        }`}
                      />
                      <div>
                        <div
                          className={`text-[11px] font-semibold tracking-wide ${
                            active ? "text-[#10B981]" : "text-white/70"
                          }`}
                        >
                          {t.label}
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5 leading-snug">
                          {t.desc}
                        </div>
                      </div>
                      {active && (
                        <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt Input */}
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the audit scope... (e.g., Audit the ARC Protocol certified-agent mesh for provenance integrity and flag any memref edge that fails deep BIP-340 verification.)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#10B981]/30 focus:ring-1 focus:ring-[#10B981]/20 transition-all resize-none"
              />
            </div>

            {/* Subject + Severity + Model */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <User className="h-2.5 w-2.5" />
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#10B981]/30"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#10B981]/30"
                >
                  {SEVERITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Terminal className="h-2.5 w-2.5" />
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#10B981]/30"
                >
                  <option value="llama3.1:8b">llama3.1:8b</option>
                  <option value="llama3.2">llama3.2</option>
                  <option value="qwen2.5:14b">qwen2.5:14b</option>
                  <option value="qwen3:14b">qwen3:14b</option>
                  <option value="mistral">mistral</option>
                </select>
              </div>
            </div>

            {/* Submit Row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-[10px] text-white/20 flex-wrap">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" /> 6-node LangGraph
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> 6 inscriptions / audit
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> 6-agent memrefs
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> BIP-340 signed
                </span>
              </div>
              <Button
                type="submit"
                disabled={!prompt.trim() || mutation.isPending}
                className="bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-30 compliance-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Auditing...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Run Audit &amp; Inscribe
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Pipeline Progress */}
      {mutation.isPending && (
        <div className="anim-fade-up">
          <Card className="border-[#10B981]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#10B981]/20 border-t-[#10B981] animate-spin" />
                  <Shield className="absolute inset-0 m-auto h-5 w-5 text-[#10B981]/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Compliance agent auditing and anchoring...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; scope &rarr; audit &rarr; evidence &rarr; report
                    &rarr; inscribe
                  </p>
                </div>
                <StepIndicator activeStep={3} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error */}
      {mutation.isError && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-red-400">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Compliance agent failed"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 anim-fade-up">
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Records",
                value: result.record_ids.length,
                icon: Layers,
                color: "#10B981",
              },
              {
                label: "DAG Refs",
                value: result.dag_memrefs.length,
                icon: Link2,
                color: "#a855f7",
              },
              {
                label: "Type",
                value: selectedType?.label || result.compliance_name,
                icon: FileText,
                color: "#00F0FF",
                isText: true,
              },
              {
                label: "Inscribed",
                value: result.final_id ? 1 : 0,
                icon: Check,
                color: "#22c55e",
              },
            ].map(({ label, value, icon: Icon, color, isText }) => (
              <Card key={label} className="border-white/[0.04] bg-[#0a0a0a]">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3 w-3" style={{ color: `${color}80` }} />
                    <span className="text-[9px] text-white/25 uppercase tracking-wider">
                      {label}
                    </span>
                  </div>
                  <p
                    className={`${isText ? "text-sm" : "text-xl"} font-bold truncate`}
                    style={{ color }}
                  >
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Audit Report Preview (primary) */}
          <Card className="border-[#10B981]/10 bg-[#0a0a0a] overflow-hidden compliance-card-glow">
            <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
              <BookOpenCheck className="h-4 w-4 text-[#10B981]" />
              <span className="text-sm font-medium text-[#10B981]">
                {result.compliance_name || "Audit Report"}
              </span>
              <Badge
                variant="outline"
                className="text-[8px] text-[#10B981]/70 border-[#10B981]/30 px-1.5 uppercase"
              >
                {result.severity}
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-white/50 border-white/20 px-1.5 uppercase"
              >
                {result.compliance_type}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyReport}
                  className="h-7 px-2 text-[10px]"
                >
                  {copiedReport ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400 mr-1" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-white/30 mr-1" />
                      <span className="text-white/30">Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
            <CardContent className="p-4 pt-4">
              <div className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-6 max-h-[600px] overflow-y-auto compliance-report-paper">
                {result.report}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-white/25 font-mono flex-wrap">
                <span>
                  Subject:{" "}
                  <span className="text-white/50">
                    {result.subject || "\u2014"}
                  </span>
                </span>
                <span>
                  Severity:{" "}
                  <span className="text-white/50">{result.severity}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Run Audit & Inscribe */}
          <Card className="border-[#10B981]/15 bg-[#0a0a0a] compliance-card-glow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]/60" />
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                      Run Audit &amp; Inscribe on Bitcoin
                    </h4>
                  </div>
                  <p className="text-[11px] text-white/30">
                    Calls the ARC CLI inscription envelope and deep-verifies the
                    full audit chain + cross-agent memrefs.
                  </p>
                </div>
                <RunAuditInscribeButton
                  result={result}
                  onVerified={setVerification}
                />
              </div>

              {verification && (
                <div className="mt-4 border-t border-white/[0.04] pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <span className="text-white/25 block mb-0.5 text-[9px] uppercase tracking-wider">
                        Deep Valid
                      </span>
                      {verification.valid ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          <Check className="h-3 w-3" /> PASS
                        </span>
                      ) : (
                        <span className="text-red-400 flex items-center gap-1 font-medium">
                          <AlertTriangle className="h-3 w-3" /> FAIL
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-white/25 block mb-0.5 text-[9px] uppercase tracking-wider">
                        Signature
                      </span>
                      <span
                        className={
                          verification.signature_valid
                            ? "text-emerald-400 flex items-center gap-1"
                            : "text-red-400 flex items-center gap-1"
                        }
                      >
                        <Check className="h-3 w-3" />
                        {verification.signature_valid
                          ? "BIP-340 OK"
                          : "INVALID"}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/25 block mb-0.5 text-[9px] uppercase tracking-wider">
                        Memrefs
                      </span>
                      <span className="text-[#10B981]">
                        {verification.memref_count} cross-agent
                      </span>
                    </div>
                    <div>
                      <span className="text-white/25 block mb-0.5 text-[9px] uppercase tracking-wider">
                        Alias
                      </span>
                      <span className="text-white/60 font-mono">
                        {verification.alias}
                      </span>
                    </div>
                  </div>
                  {verification.errors.length > 0 && (
                    <div className="mt-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                      <p className="text-[10px] text-red-400/80 font-mono">
                        {verification.errors.join(" \u00b7 ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scope + Audit + Evidence (collapsible) */}
          <OutputSection
            title="Audit Scope"
            icon={ClipboardList}
            color="#10B981"
            content={result.scope}
            defaultOpen
          />
          <OutputSection
            title="Audit Findings (DAG Walk)"
            icon={Search}
            color="#a855f7"
            content={result.audit}
          />
          <OutputSection
            title="Evidence Bundle"
            icon={Scroll}
            color="#38BDF8"
            content={result.evidence}
          />

          {/* Provenance DAG */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-[#10B981]/60" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Compliance Audit Provenance Chain
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#10B981]/70 border-[#10B981]/25 px-1.5"
                >
                  {result.dag_memrefs.length} cross-agent refs
                </Badge>
              )}
              <div className="flex items-center gap-3 ml-auto text-[9px] text-white/20">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-px bg-white/20" /> prev
                  chain
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-4 h-px"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, #10B981 0, #10B981 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[420px] border border-[#10B981]/15 rounded-xl overflow-hidden bg-[#020202] compliance-dag-glow">
              {allRecords.length > 0 ? (
                <Suspense
                  fallback={
                    <div className="h-full skeleton-shimmer rounded-xl" />
                  }
                >
                  <DAGViewer records={allRecords} />
                </Suspense>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#10B981]" />
                </div>
              )}
            </div>
          </div>

          {/* Inscription Command */}
          {result.inscription_cmd && (
            <Card className="border-[#F7931A]/10 bg-[#0a0a0a]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-3.5 w-3.5 text-[#F7931A]/60" />
                  <h4 className="text-xs text-white/30 uppercase tracking-wider">
                    Bitcoin Inscription Command
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyInscription}
                    className="ml-auto h-7 px-2 text-[10px]"
                  >
                    {copiedCmd ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-white/30" />
                    )}
                  </Button>
                </div>
                <code className="block text-[10px] text-[#F7931A]/60 bg-[#F7931A]/5 px-3 py-2.5 rounded-lg font-mono break-all max-h-[140px] overflow-y-auto">
                  {result.inscription_cmd}
                </code>
              </CardContent>
            </Card>
          )}

          {/* Cross-Agent Attestation Badges */}
          <Card className="border-white/[0.04] bg-[#0a0a0a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-3.5 w-3.5 text-[#10B981]/60" />
                <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                  Cross-Agent Attestation
                </h4>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "arc-deep-research", color: "#A855F7", Icon: Brain },
                  { label: "arc-codegen", color: "#00F0FF", Icon: Terminal },
                  { label: "arc-defi-trader", color: "#22c55e", Icon: Activity },
                  { label: "arc-legal", color: "#EAB308", Icon: ScaleIcon },
                  { label: "arc-design", color: "#EC4899", Icon: Fingerprint },
                  { label: "arc-support", color: "#38BDF8", Icon: Shield },
                ].map(({ label, color, Icon }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono"
                    style={{
                      color,
                      borderColor: `${color}40`,
                      backgroundColor: `${color}10`,
                    }}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-white/20 mt-3">
                Every audit record memrefs the latest head of each certified
                agent + the seeded ARC DAG. Full-mesh provenance in one
                inscription.
              </p>
            </CardContent>
          </Card>

          {/* Agent Info */}
          <div className="flex items-center gap-4 text-[10px] text-white/15 font-mono flex-wrap">
            <span>agent: {result.agent_pubkey?.slice(0, 24)}...</span>
            <span>final: {result.final_id?.slice(0, 20)}...</span>
            <span>
              records: {result.record_ids.length} &middot; dag_refs:{" "}
              {result.dag_memrefs.length}
            </span>
          </div>
        </div>
      )}

      {/* Recent arc-compliance Inscriptions (seeded) — shown before submission */}
      {!result && !mutation.isPending && seedComplianceRecords.length > 0 && (
        <div className="space-y-4 anim-fade-up anim-delay-1">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Records",
                value: seedComplianceRecords.length,
                icon: Layers,
                color: "#10B981",
              },
              {
                label: "Agent",
                value: "arc-compliance",
                icon: Shield,
                color: "#F7931A",
                isText: true,
              },
              {
                label: "Status",
                value: "LIVE",
                icon: Check,
                color: "#22c55e",
                isText: true,
              },
            ].map(({ label, value, icon: Icon, color, isText }) => (
              <Card key={label} className="border-white/[0.04] bg-[#0a0a0a]">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3 w-3" style={{ color: `${color}80` }} />
                    <span className="text-[9px] text-white/25 uppercase tracking-wider">
                      {label}
                    </span>
                  </div>
                  <p
                    className={`${isText ? "text-sm" : "text-xl"} font-bold`}
                    style={{ color }}
                  >
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-3.5 w-3.5 text-[#10B981]/60" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Recent Compliance Audit Inscriptions
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] text-[#10B981]/70 border-[#10B981]/25 px-1.5"
              >
                live seed chain
              </Badge>
            </div>
            <div className="h-[420px] border border-[#10B981]/15 rounded-xl overflow-hidden bg-[#020202] compliance-dag-glow">
              <Suspense
                fallback={<div className="h-full skeleton-shimmer rounded-xl" />}
              >
                <DAGViewer records={seedComplianceRecords} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* CLI Reference */}
      {!result && !mutation.isPending && (
        <Card className="border-white/[0.04] bg-[#0a0a0a] anim-fade-up anim-delay-2">
          <CardContent className="p-4">
            <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
              ARC CLI &middot; Direct Audit Inscription
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#10B981]/60">$</span>
                <code className="text-white/50">
                  cd backend &amp;&amp; python compliance_agent.py --type
                  provenance &quot;full-mesh DAG integrity audit&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#10B981]/60">$</span>
                <code className="text-white/50">
                  python compliance_agent.py --type regulatory --severity HIGH
                  &quot;GDPR posture across agents&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#10B981]/60">$</span>
                <code className="text-white/50">arc view-chain RECORD_ID</code>
                <span className="text-white/15 ml-auto">view provenance</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#10B981]/60">$</span>
                <code className="text-white/50">
                  arc validate RECORD_ID --deep
                </code>
                <span className="text-white/15 ml-auto">verify chain</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
