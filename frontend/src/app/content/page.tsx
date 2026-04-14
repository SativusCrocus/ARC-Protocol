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
  FileText,
  Zap,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Gavel,
  ExternalLink,
  Terminal,
  Newspaper,
  MessageSquare,
  Video,
  Mail,
  Sparkles,
  Activity,
  Brain,
  TrendingUp,
  Scale as ScaleIcon,
  Shield,
  Code2,
  Image as ImageIcon,
  HelpCircle,
  BarChart,
  Network,
  PenTool,
  Target,
  Wallet,
} from "lucide-react";
import type {
  ContentCreatorResult,
  RecordWithId,
  ContentCreatorVerifyResult,
} from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false },
);

// ── Content Formats (mirrors backend/content_agent.py CONTENT_FORMATS) ──────

const CONTENT_FORMATS = [
  {
    key: "article",
    label: "Article",
    icon: Newspaper,
    desc: "1,200-2,000 words \u2014 thesis, sections, inline ARC memref anchors",
  },
  {
    key: "twitter_thread",
    label: "Twitter Thread",
    icon: MessageSquare,
    desc: "12-tweet high-signal thread + inline attestation tweet",
  },
  {
    key: "video_script",
    label: "Video Script",
    icon: Video,
    desc: "3-5 min camera-ready script with B-roll cues + attestation",
  },
  {
    key: "newsletter",
    label: "Newsletter",
    icon: Mail,
    desc: "Executive summary + 3 deep-dives + cross-agent ledger + CTA",
  },
] as const;

// ── Pipeline Steps ───────────────────────────────────────────────────────────

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "research", label: "Research", icon: Brain, color: "#A855F7" },
  { key: "draft", label: "Draft", icon: PenTool, color: "#38BDF8" },
  { key: "refine", label: "Refine", icon: Target, color: "#EAB308" },
  { key: "polish", label: "Polish", icon: Sparkles, color: "#F43F5E" },
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

// ── Generate & Inscribe Button ──────────────────────────────────────────────

