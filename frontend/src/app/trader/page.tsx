"use client";

import { useState, Suspense, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Zap,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  FileText,
  Target,
  Shield,
  BarChart3,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crosshair,
  DollarSign,
  Clock,
  Percent,
} from "lucide-react";
import type { TraderResult, RecordWithId } from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false }
);

// ── Pipeline Steps ──────────────────────────────────────────────────────────

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "scan", label: "Scan", icon: Activity, color: "#00F0FF" },
  { key: "analyze", label: "Analyze", icon: BarChart3, color: "#a855f7" },
  { key: "signal", label: "Signal", icon: Crosshair, color: "#22c55e" },
  { key: "risk", label: "Risk", icon: Shield, color: "#eab308" },
  { key: "execute", label: "Execute", icon: Target, color: "#f43f5e" },
  { key: "settle", label: "Settle", icon: Zap, color: "#F7931A" },
  { key: "inscribe", label: "Inscribe", icon: GitBranch, color: "#00F0FF" },
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
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-all duration-300 ${
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
                className={`w-3 h-px mx-0.5 transition-all ${isDone ? "bg-white/20" : "bg-white/[0.04]"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Collapsible Output Section ──────────────────────────────────────────────

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

// ── Main Page ───────────────────────────────────────────────────────────────

export default function TraderPage() {
  const [marketPrompt, setMarketPrompt] = useState("");
  const [pair, setPair] = useState("BTC/USD");
  const [timeframe, setTimeframe] = useState("4h");
  const [maxRiskPct, setMaxRiskPct] = useState(2.0);
  const [maxPositionSats, setMaxPositionSats] = useState(1000000);
  const [signalFeeSats, setSignalFeeSats] = useState(1000);
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<TraderResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: {
      market_prompt: string;
      pair: string;
      timeframe: string;
      max_risk_pct: number;
      max_position_sats: number;
      signal_fee_sats: number;
      model: string;
    }) => api.trader(data),
    onSuccess: (data) => setResult(data),
  });

  // Fetch full chain + memref records for the DAG viewer
  const chainQuery = useQuery({
    queryKey: ["trader-chain", result?.final_id],
    queryFn: () => api.traderChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  const allRecords: RecordWithId[] = [
    ...(chainQuery.data?.chain || result?.chain || []),
    ...(chainQuery.data?.memref_records || []),
  ];

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!marketPrompt.trim() || mutation.isPending) return;
      setResult(null);
      mutation.mutate({
        market_prompt: marketPrompt.trim(),
        pair,
        timeframe,
        max_risk_pct: maxRiskPct,
        max_position_sats: maxPositionSats,
        signal_fee_sats: signalFeeSats,
        model,
      });
    },
    [marketPrompt, pair, timeframe, maxRiskPct, maxPositionSats, signalFeeSats, model, mutation]
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span className="text-[#22c55e] text-glow-green">DeFi</span>{" "}
          <span className="text-white/90">Trader</span>
        </h2>
        <p className="text-white/25 text-sm mt-2">
          Autonomous trading agent &middot; LangGraph + Ollama &middot; Lightning
          settlement &middot; full ARC provenance chain
        </p>
      </div>

      {/* Trade Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] trader-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Market Prompt */}
            <div className="relative">
              <TrendingUp className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={marketPrompt}
                onChange={(e) => setMarketPrompt(e.target.value)}
                placeholder="Enter market analysis prompt... (e.g., Analyze BTC/USD for swing trade entries near $97k support)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#22c55e]/30 focus:ring-1 focus:ring-[#22c55e]/20 transition-all resize-none"
              />
            </div>

            {/* Parameters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Pair */}
              <div>
                <label className="text-[9px] text-white/25 uppercase tracking-wider mb-1 block">
                  Pair
                </label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none focus:border-[#22c55e]/30"
                >
                  <option value="BTC/USD">BTC/USD</option>
                  <option value="ETH/USD">ETH/USD</option>
                  <option value="ETH/BTC">ETH/BTC</option>
                  <option value="SOL/USD">SOL/USD</option>
                  <option value="BTC/USDT">BTC/USDT</option>
                  <option value="ETH/USDT">ETH/USDT</option>
                </select>
              </div>

              {/* Timeframe */}
              <div>
                <label className="text-[9px] text-white/25 uppercase tracking-wider mb-1 block">
                  Timeframe
                </label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none focus:border-[#22c55e]/30"
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1D</option>
                  <option value="1w">1W</option>
                </select>
              </div>

              {/* Max Risk */}
              <div>
                <label className="text-[9px] text-white/25 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Percent className="h-2.5 w-2.5" /> Max Risk
                </label>
                <input
                  type="number"
                  value={maxRiskPct}
                  onChange={(e) => setMaxRiskPct(Number(e.target.value))}
                  min={0.1}
                  max={100}
                  step={0.5}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none focus:border-[#22c55e]/30"
                />
              </div>

              {/* Max Position */}
              <div>
                <label className="text-[9px] text-white/25 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <DollarSign className="h-2.5 w-2.5" /> Max Pos (sats)
                </label>
                <input
                  type="number"
                  value={maxPositionSats}
                  onChange={(e) => setMaxPositionSats(Number(e.target.value))}
                  min={1000}
                  step={100000}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none focus:border-[#22c55e]/30"
                />
              </div>

              {/* Signal Fee */}
              <div>
                <label className="text-[9px] text-white/25 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Zap className="h-2.5 w-2.5" /> Signal Fee (sats)
                </label>
                <input
                  type="number"
                  value={signalFeeSats}
                  onChange={(e) => setSignalFeeSats(Number(e.target.value))}
                  min={1}
                  step={100}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none focus:border-[#22c55e]/30"
                />
              </div>

              {/* Model */}
              <div>
                <label className="text-[9px] text-white/25 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/50 focus:outline-none focus:border-[#22c55e]/30"
                >
                  <option value="llama3.1:8b">llama3.1:8b</option>
                  <option value="llama3.2">llama3.2</option>
                  <option value="qwen2.5:14b">qwen2.5:14b</option>
                  <option value="qwen3:14b">qwen3:14b</option>
                  <option value="mistral">mistral</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] text-white/20">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" /> 8-step pipeline
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> 7 inscriptions
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Cross-agent memrefs
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Lightning settle
                </span>
              </div>
              <Button
                type="submit"
                disabled={!marketPrompt.trim() || mutation.isPending}
                className="bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/20 disabled:opacity-30 trader-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Trading...
                  </>
                ) : (
                  <>
                    <Crosshair className="h-4 w-4 mr-2" />
                    Execute &amp; Inscribe
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
          <Card className="border-[#22c55e]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#22c55e]/20 border-t-[#22c55e] animate-spin" />
                  <TrendingUp className="absolute inset-0 m-auto h-5 w-5 text-[#22c55e]/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Trader agent running...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; scan &rarr; analyze &rarr; signal &rarr; risk
                    &rarr; execute &rarr; settle &rarr; inscribe
                  </p>
                </div>
                <StepIndicator activeStep={4} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error */}
      {mutation.isError && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Trade signal generation failed"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 anim-fade-up">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
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
                label: "Steps",
                value: 7,
                icon: GitBranch,
                color: "#00F0FF",
              },
              {
                label: "Pair",
                value: result.pair,
                icon: TrendingUp,
                color: "#22c55e",
                isText: true,
              },
              {
                label: "Signal Fee",
                value: `${result.signal_fee_sats}`,
                icon: Zap,
                color: "#eab308",
                isText: true,
              },
              {
                label: "Settled",
                value: result.settlement_id ? 1 : 0,
                icon: Check,
                color: "#f43f5e",
              },
            ].map(({ label, value, icon: Icon, color, isText }) => (
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

          {/* Signal (primary output) */}
          <OutputSection
            title="Trade Signal"
            icon={Crosshair}
            color="#22c55e"
            content={result.signal}
            defaultOpen
          />

          {/* Risk Assessment */}
          <OutputSection
            title="Risk Assessment"
            icon={Shield}
            color="#eab308"
            content={result.risk_assessment}
            defaultOpen
          />

          {/* Pipeline Steps */}
          <OutputSection
            title="Market Scan"
            icon={Activity}
            color="#00F0FF"
            content={result.scan}
          />
          <OutputSection
            title="Technical Analysis"
            icon={BarChart3}
            color="#a855f7"
            content={result.analysis}
          />
          <OutputSection
            title="Execution Plan"
            icon={Target}
            color="#f43f5e"
            content={result.execution_plan}
          />

          {/* Lightning Settlement */}
          {result.settlement_id && (
            <Card className="border-[#eab308]/10 bg-[#0a0a0a] overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-[#eab308]" />
                  <h4 className="text-sm font-medium text-[#eab308]">
                    Lightning Settlement
                  </h4>
                  <Badge
                    variant="outline"
                    className="text-[8px] text-[#22c55e]/60 border-[#22c55e]/20 px-1.5 ml-auto"
                  >
                    PAID
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] font-mono">
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <span className="text-white/25 block mb-1">Amount</span>
                    <span className="text-[#eab308]">
                      {result.signal_fee_sats} sats
                    </span>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <span className="text-white/25 block mb-1">
                      Payment Hash
                    </span>
                    <span className="text-white/50 break-all">
                      {result.settlement_hash?.slice(0, 32)}...
                    </span>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <span className="text-white/25 block mb-1">Preimage</span>
                    <span className="text-white/50 break-all">
                      {result.settlement_preimage?.slice(0, 32)}...
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Provenance DAG Viewer */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-3.5 w-3.5 text-[#22c55e]/50" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Trade Provenance Chain
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
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-4 h-px"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, #22c55e 0, #22c55e 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[450px] border border-[#22c55e]/10 rounded-xl overflow-hidden bg-[#020202] trader-dag-glow">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#22c55e]" />
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
          <div className="flex items-center gap-4 text-[10px] text-white/15 font-mono flex-wrap">
            <span>agent: {result.agent_pubkey?.slice(0, 24)}...</span>
            <span>final: {result.final_id?.slice(0, 20)}...</span>
            <span>
              records: {result.record_ids.length} | dag_refs:{" "}
              {result.dag_memrefs.length} | settled:{" "}
              {result.signal_fee_sats} sats
            </span>
          </div>
        </div>
      )}

      {/* How to use */}
      {!result && !mutation.isPending && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 anim-fade-up anim-delay-2">
          <Card className="border-white/[0.04] bg-[#0a0a0a]">
            <CardContent className="p-4">
              <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
                ARC CLI &middot; Direct Trading
              </h4>
              <div className="space-y-2 text-[11px] font-mono">
                <div className="flex items-start gap-2">
                  <span className="text-[#22c55e]/50">$</span>
                  <code className="text-white/50">
                    cd backend && python trader_agent.py &quot;BTC swing trade
                    near 97k support&quot;
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#22c55e]/50">$</span>
                  <code className="text-white/50">
                    python trader_agent.py --pair ETH/USD --model mistral
                    &quot;ETH breakout analysis&quot;
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#22c55e]/50">$</span>
                  <code className="text-white/50">
                    arc view-chain RECORD_ID
                  </code>
                  <span className="text-white/15 ml-auto">provenance</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#22c55e]/50">$</span>
                  <code className="text-white/50">
                    arc validate RECORD_ID --deep
                  </code>
                  <span className="text-white/15 ml-auto">verify</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/[0.04] bg-[#0a0a0a]">
            <CardContent className="p-4">
              <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
                Pipeline Architecture
              </h4>
              <div className="space-y-1.5 text-[11px]">
                {STEPS.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-2">
                    <step.icon
                      className="h-3 w-3"
                      style={{ color: step.color }}
                    />
                    <span className="text-white/40 font-mono w-16">
                      {step.label}
                    </span>
                    <span className="text-white/20">
                      {
                        [
                          "Load agent identity, discover DAG records",
                          "Scan market structure + on-chain metrics",
                          "Multi-TF technical analysis + levels",
                          "Generate structured LONG/SHORT/HOLD signal",
                          "Position sizing, Kelly criterion, drawdown",
                          "Order type, venue, slippage, contingencies",
                          "Lightning settlement for paid signal",
                          "Bitcoin inscription + full chain output",
                        ][i]
                      }
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
