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
  HelpCircle,
  Zap,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  FileText,
  Stethoscope,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Headphones,
  ListChecks,
  Sparkles,
  User,
  Terminal,
  ExternalLink,
  Shield,
  CreditCard,
  Wrench,
  KeyRound,
  UserPlus,
  Gavel,
  MessageSquare,
  MessagesSquare,
  Bot,
} from "lucide-react";
import type {
  SupportResult,
  RecordWithId,
  SupportVerifyResult,
  SupportConversationTurn,
} from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false },
);

// ── Issue Types (mirrors backend/support_agent.py ISSUES) ───────────────────

const ISSUE_TYPES = [
  {
    key: "billing",
    label: "Billing & Payments",
    icon: CreditCard,
    desc: "Lightning settlements, refunds, invoice disputes",
  },
  {
    key: "technical",
    label: "Technical Issue",
    icon: Wrench,
    desc: "Integration bugs, DAG walk errors, crashes",
  },
  {
    key: "account",
    label: "Account & Keys",
    icon: KeyRound,
    desc: "Key rotation, alias changes, recovery",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    icon: UserPlus,
    desc: "New-agent spin-up + first memref",
  },
  {
    key: "dispute",
    label: "Service Dispute",
    icon: Gavel,
    desc: "Contested milestones, unpaid jobs",
  },
  {
    key: "general",
    label: "General Inquiry",
    icon: MessageSquare,
    desc: "Protocol questions + ecosystem help",
  },
] as const;

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Pipeline Steps ───────────────────────────────────────────────────────────

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "triage", label: "Triage", icon: ListChecks, color: "#38BDF8" },
  { key: "diagnose", label: "Diagnose", icon: Stethoscope, color: "#a855f7" },
  { key: "draft", label: "Resolve", icon: Sparkles, color: "#22c55e" },
  { key: "qa", label: "QA", icon: ShieldCheck, color: "#EAB308" },
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

// ── Conversation Preview ─────────────────────────────────────────────────────

