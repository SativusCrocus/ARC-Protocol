"use client";

import { useState, Suspense, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Code2,
  Zap,
  GitBranch,
  Brain,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  FileText,
  Target,
  Eye,
  ChevronDown,
  ChevronUp,
  Share2,
  Terminal,
} from "lucide-react";
import type { CodegenResult, RecordWithId } from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false }
);

// ── Languages ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "bash", label: "Bash" },
  { value: "solidity", label: "Solidity" },
  { value: "ruby", label: "Ruby" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
];

// ── Step Indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "plan", label: "Plan", icon: Target, color: "#00F0FF" },
  { key: "generate", label: "Generate", icon: Code2, color: "#a855f7" },
  { key: "review", label: "Review", icon: Eye, color: "#22c55e" },
  { key: "inscribe", label: "Inscribe", icon: GitBranch, color: "#F7931A" },
];

function StepIndicator({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center gap-1">
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
                className={`w-4 h-px mx-0.5 transition-all ${isDone ? "bg-white/20" : "bg-white/[0.04]"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────────────

function OutputSection({
  title,
  icon: Icon,
  color,
  content,
  defaultOpen = false,
  isCode = false,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  content: string;
  defaultOpen?: boolean;
  isCode?: boolean;
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
          <div
            className={`text-[13px] leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-4 max-h-[500px] overflow-y-auto ${
              isCode
                ? "text-emerald-300/80 bg-emerald-500/[0.03] border border-emerald-500/10"
                : "text-white/60 bg-white/[0.02]"
            }`}
          >
            {content}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Inscribe & Share Button ─────────────────────────────────────────────────

function InscribeShareButton({
  result,
}: {
  result: CodegenResult;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    const arcCmd = result.inscription_cmd;
    const shareText = [
      `ARC Code Generator - Inscribed on Bitcoin`,
      ``,
      `ARC ID: ${result.final_id}`,
      `Language: ${result.language}`,
      `Prompt: ${result.prompt}`,
      `Records: ${result.record_ids.length}`,
      `DAG Refs: ${result.dag_memrefs.length}`,
      ``,
      `Inscription Command:`,
      arcCmd,
      ``,
      `Agent: ${result.agent_pubkey}`,
    ].join("\n");

    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [result]);

  return (
    <Button
      onClick={handleClick}
      className="bg-[#F7931A]/10 border border-[#F7931A]/30 text-[#F7931A] hover:bg-[#F7931A]/20 transition-all"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-emerald-400" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 mr-2" />
          Inscribe & Share
        </>
      )}
    </Button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CodegenPage() {
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("python");
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<CodegenResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { prompt: string; language: string; model: string }) =>
      api.codegen(data),
    onSuccess: (data) => setResult(data),
  });

  const chainQuery = useQuery({
    queryKey: ["codegen-chain", result?.final_id],
    queryFn: () => api.codegenChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  const allRecords: RecordWithId[] = [
    ...(chainQuery.data?.chain || result?.chain || []),
    ...(chainQuery.data?.memref_records || []),
  ];

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || mutation.isPending) return;
      setResult(null);
      mutation.mutate({ prompt: prompt.trim(), language, model });
    },
    [prompt, language, model, mutation]
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  const copyCode = useCallback(() => {
    if (result?.code) {
      navigator.clipboard.writeText(result.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }, [result]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span className="text-[#a855f7] text-glow-purple">Code</span>{" "}
          <span className="text-white/90">Generator</span>
        </h2>
        <p className="text-white/25 text-sm mt-2">
          LangGraph + Ollama agent &middot; every generated script inscribed via
          ARC Protocol &middot; memrefs to Marketplace + Research
        </p>
      </div>

      {/* Prompt Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] codegen-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Prompt Input */}
            <div className="relative">
              <Code2 className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the code you want to generate... (e.g., Bitcoin mempool fee monitor with alerts)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#a855f7]/30 focus:ring-1 focus:ring-[#a855f7]/20 transition-all resize-none"
              />
            </div>

            {/* Language + Model Selectors */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 block">
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#a855f7]/30"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 block">
                  Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#a855f7]/30"
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-white/20">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" /> LangGraph pipeline
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> 4 inscriptions per gen
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Cross-agent memrefs
                </span>
              </div>
              <Button
                type="submit"
                disabled={!prompt.trim() || mutation.isPending}
                className="bg-[#a855f7]/10 border border-[#a855f7]/20 text-[#a855f7] hover:bg-[#a855f7]/20 disabled:opacity-30 codegen-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Code2 className="h-4 w-4 mr-2" />
                    Generate Code
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
          <Card className="border-[#a855f7]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#a855f7]/20 border-t-[#a855f7] animate-spin" />
                  <Code2 className="absolute inset-0 m-auto h-5 w-5 text-[#a855f7]/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Code generation agent running...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; plan &rarr; generate &rarr; review &rarr;
                    inscribe
                  </p>
                </div>
                <StepIndicator activeStep={2} />
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
                : "Code generation failed"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 anim-fade-up">
          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "Records",
                value: result.record_ids.length,
                icon: Layers,
                color: "#F7931A",
              },
              {
                label: "DAG Refs",
                value: result.dag_memrefs.length,
                icon: Link2,
                color: "#a855f7",
              },
              {
                label: "Pipeline Steps",
                value: 4,
                icon: GitBranch,
                color: "#00F0FF",
              },
              {
                label: "Inscribed",
                value: result.final_id ? 1 : 0,
                icon: Check,
                color: "#22c55e",
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="border-white/[0.04] bg-[#0a0a0a]">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon
                      className="h-3 w-3"
                      style={{ color: `${color}80` }}
                    />
                    <span className="text-[9px] text-white/25 uppercase tracking-wider">
                      {label}
                    </span>
                  </div>
                  <p className="text-xl font-bold" style={{ color }}>
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Generated Code (primary output) */}
          <Card className="border-emerald-500/10 bg-[#0a0a0a] overflow-hidden">
            <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
              <Code2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                Generated Code
              </span>
              <Badge
                variant="outline"
                className="text-[8px] text-[#a855f7]/60 border-[#a855f7]/20 px-1.5 uppercase"
              >
                {result.language}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyCode}
                  className="h-7 px-2 text-[10px]"
                >
                  {copiedCode ? (
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
            <CardContent className="p-4 pt-0 mt-4">
              <div className="text-[13px] text-emerald-300/80 leading-relaxed whitespace-pre-wrap font-mono bg-emerald-500/[0.03] border border-emerald-500/10 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                {result.code}
              </div>
            </CardContent>
          </Card>

          {/* Inscribe & Share */}
          <Card className="border-[#F7931A]/10 bg-[#0a0a0a]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Share2 className="h-3.5 w-3.5 text-[#F7931A]/50" />
                    <h4 className="text-xs text-white/30 uppercase tracking-wider">
                      Inscribe & Share
                    </h4>
                  </div>
                  <p className="text-[11px] text-white/20">
                    Copy the arc.py inscription command + ARC ID for sharing
                  </p>
                </div>
                <InscribeShareButton result={result} />
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Steps */}
          <OutputSection
            title="Architecture Plan"
            icon={Target}
            color="#00F0FF"
            content={result.plan}
          />
          <OutputSection
            title="Code Review"
            icon={Eye}
            color="#22c55e"
            content={result.review}
            defaultOpen
          />

          {/* Provenance DAG */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-3.5 w-3.5 text-[#F7931A]/50" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Codegen Provenance Chain
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#a855f7]/60 border-[#a855f7]/20 px-1.5"
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
                        "repeating-linear-gradient(90deg, #F7931A 0, #F7931A 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[400px] border border-[#a855f7]/10 rounded-xl overflow-hidden bg-[#020202] codegen-dag-glow">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#a855f7]" />
                </div>
              )}
            </div>
          </div>

          {/* Inscription Command */}
          {result.inscription_cmd && (
            <Card className="border-[#F7931A]/10 bg-[#0a0a0a]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-3.5 w-3.5 text-[#F7931A]/50" />
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
                <code className="block text-[10px] text-[#F7931A]/60 bg-[#F7931A]/5 px-3 py-2.5 rounded-lg font-mono break-all max-h-[100px] overflow-y-auto">
                  {result.inscription_cmd}
                </code>
              </CardContent>
            </Card>
          )}

          {/* Inscription Status */}
          <Card className="border-white/[0.04] bg-[#0a0a0a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-3.5 w-3.5 text-emerald-400/50" />
                <h4 className="text-xs text-white/30 uppercase tracking-wider">
                  Inscription Status
                </h4>
              </div>
              <div className="grid grid-cols-3 gap-4 text-[11px]">
                <div>
                  <span className="text-white/20 block mb-0.5">ARC Record</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Signed & Stored
                  </span>
                </div>
                <div>
                  <span className="text-white/20 block mb-0.5">Chain Valid</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> {result.record_ids.length} records verified
                  </span>
                </div>
                <div>
                  <span className="text-white/20 block mb-0.5">Global Index</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Visible on Dashboard
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agent Info */}
          <div className="flex items-center gap-4 text-[10px] text-white/15 font-mono">
            <span>agent: {result.agent_pubkey?.slice(0, 24)}...</span>
            <span>final: {result.final_id?.slice(0, 20)}...</span>
            <span>
              records: {result.record_ids.length} | dag_refs:{" "}
              {result.dag_memrefs.length}
            </span>
          </div>
        </div>
      )}

      {/* CLI Reference */}
      {!result && !mutation.isPending && (
        <Card className="border-white/[0.04] bg-[#0a0a0a] anim-fade-up anim-delay-2">
          <CardContent className="p-4">
            <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
              ARC CLI &middot; Direct Codegen
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  cd backend && python codegen_agent.py &quot;Bitcoin fee
                  monitor&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  python codegen_agent.py --lang rust --model mistral &quot;TCP
                  echo server&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  arc view-chain RECORD_ID
                </code>
                <span className="text-white/15 ml-auto">view provenance</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
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
