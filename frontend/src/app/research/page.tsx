"use client";

import { useState, Suspense, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
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
  Microscope,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ResearchResult, RecordWithId } from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false }
);

// ── Step Indicator ────────────────────────────────────────────────────────────

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "plan", label: "Plan", icon: Target, color: "#00F0FF" },
  { key: "research", label: "Research", icon: Microscope, color: "#a855f7" },
  { key: "analyze", label: "Analyze", icon: Brain, color: "#22c55e" },
  { key: "synthesize", label: "Synthesize", icon: Lightbulb, color: "#eab308" },
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

// ── Collapsible Section ───────────────────────────────────────────────────────

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
          <div className="text-[13px] text-white/60 leading-relaxed whitespace-pre-wrap font-mono bg-white/[0.02] rounded-lg p-4 max-h-[400px] overflow-y-auto">
            {content}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { query: string; model: string }) => api.research(data),
    onSuccess: (data) => setResult(data),
  });

  // Fetch full chain + memref records for the DAG viewer
  const chainQuery = useQuery({
    queryKey: ["research-chain", result?.final_id],
    queryFn: () => api.researchChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  const allRecords: RecordWithId[] = [
    ...(chainQuery.data?.chain || result?.chain || []),
    ...(chainQuery.data?.memref_records || []),
  ];

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || mutation.isPending) return;
      setResult(null);
      mutation.mutate({ query: query.trim(), model });
    },
    [query, model, mutation]
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  const activeStep = mutation.isPending
    ? -1
    : result
      ? STEPS.length
      : -1;

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span className="text-[#00F0FF] text-glow-cyan">Deep</span>{" "}
          <span className="text-white/90">Research</span>
        </h2>
        <p className="text-white/25 text-sm mt-2">
          LangGraph + Ollama agent &middot; every output inscribed via ARC
          Protocol &middot; memrefs to Memory DAG
        </p>
      </div>

      {/* Search Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a]">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter research query... (e.g., Bitcoin Taproot adoption for AI agent identity)"
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#00F0FF]/30 focus:ring-1 focus:ring-[#00F0FF]/20 transition-all"
                />
              </div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none"
              >
                <option value="llama3.1:8b">llama3.1:8b</option>
                <option value="llama3.2">llama3.2</option>
                <option value="qwen2.5:14b">qwen2.5:14b</option>
                <option value="qwen3:14b">qwen3:14b</option>
                <option value="mistral">mistral</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-white/20">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" /> LangGraph pipeline
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> 5 inscriptions per query
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Memory DAG memrefs
                </span>
              </div>
              <Button
                type="submit"
                disabled={!query.trim() || mutation.isPending}
                className="bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] hover:bg-[#00F0FF]/20 disabled:opacity-30"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Run Deep Research
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
          <Card className="border-[#00F0FF]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#00F0FF]/20 border-t-[#00F0FF] animate-spin" />
                  <Brain className="absolute inset-0 m-auto h-5 w-5 text-[#00F0FF]/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Research agent running...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; plan &rarr; research &rarr; analyze &rarr;
                    synthesize &rarr; inscribe
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
                : "Research failed"}
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
                value: 5,
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

          {/* Synthesis (primary output) */}
          <OutputSection
            title="Synthesis — Final Output"
            icon={Lightbulb}
            color="#eab308"
            content={result.synthesis}
            defaultOpen
          />

          {/* Pipeline Steps */}
          <OutputSection
            title="Research Plan"
            icon={Target}
            color="#00F0FF"
            content={result.plan}
          />
          <OutputSection
            title="Deep Research"
            icon={Microscope}
            color="#a855f7"
            content={result.research}
          />
          <OutputSection
            title="Analysis"
            icon={Brain}
            color="#22c55e"
            content={result.analysis}
          />

          {/* Live Chain Viewer */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-3.5 w-3.5 text-[#F7931A]/50" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Research Provenance Chain
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#a855f7]/60 border-[#a855f7]/20 px-1.5"
                >
                  {result.dag_memrefs.length} Memory DAG refs
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
            <div className="h-[400px] border border-white/[0.04] rounded-xl overflow-hidden bg-[#020202]">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#00F0FF]" />
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

          {/* Agent Info */}
          <div className="flex items-center gap-4 text-[10px] text-white/15 font-mono">
            <span>
              agent: {result.agent_pubkey?.slice(0, 24)}...
            </span>
            <span>final: {result.final_id?.slice(0, 20)}...</span>
            <span>
              records: {result.record_ids.length} | dag_refs:{" "}
              {result.dag_memrefs.length}
            </span>
          </div>
        </div>
      )}

      {/* How to use */}
      {!result && !mutation.isPending && (
        <Card className="border-white/[0.04] bg-[#0a0a0a] anim-fade-up anim-delay-2">
          <CardContent className="p-4">
            <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
              ARC CLI &middot; Direct Research
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  cd backend && python research_agent.py &quot;Bitcoin Taproot
                  adoption&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  python research_agent.py --model mistral &quot;Lightning
                  Network routing&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  arc view-chain RECORD_ID
                </code>
                <span className="text-white/15 ml-auto">
                  view provenance
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F7931A]/50">$</span>
                <code className="text-white/50">
                  arc validate RECORD_ID --deep
                </code>
                <span className="text-white/15 ml-auto">
                  verify chain
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