function ConversationPreview({
  turns,
  customer,
}: {
  turns: SupportConversationTurn[];
  customer: string;
}) {
  if (turns.length === 0) return null;
  const phaseIcon = (p?: string) => {
    if (p === "triage") return ListChecks;
    if (p === "diagnose") return Stethoscope;
    if (p === "resolution") return Sparkles;
    if (p === "qa") return ShieldCheck;
    return Bot;
  };
  const phaseColor = (p?: string) => {
    if (p === "triage") return "#38BDF8";
    if (p === "diagnose") return "#a855f7";
    if (p === "resolution") return "#22c55e";
    if (p === "qa") return "#EAB308";
    return "#F7931A";
  };
  return (
    <Card className="border-[#38BDF8]/15 bg-[#0a0a0a] support-card-glow">
      <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
        <MessagesSquare className="h-4 w-4 text-[#38BDF8]" />
        <span className="text-sm font-medium text-[#38BDF8]">
          Conversation History
        </span>
        <Badge
          variant="outline"
          className="text-[8px] text-[#38BDF8]/70 border-[#38BDF8]/30 px-1.5 uppercase"
        >
          {turns.length} turns
        </Badge>
      </div>
      <CardContent className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
        {turns.map((t, i) => {
          const isCustomer = t.role === "customer";
          const Icon = isCustomer ? User : phaseIcon(t.phase);
          const color = isCustomer ? "#38BDF8" : phaseColor(t.phase);
          return (
            <div
              key={i}
              className={`flex gap-3 ${isCustomer ? "" : "flex-row-reverse"}`}
            >
              <div
                className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: `${color}15`,
                  border: `1px solid ${color}40`,
                }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </div>
              <div
                className={`${isCustomer ? "support-chat-bubble-customer" : "support-chat-bubble-agent"} px-4 py-3 max-w-[78%]`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color }}
                  >
                    {isCustomer ? customer || "customer" : t.phase || "agent"}
                  </span>
                </div>
                <p className="text-[12px] text-white/70 leading-relaxed whitespace-pre-wrap font-mono">
                  {t.text.length > 620
                    ? t.text.slice(0, 620) + "…"
                    : t.text}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Resolve & Inscribe Button (one-click ARC CLI + verify) ───────────────────

function ResolveInscribeButton({
  result,
  onVerified,
}: {
  result: SupportResult;
  onVerified: (v: SupportVerifyResult) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.supportVerify(result.final_id),
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
      className="bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#38BDF8] hover:bg-[#38BDF8]/20 support-btn-glow transition-all"
    >
      {verifying || verify.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Inscribing...
        </>
      ) : copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-emerald-400" />
          Resolved &amp; Inscribed
        </>
      ) : (
        <>
          <ShieldCheck className="h-4 w-4 mr-2" />
          Resolve &amp; Inscribe
        </>
      )}
    </Button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [prompt, setPrompt] = useState("");
  const [issueType, setIssueType] = useState<string>("dispute");
  const [customer, setCustomer] = useState("agent-l2-startup");
  const [priority, setPriority] = useState<string>("P1");
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<SupportResult | null>(null);
  const [verification, setVerification] = useState<SupportVerifyResult | null>(
    null,
  );
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedResolution, setCopiedResolution] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: {
      prompt: string;
      issue_type: string;
      customer: string;
      priority: string;
      model: string;
    }) => api.support(data),
    onSuccess: (data) => {
      setResult(data);
      setVerification(null);
    },
  });

  const chainQuery = useQuery({
    queryKey: ["support-chain", result?.final_id],
    queryFn: () => api.supportChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  // Fallback: live arc-support seed chain so the DAG viewer is never empty.
  const seedRecordsQuery = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    staleTime: 10_000,
  });

  const seedSupportRecords: RecordWithId[] = useMemo(
    () =>
      (seedRecordsQuery.data || [])
        .filter(
          (r) => (r.record.agent.alias || "").toLowerCase() === "arc-support",
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
    activeRecords.length > 0 ? activeRecords : seedSupportRecords;

  const selectedIssue = ISSUE_TYPES.find((t) => t.key === issueType);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || mutation.isPending) return;
      setResult(null);
      setVerification(null);
      mutation.mutate({
        prompt: prompt.trim(),
        issue_type: issueType,
        customer: customer.trim(),
        priority,
        model,
      });
    },
    [prompt, issueType, customer, priority, model, mutation],
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  const copyResolution = useCallback(() => {
    if (result?.resolution) {
      navigator.clipboard.writeText(result.resolution);
      setCopiedResolution(true);
      setTimeout(() => setCopiedResolution(false), 2000);
    }
  }, [result]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[48px] font-bold tracking-tighter leading-none">
            <span className="text-[#38BDF8] text-glow-cyan">Customer</span>{" "}
            <span className="text-white/90">Support</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            LangGraph + Ollama resolution agent &middot; triage &rarr; diagnose
            &rarr; resolve &middot; every ticket anchored to the full ARC DAG
          </p>
        </div>
        <Link href="/marketplace#demo">
          <Button
            variant="outline"
            className="gap-2 border-[#38BDF8]/20 text-[#38BDF8]/80 hover:border-[#38BDF8]/40 hover:text-[#38BDF8]"
          >
            <Gavel className="h-3.5 w-3.5" />
            Dispute Resolution
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>
        </Link>
      </div>

      {/* Ticket Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] support-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Issue Type Selector */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-2 block">
                Issue Type
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {ISSUE_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = t.key === issueType;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setIssueType(t.key)}
                      className={`group relative flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all duration-200 ${
                        active
                          ? "border-[#38BDF8]/40 bg-[#38BDF8]/[0.06] shadow-[0_0_18px_rgba(56,189,248,0.14)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          active ? "text-[#38BDF8]" : "text-white/40"
                        }`}
                      />
                      <div>
                        <div
                          className={`text-[11px] font-semibold tracking-wide ${
                            active ? "text-[#38BDF8]" : "text-white/70"
                          }`}
                        >
                          {t.label}
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5 leading-snug">
                          {t.desc}
                        </div>
                      </div>
                      {active && (
                        <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt Input */}
            <div className="relative">
              <Headphones className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the issue... (e.g., Our marketplace job was delivered but the Lightning settlement never confirmed and the contract milestone is stuck. Please help reconcile.)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#38BDF8]/30 focus:ring-1 focus:ring-[#38BDF8]/20 transition-all resize-none"
              />
            </div>

            {/* Customer + Priority + Model */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <User className="h-2.5 w-2.5" />
                  Customer agent
                </label>
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#38BDF8]/30"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#38BDF8]/30"
                >
                  {PRIORITIES.map((p) => (
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
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#38BDF8]/30"
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
                  <Layers className="h-3 w-3" /> 6 inscriptions / ticket
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> 5-agent memrefs
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> BIP-340 signed
                </span>
              </div>
              <Button
                type="submit"
                disabled={!prompt.trim() || mutation.isPending}
                className="bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8] hover:bg-[#38BDF8]/20 disabled:opacity-30 support-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Open Ticket
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
          <Card className="border-[#38BDF8]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#38BDF8]/20 border-t-[#38BDF8] animate-spin" />
                  <HelpCircle className="absolute inset-0 m-auto h-5 w-5 text-[#38BDF8]/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Support agent triaging and anchoring...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; triage &rarr; diagnose &rarr; resolve &rarr; qa
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
                : "Support agent failed"}
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
                color: "#38BDF8",
              },
              {
                label: "DAG Refs",
                value: result.dag_memrefs.length,
                icon: Link2,
                color: "#a855f7",
              },
              {
                label: "Issue",
                value: selectedIssue?.label || result.issue_name,
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

          {/* Conversation History */}
          <ConversationPreview
            turns={result.conversation || []}
            customer={result.customer}
          />

          {/* Resolution Preview (primary) */}
          <Card className="border-[#38BDF8]/10 bg-[#0a0a0a] overflow-hidden support-card-glow">
            <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
              <Sparkles className="h-4 w-4 text-[#38BDF8]" />
              <span className="text-sm font-medium text-[#38BDF8]">
                {result.issue_name || "Ticket Resolution"}
              </span>
              <Badge
                variant="outline"
                className="text-[8px] text-[#38BDF8]/70 border-[#38BDF8]/30 px-1.5 uppercase"
              >
                {result.priority}
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-white/50 border-white/20 px-1.5 uppercase"
              >
                {result.issue_type}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyResolution}
                  className="h-7 px-2 text-[10px]"
                >
                  {copiedResolution ? (
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
              <div className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-6 max-h-[600px] overflow-y-auto support-chat-bubble-agent">
                {result.resolution}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-white/25 font-mono flex-wrap">
                <span>
                  Customer:{" "}
                  <span className="text-white/50">
                    {result.customer || "\u2014"}
                  </span>
                </span>
                <span>
                  Priority:{" "}
                  <span className="text-white/50">{result.priority}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Resolve & Inscribe */}
          <Card className="border-[#38BDF8]/15 bg-[#0a0a0a] support-card-glow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#38BDF8]/60" />
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                      Resolve &amp; Inscribe on Bitcoin
                    </h4>
                  </div>
                  <p className="text-[11px] text-white/30">
                    Calls the ARC CLI inscription envelope and deep-verifies the
                    full chain + cross-agent memrefs.
                  </p>
                </div>
                <ResolveInscribeButton
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
                      <span className="text-[#38BDF8]">
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

          {/* Triage + Diagnosis + QA (collapsible) */}
          <OutputSection
            title="Triage Note"
            icon={ListChecks}
            color="#38BDF8"
            content={result.triage}
            defaultOpen
          />
          <OutputSection
            title="Diagnosis (DAG Walk)"
            icon={Stethoscope}
            color="#a855f7"
            content={result.diagnosis}
          />
          <OutputSection
            title="QA Pass"
            icon={ShieldCheck}
            color="#EAB308"
            content={result.qa}
          />

          {/* Provenance DAG */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-[#38BDF8]/60" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Support Ticket Provenance Chain
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#38BDF8]/70 border-[#38BDF8]/25 px-1.5"
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
                        "repeating-linear-gradient(90deg, #38BDF8 0, #38BDF8 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[420px] border border-[#38BDF8]/15 rounded-xl overflow-hidden bg-[#020202] support-dag-glow">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#38BDF8]" />
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

          {/* Dispute Resolution Link */}
          <Card className="border-white/[0.04] bg-[#0a0a0a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#38BDF8]/[0.08] border border-[#38BDF8]/15">
                  <Gavel className="h-4 w-4 text-[#38BDF8]" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-white/70">
                    Escalate to Dispute Resolution
                  </h4>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    Walk this ticket's memref DAG against the Autonomous
                    Services demo to resolve contested outcomes.
                  </p>
                </div>
                <Link href={result.dispute_link || "/marketplace#demo"}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#38BDF8]/20 text-[#38BDF8]/80 hover:border-[#38BDF8]/40 hover:text-[#38BDF8]"
                  >
                    Open Dispute Demo
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
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

      {/* Recent arc-support Inscriptions (seeded) — shown before submission */}
      {!result && !mutation.isPending && seedSupportRecords.length > 0 && (
        <div className="space-y-4 anim-fade-up anim-delay-1">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Records",
                value: seedSupportRecords.length,
                icon: Layers,
                color: "#38BDF8",
              },
              {
                label: "Agent",
                value: "arc-support",
                icon: HelpCircle,
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
              <GitBranch className="h-3.5 w-3.5 text-[#38BDF8]/60" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Recent Support Ticket Inscriptions
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] text-[#38BDF8]/70 border-[#38BDF8]/25 px-1.5"
              >
                live seed chain
              </Badge>
            </div>
            <div className="h-[420px] border border-[#38BDF8]/15 rounded-xl overflow-hidden bg-[#020202] support-dag-glow">
              <Suspense
                fallback={<div className="h-full skeleton-shimmer rounded-xl" />}
              >
                <DAGViewer records={seedSupportRecords} />
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
              ARC CLI &middot; Direct Support Resolution
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#38BDF8]/60">$</span>
                <code className="text-white/50">
                  cd backend &amp;&amp; python support_agent.py --issue
                  dispute &quot;Marketplace job stuck unpaid&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#38BDF8]/60">$</span>
                <code className="text-white/50">
                  python support_agent.py --issue technical --priority P0
                  &quot;codegen agent crashed&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#38BDF8]/60">$</span>
                <code className="text-white/50">arc view-chain RECORD_ID</code>
                <span className="text-white/15 ml-auto">view provenance</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#38BDF8]/60">$</span>
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