function GenerateInscribeButton({
  result,
  onVerified,
}: {
  result: ContentCreatorResult;
  onVerified: (v: ContentCreatorVerifyResult) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.contentVerify(result.final_id),
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
      className="bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-[#F43F5E] hover:bg-[#F43F5E]/20 content-btn-glow transition-all"
    >
      {verifying || verify.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Inscribing...
        </>
      ) : copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-emerald-400" />
          Content Inscribed
        </>
      ) : (
        <>
          <FileText className="h-4 w-4 mr-2" />
          Generate &amp; Inscribe
        </>
      )}
    </Button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const [prompt, setPrompt] = useState("");
  const [contentFormat, setContentFormat] = useState<string>("article");
  const [audience, setAudience] = useState(
    "crypto-native founders + AI builders",
  );
  const [priceSats, setPriceSats] = useState<number>(9500);
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<ContentCreatorResult | null>(null);
  const [verification, setVerification] =
    useState<ContentCreatorVerifyResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: {
      prompt: string;
      content_format: string;
      audience: string;
      price_sats: number;
      model: string;
    }) => api.contentCreate(data),
    onSuccess: (data) => {
      setResult(data);
      setVerification(null);
    },
  });

  const chainQuery = useQuery({
    queryKey: ["content-chain", result?.final_id],
    queryFn: () => api.contentChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  // Fallback seed chain so the DAG viewer is never empty.
  const seedRecordsQuery = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    staleTime: 10_000,
  });

  const seedContentRecords: RecordWithId[] = useMemo(
    () =>
      (seedRecordsQuery.data || [])
        .filter(
          (r) => (r.record.agent.alias || "").toLowerCase() === "arc-content",
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
    activeRecords.length > 0 ? activeRecords : seedContentRecords;

  const selectedFormat = CONTENT_FORMATS.find((f) => f.key === contentFormat);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || mutation.isPending) return;
      setResult(null);
      setVerification(null);
      mutation.mutate({
        prompt: prompt.trim(),
        content_format: contentFormat,
        audience: audience.trim() || "crypto-native founders + AI builders",
        price_sats: priceSats,
        model,
      });
    },
    [prompt, contentFormat, audience, priceSats, model, mutation],
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  const copyContent = useCallback(() => {
    if (result?.polished) {
      navigator.clipboard.writeText(result.polished);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  }, [result]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[48px] font-bold tracking-tighter leading-none">
            <span className="text-[#F43F5E]">Content</span>{" "}
            <span className="text-white/90">Creator</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            LangGraph + Ollama content agent &middot; research &rarr; draft
            &rarr; refine &rarr; polish &middot; every piece anchored to the
            full 9-agent ARC DAG + Lightning-settlable via Marketplace
          </p>
        </div>
        <Link href="/marketplace#demo">
          <Button
            variant="outline"
            className="gap-2 border-[#F43F5E]/20 text-[#F43F5E]/80 hover:border-[#F43F5E]/40 hover:text-[#F43F5E]"
          >
            <Gavel className="h-3.5 w-3.5" />
            Settle on Lightning
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>
        </Link>
      </div>

      {/* Content Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] content-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Format Selector */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-2 block">
                Content Format
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CONTENT_FORMATS.map((f) => {
                  const Icon = f.icon;
                  const active = f.key === contentFormat;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setContentFormat(f.key)}
                      className={`group relative flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all duration-200 ${
                        active
                          ? "border-[#F43F5E]/40 bg-[#F43F5E]/[0.06] shadow-[0_0_18px_rgba(244,63,94,0.18)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          active ? "text-[#F43F5E]" : "text-white/40"
                        }`}
                      />
                      <div>
                        <div
                          className={`text-[11px] font-semibold tracking-wide ${
                            active ? "text-[#F43F5E]" : "text-white/70"
                          }`}
                        >
                          {f.label}
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5 leading-snug">
                          {f.desc}
                        </div>
                      </div>
                      {active && (
                        <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#F43F5E] shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Prompt */}
            <div className="relative">
              <FileText className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the piece you want... (e.g., Write a high-signal Twitter thread explaining why Bitcoin-native agent provenance is the missing layer for the autonomous AI economy.)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#F43F5E]/30 focus:ring-1 focus:ring-[#F43F5E]/20 transition-all resize-none"
              />
            </div>

            {/* Audience + Price + Model */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Target className="h-2.5 w-2.5" />
                  Audience
                </label>
                <input
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#F43F5E]/30"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Wallet className="h-2.5 w-2.5" />
                  Price (sats)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10_000_000_000}
                  value={priceSats}
                  onChange={(e) =>
                    setPriceSats(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#F43F5E]/30"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Terminal className="h-2.5 w-2.5" />
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#F43F5E]/30"
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
                  <Layers className="h-3 w-3" /> 6 inscriptions / piece
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> 9-agent memrefs
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> BIP-340 signed
                </span>
              </div>
              <Button
                type="submit"
                disabled={!prompt.trim() || mutation.isPending}
                className="bg-[#F43F5E]/10 border border-[#F43F5E]/20 text-[#F43F5E] hover:bg-[#F43F5E]/20 disabled:opacity-30 content-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Writing...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate &amp; Inscribe
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
          <Card className="border-[#F43F5E]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#F43F5E]/20 border-t-[#F43F5E] animate-spin" />
                  <FileText className="absolute inset-0 m-auto h-5 w-5 text-[#F43F5E]/70" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Content agent researching, drafting, refining, and
                    anchoring...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; research &rarr; draft &rarr; refine &rarr;
                    polish &rarr; inscribe
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
                : "Content agent failed"}
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
                color: "#F43F5E",
              },
              {
                label: "DAG Refs",
                value: result.dag_memrefs.length,
                icon: Link2,
                color: "#a855f7",
              },
              {
                label: "Format",
                value: selectedFormat?.label || result.format_name,
                icon: FileText,
                color: "#38BDF8",
                isText: true,
              },
              {
                label: "Price",
                value: `${result.price_sats.toLocaleString()} sats`,
                icon: Wallet,
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
                    className={`${isText ? "text-sm" : "text-xl"} font-bold truncate`}
                    style={{ color }}
                  >
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Polished Content Preview (primary) */}
          <Card className="border-[#F43F5E]/15 bg-[#0a0a0a] overflow-hidden content-card-glow">
            <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
              <Sparkles className="h-4 w-4 text-[#F43F5E]" />
              <span className="text-sm font-medium text-[#F43F5E]">
                {result.format_name || "Content Draft"}
              </span>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F43F5E]/80 border-[#F43F5E]/30 px-1.5 uppercase"
              >
                {result.content_format}
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-white/50 border-white/20 px-1.5 uppercase"
              >
                {result.price_sats.toLocaleString()} sats
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyContent}
                  className="h-7 px-2 text-[10px]"
                >
                  {copiedContent ? (
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
              <div className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-6 max-h-[620px] overflow-y-auto content-preview-paper">
                {result.polished || result.refined || result.draft}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-white/25 font-mono flex-wrap">
                <span>
                  Audience:{" "}
                  <span className="text-white/50">
                    {result.audience || "\u2014"}
                  </span>
                </span>
                <span>
                  Format:{" "}
                  <span className="text-white/50">{result.format_name}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Generate & Inscribe */}
          <Card className="border-[#F43F5E]/15 bg-[#0a0a0a] content-card-glow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-3.5 w-3.5 text-[#F43F5E]/70" />
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                      Generate &amp; Inscribe on Bitcoin
                    </h4>
                  </div>
                  <p className="text-[11px] text-white/30">
                    Calls the ARC CLI inscription envelope, deep-verifies the
                    full content chain + 9-agent memrefs, and opens the
                    Lightning-settlement route via the Marketplace demo.
                  </p>
                </div>
                <GenerateInscribeButton
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
                          <Check className="h-3 w-3" /> FAIL
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
                      <span className="text-[#F43F5E]">
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

          {/* Research + Draft + Refined (collapsible) */}
          <OutputSection
            title="Research Memo"
            icon={Brain}
            color="#A855F7"
            content={result.research}
            defaultOpen
          />
          <OutputSection
            title="First Draft"
            icon={PenTool}
            color="#38BDF8"
            content={result.draft}
          />
          <OutputSection
            title="Editorial Refine Pass"
            icon={Target}
            color="#EAB308"
            content={result.refined}
          />

          {/* Provenance DAG */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-[#F43F5E]/70" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Content Creator Provenance Chain
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#F43F5E]/80 border-[#F43F5E]/25 px-1.5"
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
                        "repeating-linear-gradient(90deg, #F43F5E 0, #F43F5E 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[420px] border border-[#F43F5E]/20 rounded-xl overflow-hidden bg-[#020202] content-dag-glow">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#F43F5E]" />
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
                <Link2 className="h-3.5 w-3.5 text-[#F43F5E]/70" />
                <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                  Cross-Agent Attestation
                </h4>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  {
                    label: "arc-deep-research",
                    color: "#A855F7",
                    Icon: Brain,
                  },
                  { label: "arc-codegen", color: "#00F0FF", Icon: Code2 },
                  {
                    label: "arc-defi-trader",
                    color: "#22c55e",
                    Icon: TrendingUp,
                  },
                  { label: "arc-legal", color: "#EAB308", Icon: ScaleIcon },
                  { label: "arc-design", color: "#EC4899", Icon: ImageIcon },
                  { label: "arc-support", color: "#38BDF8", Icon: HelpCircle },
                  { label: "arc-compliance", color: "#10B981", Icon: Shield },
                  { label: "arc-data", color: "#6366F1", Icon: BarChart },
                  {
                    label: "arc-orchestrator",
                    color: "#F97316",
                    Icon: Network,
                  },
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
                Every content record memrefs the latest head of each certified
                agent + the seeded ARC DAG. Full 9-agent mesh provenance
                baked into one inscription.
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

      {/* Recent arc-content Inscriptions (seeded) — shown before submission */}
      {!result && !mutation.isPending && seedContentRecords.length > 0 && (
        <div className="space-y-4 anim-fade-up anim-delay-1">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Records",
                value: seedContentRecords.length,
                icon: Layers,
                color: "#F43F5E",
              },
              {
                label: "Agent",
                value: "arc-content",
                icon: FileText,
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
              <GitBranch className="h-3.5 w-3.5 text-[#F43F5E]/70" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Recent Content Creator Inscriptions
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F43F5E]/80 border-[#F43F5E]/25 px-1.5"
              >
                live seed chain
              </Badge>
            </div>
            <div className="h-[420px] border border-[#F43F5E]/20 rounded-xl overflow-hidden bg-[#020202] content-dag-glow">
              <Suspense
                fallback={<div className="h-full skeleton-shimmer rounded-xl" />}
              >
                <DAGViewer records={seedContentRecords} />
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
              ARC CLI &middot; Direct Content Inscription
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#F43F5E]/70">$</span>
                <code className="text-white/50">
                  cd backend &amp;&amp; python content_agent.py --format article
                  &quot;Why Bitcoin-native agent provenance is the missing
                  layer&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F43F5E]/70">$</span>
                <code className="text-white/50">
                  python content_agent.py --format twitter_thread --sats 6500
                  &quot;12-tweet intro to ARC Protocol&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F43F5E]/70">$</span>
                <code className="text-white/50">arc view-chain RECORD_ID</code>
                <span className="text-white/15 ml-auto">view provenance</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F43F5E]/70">$</span>
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
