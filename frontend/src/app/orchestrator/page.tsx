"use client";

import { useState, Suspense, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  gooseApi,
  type GooseAgent,
  type GooseActivityEvent,
  type GooseDispatchResult,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Network,
  Zap,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  FileText,
  ChevronDown,
  ChevronUp,
  Gavel,
  ExternalLink,
  Terminal,
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
  Rocket,
  Bot,
  Clock,
  PlayCircle,
  Radio,
  Megaphone,
  Wallet,
  Lock,
} from "lucide-react";
import type {
  OrchestratorResult,
  OrchestratorVerifyResult,
  RecordWithId,
  LiveSpawnResult,
  OrchestratorSpawnedChild,
} from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false },
);

// ── Child Agent Catalog (mirrors backend/orchestrator_agent.py CHILD_AGENTS) ─

const CHILD_AGENTS = [
  { key: "research", name: "Deep Research", icon: Brain, color: "#A855F7", role: "research specialist" },
  { key: "codegen", name: "Code Generator", icon: Code2, color: "#00F0FF", role: "code generation specialist" },
  { key: "trader", name: "DeFi Trader", icon: TrendingUp, color: "#22c55e", role: "DeFi trading specialist" },
  { key: "legal", name: "Legal Contracts", icon: ScaleIcon, color: "#EAB308", role: "legal drafting specialist" },
  { key: "design", name: "Design & Images", icon: ImageIcon, color: "#EC4899", role: "generative design specialist" },
  { key: "support", name: "Customer Support", icon: HelpCircle, color: "#38BDF8", role: "customer support specialist" },
  { key: "compliance", name: "Compliance & Audit", icon: Shield, color: "#10B981", role: "compliance audit specialist" },
  { key: "data", name: "Data Analysis", icon: BarChart, color: "#6366F1", role: "data analysis specialist" },
] as const;

// Extra live-spawn catalog (mirrors backend EXTRA_CHILD_AGENTS)
const EXTRA_CHILD_AGENTS = [
  { key: "marketing", name: "Marketing Agent", icon: Megaphone, color: "#F43F5E", role: "marketing + growth specialist" },
  { key: "finance", name: "Finance Agent", icon: Wallet, color: "#14B8A6", role: "finance + treasury specialist" },
  { key: "security", name: "Security Agent", icon: Lock, color: "#EF4444", role: "security + red-team specialist" },
  { key: "ops", name: "Ops Agent", icon: Activity, color: "#3B82F6", role: "ops + infra specialist" },
  { key: "product", name: "Product Agent", icon: Sparkles, color: "#F59E0B", role: "product + PRD specialist" },
  { key: "community", name: "Community Agent", icon: Radio, color: "#D946EF", role: "community + relay specialist" },
] as const;

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "due now";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtRelTs(ts: number): string {
  if (!ts) return "never";
  const d = Date.now() / 1000 - ts;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F97316" },
  { key: "plan", label: "Plan", icon: FileText, color: "#A855F7" },
  { key: "spawn", label: "Spawn", icon: Rocket, color: "#F97316" },
  { key: "dispatch", label: "Dispatch", icon: Activity, color: "#00F0FF" },
  { key: "aggregate", label: "Aggregate", icon: Sparkles, color: "#EAB308" },
  { key: "inscribe", label: "Inscribe", icon: GitBranch, color: "#F97316" },
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

// ── Spawn & Inscribe Button (one-click ARC CLI + verify) ────────────────────

function SpawnInscribeButton({
  result,
  onVerified,
}: {
  result: OrchestratorResult;
  onVerified: (v: OrchestratorVerifyResult) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.orchestratorVerify(result.final_id),
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
      className="bg-[#F97316]/10 border border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/20 orch-btn-glow transition-all"
    >
      {verifying || verify.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Inscribing...
        </>
      ) : copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-emerald-400" />
          Spawn Inscribed
        </>
      ) : (
        <>
          <Rocket className="h-4 w-4 mr-2" />
          Spawn &amp; Inscribe
        </>
      )}
    </Button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

// ── Goose Runtime Panel ──────────────────────────────────────────────
// Talks to the new Goose-powered orchestrator service (separate from the
// cron-based backend orchestrator below). Every dispatch here produces a
// real ARC record via the ARC MCP server wired into the Goose session.

function GooseRuntimePanel() {
  const [task, setTask] = useState("");
  const [targetAgent, setTargetAgent] = useState<string>("");
  const [events, setEvents] = useState<GooseActivityEvent[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const healthQuery = useQuery({
    queryKey: ["goose-health"],
    queryFn: gooseApi.health,
    refetchInterval: 15_000,
    retry: false,
  });

  const agentsQuery = useQuery({
    queryKey: ["goose-agents"],
    queryFn: gooseApi.agents,
    enabled: !!healthQuery.data?.ok,
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ task, agent }: { task: string; agent?: string }) =>
      gooseApi.dispatch(task, agent || undefined),
  });

  // Seed events list from REST on first connect so late subscribers aren't blind.
  useEffect(() => {
    if (!healthQuery.data?.ok) return;
    gooseApi
      .activity(50)
      .then((list) => setEvents(list))
      .catch(() => {});
  }, [healthQuery.data?.ok]);

  // Live WebSocket stream of ActivityEvents.
  useEffect(() => {
    if (!healthQuery.data?.ok) return;
    if (typeof window === "undefined") return;
    let cancelled = false;
    const url = gooseApi.streamURL();
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => !cancelled && setWsConnected(true);
      ws.onclose = () => !cancelled && setWsConnected(false);
      ws.onerror = () => !cancelled && setWsConnected(false);
      ws.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as GooseActivityEvent;
          setEvents((prev) => [...prev.slice(-199), ev]);
        } catch {
          // ignore malformed frames
        }
      };
      return () => {
        cancelled = true;
        ws.close();
      };
    } catch {
      return () => {
        cancelled = true;
      };
    }
  }, [healthQuery.data?.ok]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!task.trim() || dispatchMutation.isPending) return;
      dispatchMutation.mutate({
        task: task.trim(),
        agent: targetAgent || undefined,
      });
    },
    [task, targetAgent, dispatchMutation],
  );

  const health = healthQuery.data;
  const agents = agentsQuery.data || [];
  const serviceDown = healthQuery.isError || (!healthQuery.isLoading && !health?.ok);

  return (
    <Card className="border-[#F97316]/30 bg-[#0a0a0a] orch-card-glow">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Sparkles className="h-3.5 w-3.5 text-[#F97316]" />
              <h4 className="text-xs text-white/60 uppercase tracking-wider font-medium">
                Goose Runtime
              </h4>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F97316]/80 border-[#F97316]/30 px-1.5 uppercase"
              >
                mcp-wired
              </Badge>
              {health?.dry_run && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-yellow-400/80 border-yellow-400/30 px-1.5 uppercase"
                >
                  dry run
                </Badge>
              )}
              {health?.goose_available === false && !health?.dry_run && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-red-400/80 border-red-400/30 px-1.5 uppercase"
                >
                  goose missing
                </Badge>
              )}
              <Badge
                variant="outline"
                className={`text-[8px] px-1.5 uppercase ${
                  wsConnected
                    ? "text-emerald-400/80 border-emerald-400/30"
                    : "text-white/40 border-white/20"
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                    wsConnected ? "bg-emerald-400 animate-pulse" : "bg-white/30"
                  }`}
                />
                {wsConnected ? "live" : "offline"}
              </Badge>
            </div>
            <p className="text-[11px] text-white/40">
              Dispatch real tasks to Goose-backed ARC agents. Each run spawns a
              short-lived session wired into the ARC MCP server; every tool
              call the agent makes becomes a signed ARC record.
            </p>
          </div>
          <div className="text-[10px] text-white/30 font-mono text-right">
            <div>{agents.length} agents loaded</div>
            {health?.arc_api_url && (
              <div className="truncate max-w-[240px]">arc → {health.arc_api_url}</div>
            )}
          </div>
        </div>

        {serviceDown && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-400/80">
            Goose orchestrator service unreachable. Start it with{" "}
            <code className="font-mono text-red-300/90">cd orchestrator && arc-orchestrator</code>{" "}
            or bring up the docker-compose <code>orchestrator</code> service on
            port 8100.
          </div>
        )}

        {/* Dispatch form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task... e.g. 'Summarize the last 24h of Lightning HTLC timeout research' or 'Draft a services NDA jurisdiction-neutral'"
            rows={3}
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#F97316]/40 focus:ring-1 focus:ring-[#F97316]/20 transition-all resize-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value)}
              disabled={agents.length === 0}
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-[#F97316]/30 min-w-[220px]"
            >
              <option value="">Auto-route via meta-agent</option>
              {agents.map((a: GooseAgent) => (
                <option key={a.agent_name} value={a.agent_name}>
                  {a.display_name} ({a.trigger})
                </option>
              ))}
            </select>
            <Button
              type="submit"
              disabled={!task.trim() || dispatchMutation.isPending || serviceDown}
              className="bg-[#F97316]/10 border border-[#F97316]/30 text-[#F97316] hover:bg-[#F97316]/20 disabled:opacity-30 orch-btn-glow"
            >
              {dispatchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Dispatching...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Dispatch Task
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Last dispatch result */}
        {dispatchMutation.data && (
          <DispatchResultCard result={dispatchMutation.data} />
        )}
        {dispatchMutation.isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-400/80">
            {dispatchMutation.error instanceof Error
              ? dispatchMutation.error.message
              : "Dispatch failed"}
          </div>
        )}

        {/* Agent roster */}
        {agents.length > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2 flex items-center gap-2">
              <Bot className="h-2.5 w-2.5" /> Loaded agents
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
              {agents.map((a) => (
                <div
                  key={a.agent_name}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[10px]"
                  style={{ borderColor: `${a.color}33` }}
                >
                  <div
                    className="font-medium truncate"
                    style={{ color: a.color }}
                  >
                    {a.display_name}
                  </div>
                  <div className="text-white/30 font-mono truncate">
                    {a.trigger}
                    {a.schedule ? ` · ${a.schedule}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity stream */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2 flex items-center gap-2">
            <Radio className="h-2.5 w-2.5" /> Live activity
            <Badge
              variant="outline"
              className="text-[8px] text-white/40 border-white/10 px-1.5"
            >
              {events.length}
            </Badge>
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-1 font-mono text-[10px]">
            {events.length === 0 && (
              <div className="text-white/25 italic">
                No activity yet — dispatch a task above.
              </div>
            )}
            {events
              .slice()
              .reverse()
              .map((ev, i) => (
                <div
                  key={`${ev.ts}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-white/[0.04] px-2 py-1"
                >
                  <span className="text-[#F97316]/80 uppercase tracking-wider shrink-0">
                    {ev.kind.split(".").slice(-1)[0]}
                  </span>
                  <span className="text-white/50 truncate">
                    {ev.agent || "—"}
                  </span>
                  <span className="ml-auto text-white/25 shrink-0">
                    {new Date(ev.ts * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DispatchResultCard({ result }: { result: GooseDispatchResult }) {
  const stdout = (result.goose?.stdout as string) || "";
  return (
    <div className="rounded-lg border border-[#F97316]/20 bg-[#F97316]/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] flex-wrap">
        <Check
          className={`h-3.5 w-3.5 ${result.ok ? "text-emerald-400" : "text-red-400"}`}
        />
        <span className={result.ok ? "text-emerald-400" : "text-red-400"}>
          {result.ok ? "dispatched" : "failed"}
        </span>
        <span className="text-white/50">→</span>
        <span className="text-[#F97316] font-mono">{result.agent}</span>
        {result.dry_run && (
          <Badge
            variant="outline"
            className="text-[8px] text-yellow-400/80 border-yellow-400/30 px-1.5 uppercase"
          >
            dry run
          </Badge>
        )}
        {result.new_head && (
          <span className="text-white/40 font-mono ml-auto">
            head {result.new_head.slice(0, 16)}…
          </span>
        )}
      </div>
      {result.error && (
        <div className="text-[10px] text-red-400/80 font-mono">
          {result.error}
        </div>
      )}
      {stdout && (
        <pre className="text-[10px] text-white/60 bg-black/30 rounded p-2 max-h-[180px] overflow-y-auto font-mono whitespace-pre-wrap">
          {stdout.slice(0, 1200)}
        </pre>
      )}
    </div>
  );
}

export default function OrchestratorPage() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<string[]>([
    "research",
    "codegen",
    "compliance",
    "data",
  ]);
  const [model, setModel] = useState("llama3.1:8b");
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [verification, setVerification] =
    useState<OrchestratorVerifyResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  // Live spawn + schedule state
  const [spawnLog, setSpawnLog] = useState<
    { ts: number; kind: string; alias: string; genesis_id: string; trigger: string; color: string }[]
  >([]);
  const [liveSpawnKinds] = useState<string[]>([
    "marketing",
    "finance",
    "security",
  ]);
  const [countdownTick, setCountdownTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCountdownTick((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const liveSpawnMutation = useMutation({
    mutationFn: (kinds: string[]) =>
      api.orchestratorLiveSpawn({ kinds, trigger: "live-spawn" }),
    onSuccess: (data: LiveSpawnResult) => {
      const entries = data.spawned.map((s: OrchestratorSpawnedChild) => ({
        ts: Math.floor(Date.now() / 1000),
        kind: s.kind,
        alias: s.alias,
        genesis_id: s.genesis_id,
        trigger: data.trigger,
        color: s.color,
      }));
      setSpawnLog((prev) => [...entries.reverse(), ...prev].slice(0, 40));
      queryClient.invalidateQueries({ queryKey: ["records"] });
      queryClient.invalidateQueries({ queryKey: ["orchestrator-schedule"] });
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ["orchestrator-schedule"],
    queryFn: api.orchestratorSchedule,
    refetchInterval: 30_000,
  });

  const scheduleTick = useMutation({
    mutationFn: () => api.orchestratorScheduleTick(true),
    onSuccess: (data) => {
      if (data.tick.ran && data.tick.child) {
        const c = data.tick.child;
        setSpawnLog((prev) =>
          [
            {
              ts: Math.floor(Date.now() / 1000),
              kind: c.kind,
              alias: c.alias,
              genesis_id: c.genesis_id,
              trigger: "schedule-6h",
              color: c.color,
            },
            ...prev,
          ].slice(0, 40),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["records"] });
      queryClient.invalidateQueries({ queryKey: ["orchestrator-schedule"] });
    },
  });

  const toggleChild = useCallback((key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const mutation = useMutation({
    mutationFn: (data: {
      prompt: string;
      children: string[];
      model: string;
    }) => api.orchestrator(data),
    onSuccess: (data) => {
      setResult(data);
      setVerification(null);
    },
  });

  const preview = useQuery({
    queryKey: ["orchestrator-preview", selected.join(",")],
    queryFn: () =>
      api.orchestratorPreview({ prompt, children: selected }),
    enabled: selected.length > 0,
    staleTime: 5_000,
  });

  const chainQuery = useQuery({
    queryKey: ["orchestrator-chain", result?.final_id],
    queryFn: () => api.orchestratorChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  const seedRecordsQuery = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    staleTime: 10_000,
  });

  const seedOrchRecords: RecordWithId[] = useMemo(
    () =>
      (seedRecordsQuery.data || [])
        .filter((r) => {
          const al = (r.record.agent.alias || "").toLowerCase();
          return al === "arc-orchestrator" || al.includes("-child-");
        })
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
    activeRecords.length > 0 ? activeRecords : seedOrchRecords;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || selected.length === 0 || mutation.isPending)
        return;
      setResult(null);
      setVerification(null);
      mutation.mutate({
        prompt: prompt.trim(),
        children: selected,
        model,
      });
    },
    [prompt, selected, model, mutation],
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
            <span className="text-[#F97316]">Orchestrator</span>{" "}
            <span className="text-white/90">/ Meta-Agent</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            LangGraph + Ollama spawn coordinator &middot; every spawned child
            inherits a mandatory memref to the full live ARC DAG
          </p>
        </div>
        <Link href="/marketplace#demo">
          <Button
            variant="outline"
            className="gap-2 border-[#F97316]/20 text-[#F97316]/80 hover:border-[#F97316]/40 hover:text-[#F97316]"
          >
            <Gavel className="h-3.5 w-3.5" />
            Dispute Resolution
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>
        </Link>
      </div>

      {/* Goose Runtime — new Goose-powered agent dispatcher */}
      <GooseRuntimePanel />

      {/* Orchestration Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] orch-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Task Prompt */}
            <div className="relative">
              <Network className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the orchestration task... (e.g., Coordinate a multi-agent research + codegen sprint: survey ARC Protocol Lightning settlement paths and draft the reference implementation, with compliance + data corroboration.)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#F97316]/30 focus:ring-1 focus:ring-[#F97316]/20 transition-all resize-none"
              />
            </div>

            {/* Child Agent Selector */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Bot className="h-2.5 w-2.5" />
                Child Agents to Spawn ({selected.length})
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CHILD_AGENTS.map((c) => {
                  const Icon = c.icon;
                  const active = selected.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleChild(c.key)}
                      className={`group relative flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all duration-200 ${
                        active
                          ? "bg-white/[0.04] shadow-[0_0_16px_rgba(249,115,22,0.12)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
                      }`}
                      style={
                        active
                          ? {
                              borderColor: `${c.color}66`,
                              boxShadow: `0 0 18px ${c.color}22`,
                            }
                          : undefined
                      }
                    >
                      <Icon
                        className="h-4 w-4 transition-colors"
                        style={{ color: active ? c.color : "rgba(255,255,255,0.4)" }}
                      />
                      <div>
                        <div
                          className="text-[11px] font-semibold tracking-wide"
                          style={{ color: active ? c.color : "rgba(255,255,255,0.7)" }}
                        >
                          {c.name}
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5 leading-snug">
                          {c.role}
                        </div>
                      </div>
                      {active && (
                        <span
                          className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: c.color,
                            boxShadow: `0 0 6px ${c.color}`,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Terminal className="h-2.5 w-2.5" />
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full md:w-[240px] bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/60 focus:outline-none focus:border-[#F97316]/30"
              >
                <option value="llama3.1:8b">llama3.1:8b</option>
                <option value="llama3.2">llama3.2</option>
                <option value="qwen2.5:14b">qwen2.5:14b</option>
                <option value="qwen3:14b">qwen3:14b</option>
                <option value="mistral">mistral</option>
              </select>
            </div>

            {/* Submit Row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-[10px] text-white/20 flex-wrap">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" /> 6-node LangGraph
                </span>
                <span className="flex items-center gap-1">
                  <Rocket className="h-3 w-3" /> child-per-spawn inscriptions
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> full-DAG child memref
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> BIP-340 signed
                </span>
              </div>
              <Button
                type="submit"
                disabled={
                  !prompt.trim() || selected.length === 0 || mutation.isPending
                }
                className="bg-[#F97316]/10 border border-[#F97316]/20 text-[#F97316] hover:bg-[#F97316]/20 disabled:opacity-30 orch-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Orchestrating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Spawn &amp; Inscribe
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Live Spawn Run ─────────────────────────────────────────────── */}
      <Card className="border-[#F97316]/20 bg-[#0a0a0a] orch-card-glow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Rocket className="h-3.5 w-3.5 text-[#F97316]" />
                <h4 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  Live Spawn Run
                </h4>
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#F97316]/80 border-[#F97316]/30 px-1.5 uppercase"
                >
                  3 children
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[8px] text-emerald-400/80 border-emerald-400/30 px-1.5 uppercase"
                >
                  full-DAG memref
                </Badge>
              </div>
              <p className="text-[11px] text-white/40">
                Seed a real ARC spawn: inscribe Marketing + Finance + Security
                child agents in one shot — each with a fresh BIP-340 keypair,
                genesis record, and mandatory full-mesh memref.
              </p>
            </div>
            <Button
              onClick={() => liveSpawnMutation.mutate(liveSpawnKinds)}
              disabled={liveSpawnMutation.isPending}
              className="bg-[#F97316]/15 border border-[#F97316]/40 text-[#F97316] hover:bg-[#F97316]/25 orch-btn-glow"
            >
              {liveSpawnMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Spawning 3 children...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Seed Live Spawn Run
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">
            {EXTRA_CHILD_AGENTS.filter((c) =>
              liveSpawnKinds.includes(c.key),
            ).map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.key}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{
                    borderColor: `${c.color}33`,
                    background: `linear-gradient(90deg, ${c.color}0f, transparent 70%)`,
                  }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${c.color}15`,
                      border: `1px solid ${c.color}40`,
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: c.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[12px] font-semibold"
                      style={{ color: c.color }}
                    >
                      {c.name}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono truncate">
                      arc-child-{c.key}-&lt;stamp&gt;
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {liveSpawnMutation.data && (
            <div className="mt-4 border-t border-white/[0.04] pt-3 text-[11px] text-white/60">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">
                  {liveSpawnMutation.data.spawned.length} child(ren) inscribed
                </span>
                <span className="text-white/30 font-mono ml-2">
                  summary {liveSpawnMutation.data.summary_id.slice(0, 16)}...
                </span>
              </div>
            </div>
          )}
          {liveSpawnMutation.isError && (
            <p className="mt-3 text-[11px] text-red-400">
              {liveSpawnMutation.error instanceof Error
                ? liveSpawnMutation.error.message
                : "Live spawn failed"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── /schedule : 6h Cron Auto-Spawn ────────────────────────────── */}
      <Card className="border-[#F97316]/15 bg-[#0a0a0a] orch-card-glow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                <h4 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                  /schedule
                </h4>
                <code className="text-[10px] text-[#F97316]/80 bg-[#F97316]/10 border border-[#F97316]/30 rounded px-1.5 py-0.5 font-mono">
                  {scheduleQuery.data?.cron || "0 */6 * * *"}
                </code>
                <Badge
                  variant="outline"
                  className="text-[8px] text-white/50 border-white/20 px-1.5 uppercase"
                >
                  every 6h
                </Badge>
                {scheduleQuery.data?.enabled && (
                  <Badge
                    variant="outline"
                    className="text-[8px] text-emerald-400/80 border-emerald-400/30 px-1.5 uppercase"
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                    armed
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-white/40">
                Auto-spawns one new child agent every 6 hours in a round-robin
                rotation — each inscribed with a full-DAG memref. Exponential
                ledger growth without operator input.
              </p>
            </div>
            <Button
              onClick={() => scheduleTick.mutate()}
              disabled={scheduleTick.isPending}
              variant="outline"
              className="gap-2 border-[#F97316]/20 text-[#F97316]/80 hover:border-[#F97316]/40 hover:text-[#F97316]"
            >
              {scheduleTick.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              Tick now
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/25 mb-1">
                Next tick in
              </div>
              <div
                className="text-sm font-bold font-mono text-[#F97316]"
                key={countdownTick}
              >
                {scheduleQuery.data
                  ? fmtCountdown(
                      Math.max(
                        0,
                        (scheduleQuery.data.next_run -
                          Math.floor(Date.now() / 1000)) |
                          0,
                      ),
                    )
                  : "…"}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/25 mb-1">
                Next kind
              </div>
              <div className="text-sm font-semibold text-white/80 capitalize">
                {scheduleQuery.data?.next_kind || "—"}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/25 mb-1">
                Last tick
              </div>
              <div className="text-sm font-mono text-white/60">
                {scheduleQuery.data
                  ? fmtRelTs(scheduleQuery.data.last_run)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-[9px] uppercase tracking-wider text-white/25 mb-1">
                History
              </div>
              <div className="text-sm font-bold text-white/80">
                {scheduleQuery.data?.history.length || 0}
                <span className="text-[10px] text-white/30 ml-1 font-normal">
                  ticks
                </span>
              </div>
            </div>
          </div>

          {/* Rotation pills */}
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase tracking-wider text-white/25 mr-1">
              Rotation
            </span>
            {(scheduleQuery.data?.rotation || [
              "marketing",
              "finance",
              "security",
              "ops",
              "product",
              "community",
            ]).map((k: string) => {
              const cfg = EXTRA_CHILD_AGENTS.find((e) => e.key === k);
              const isNext = k === scheduleQuery.data?.next_kind;
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono capitalize"
                  style={{
                    color: cfg?.color || "#F97316",
                    borderColor: isNext
                      ? `${cfg?.color || "#F97316"}80`
                      : `${cfg?.color || "#F97316"}30`,
                    backgroundColor: isNext
                      ? `${cfg?.color || "#F97316"}18`
                      : `${cfg?.color || "#F97316"}08`,
                    boxShadow: isNext
                      ? `0 0 12px ${cfg?.color || "#F97316"}40`
                      : "none",
                  }}
                >
                  {isNext && (
                    <span
                      className="inline-block w-1 h-1 rounded-full animate-pulse"
                      style={{ backgroundColor: cfg?.color || "#F97316" }}
                    />
                  )}
                  {k}
                </span>
              );
            })}
          </div>

          {/* Tick history from backend */}
          {scheduleQuery.data && scheduleQuery.data.history.length > 0 && (
            <div className="mt-4 border-t border-white/[0.04] pt-3">
              <div className="text-[9px] uppercase tracking-wider text-white/25 mb-2">
                Schedule ledger
              </div>
              <div className="space-y-1 max-h-[140px] overflow-y-auto">
                {scheduleQuery.data.history
                  .slice()
                  .reverse()
                  .map((h, i) => {
                    const cfg = EXTRA_CHILD_AGENTS.find(
                      (e) => e.key === h.kind,
                    );
                    return (
                      <div
                        key={`${h.ts}-${i}`}
                        className="flex items-center gap-2 text-[10px] font-mono"
                      >
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: cfg?.color || "#F97316" }}
                        />
                        <span
                          className="capitalize"
                          style={{ color: cfg?.color || "#F97316" }}
                        >
                          {h.kind}
                        </span>
                        <span className="text-white/50 truncate">
                          {h.alias}
                        </span>
                        <span className="ml-auto text-white/25 shrink-0">
                          {fmtRelTs(h.ts)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Real-time Spawn Log + Live DAG ─────────────────────────────── */}
      {(spawnLog.length > 0 ||
        (scheduleQuery.data && scheduleQuery.data.history.length > 0)) && (
        <Card className="border-[#F97316]/15 bg-[#0a0a0a] orch-card-glow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Radio className="h-3.5 w-3.5 text-[#F97316] animate-pulse" />
              <h4 className="text-xs text-white/50 uppercase tracking-wider font-medium">
                Real-time Spawn Log
              </h4>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F97316]/80 border-[#F97316]/30 px-1.5 uppercase"
              >
                {spawnLog.length} this session
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-emerald-400/80 border-emerald-400/30 px-1.5 uppercase"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                live
              </Badge>
            </div>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto font-mono text-[11px]">
              {spawnLog.length === 0 && (
                <p className="text-white/25 italic text-[11px]">
                  Waiting for a spawn... hit "Seed Live Spawn Run" or "Tick
                  now" above.
                </p>
              )}
              {spawnLog.map((e, i) => (
                <div
                  key={`${e.ts}-${i}-${e.alias}`}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 anim-fade-up"
                  style={{
                    borderColor: `${e.color}30`,
                    background: `linear-gradient(90deg, ${e.color}10, transparent 80%)`,
                  }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                    style={{
                      backgroundColor: e.color,
                      boxShadow: `0 0 8px ${e.color}`,
                    }}
                  />
                  <span
                    className="uppercase tracking-wider text-[9px] font-bold shrink-0"
                    style={{ color: e.color }}
                  >
                    {e.trigger}
                  </span>
                  <span
                    className="capitalize shrink-0"
                    style={{ color: e.color }}
                  >
                    {e.kind}
                  </span>
                  <span className="text-white/60 truncate">{e.alias}</span>
                  <span className="text-white/20 shrink-0">
                    genesis {e.genesis_id.slice(0, 10)}...
                  </span>
                  <span className="ml-auto text-white/25 shrink-0">
                    {fmtRelTs(e.ts)}
                  </span>
                </div>
              ))}
            </div>

            {/* Live glowing DAG of the whole orchestrator lattice */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-3.5 w-3.5 text-[#F97316]/70" />
                <h5 className="text-[10px] uppercase tracking-wider text-white/30">
                  Live Orchestrator DAG
                </h5>
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#F97316]/80 border-[#F97316]/25 px-1.5"
                >
                  {seedOrchRecords.length} records
                </Badge>
              </div>
              <div className="h-[320px] border border-[#F97316]/25 rounded-xl overflow-hidden bg-[#020202] orch-dag-glow">
                {seedOrchRecords.length > 0 ? (
                  <Suspense
                    fallback={
                      <div className="h-full skeleton-shimmer rounded-xl" />
                    }
                  >
                    <DAGViewer records={seedOrchRecords} />
                  </Suspense>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#F97316]" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spawn Preview */}
      {!result && preview.data && selected.length > 0 && (
        <Card className="border-[#F97316]/15 bg-[#0a0a0a] orch-card-glow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Rocket className="h-3.5 w-3.5 text-[#F97316]/70" />
              <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                Spawn Preview
              </h4>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F97316]/80 border-[#F97316]/30 px-1.5 uppercase"
              >
                {preview.data.children.length} child(ren)
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-white/50 border-white/20 px-1.5 uppercase"
              >
                {preview.data.dag_memref_count} DAG anchors
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {preview.data.children.map((child) => (
                <div
                  key={child.kind}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                  style={{
                    borderColor: `${child.color}33`,
                    background: `linear-gradient(90deg, ${child.color}08, transparent 60%)`,
                  }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${child.color}15`,
                      border: `1px solid ${child.color}40`,
                    }}
                  >
                    <Bot className="h-4 w-4" style={{ color: child.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[12px] font-semibold truncate"
                      style={{ color: child.color }}
                    >
                      {child.name}
                    </div>
                    <div className="text-[10px] text-white/40 truncate font-mono">
                      {child.alias_prefix}-&lt;stamp&gt;
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[8px] border-white/10 text-white/40 px-1.5 shrink-0"
                  >
                    {child.mandatory_memrefs.length} refs
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-white/30 flex-wrap">
              <Link2 className="h-3 w-3 text-[#F97316]/60" />
              Every child genesis MUST memref all{" "}
              <span className="text-[#F97316]">
                {preview.data.certified_anchors.length} certified
              </span>{" "}
              agent heads. Enforced at signature time.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Progress */}
      {mutation.isPending && (
        <div className="anim-fade-up">
          <Card className="border-[#F97316]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#F97316]/20 border-t-[#F97316] animate-spin" />
                  <Network className="absolute inset-0 m-auto h-5 w-5 text-[#F97316]/70" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Orchestrator planning, spawning, dispatching, aggregating...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; plan &rarr; spawn &rarr; dispatch &rarr;
                    aggregate &rarr; inscribe
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
                : "Orchestrator failed"}
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
                color: "#F97316",
              },
              {
                label: "Children",
                value: result.spawned.length,
                icon: Bot,
                color: "#A855F7",
              },
              {
                label: "DAG Refs",
                value: result.dag_memrefs.length,
                icon: Link2,
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
                    <Icon className="h-3 w-3" style={{ color: `${color}80` }} />
                    <span className="text-[9px] text-white/25 uppercase tracking-wider">
                      {label}
                    </span>
                  </div>
                  <p className="text-xl font-bold truncate" style={{ color }}>
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Spawned Children Roster */}
          {result.spawned.length > 0 && (
            <Card className="border-[#F97316]/15 bg-[#0a0a0a] orch-card-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Bot className="h-3.5 w-3.5 text-[#F97316]/70" />
                  <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                    Spawned Children
                  </h4>
                  <Badge
                    variant="outline"
                    className="text-[8px] text-[#F97316]/80 border-[#F97316]/30 px-1.5 uppercase"
                  >
                    {result.spawned.length} live
                  </Badge>
                </div>
                <div className="space-y-2">
                  {result.spawned.map((s) => (
                    <div
                      key={s.alias}
                      className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                      style={{
                        borderColor: `${s.color}33`,
                        background: `linear-gradient(90deg, ${s.color}08, transparent 60%)`,
                      }}
                    >
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${s.color}15`,
                          border: `1px solid ${s.color}40`,
                        }}
                      >
                        <Bot className="h-4 w-4" style={{ color: s.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[12px] font-semibold"
                          style={{ color: s.color }}
                        >
                          {s.name}
                        </div>
                        <div className="text-[10px] text-white/50 font-mono truncate">
                          {s.alias}
                        </div>
                        <div className="text-[9px] text-white/30 font-mono mt-0.5">
                          pub {s.pubkey.slice(0, 18)}... &middot; genesis{" "}
                          {s.genesis_id.slice(0, 14)}...
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[8px] border-white/10 text-white/50 px-1.5 shrink-0 uppercase"
                      >
                        full-DAG memref
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Orchestration Report Preview (primary) */}
          <Card className="border-[#F97316]/15 bg-[#0a0a0a] overflow-hidden orch-card-glow">
            <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
              <Sparkles className="h-4 w-4 text-[#F97316]" />
              <span className="text-sm font-medium text-[#F97316]">
                Orchestrator Report
              </span>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F97316]/80 border-[#F97316]/30 px-1.5 uppercase"
              >
                meta-agent
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-white/50 border-white/20 px-1.5 uppercase"
              >
                {result.children.join(" / ")}
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
              <div className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-6 max-h-[600px] overflow-y-auto orch-report-paper">
                {result.report}
              </div>
            </CardContent>
          </Card>

          {/* Spawn & Inscribe */}
          <Card className="border-[#F97316]/15 bg-[#0a0a0a] orch-card-glow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Rocket className="h-3.5 w-3.5 text-[#F97316]/70" />
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                      Spawn &amp; Inscribe on Bitcoin
                    </h4>
                  </div>
                  <p className="text-[11px] text-white/30">
                    Calls the ARC CLI inscription envelope and deep-verifies
                    the orchestrator record + every spawned child genesis +
                    full-DAG memrefs.
                  </p>
                </div>
                <SpawnInscribeButton
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
                      <span className="text-[#F97316]">
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

          {/* Plan + Dispatch + Aggregate (collapsible) */}
          <OutputSection
            title="Execution Plan"
            icon={FileText}
            color="#A855F7"
            content={result.plan}
            defaultOpen
          />
          <OutputSection
            title="Dispatch Bundle"
            icon={Activity}
            color="#00F0FF"
            content={result.dispatch}
          />
          <OutputSection
            title="Aggregation Synthesis"
            icon={Sparkles}
            color="#EAB308"
            content={result.aggregate}
          />

          {/* Expanding Meta-Graph DAG */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-[#F97316]/70" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Expanding Meta-Graph
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#F97316]/80 border-[#F97316]/25 px-1.5"
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
                        "repeating-linear-gradient(90deg, #F97316 0, #F97316 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[420px] border border-[#F97316]/20 rounded-xl overflow-hidden bg-[#020202] orch-dag-glow">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#F97316]" />
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
                <Link2 className="h-3.5 w-3.5 text-[#F97316]/70" />
                <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                  Cross-Agent Attestation
                </h4>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "arc-deep-research", color: "#A855F7", Icon: Brain },
                  { label: "arc-codegen", color: "#00F0FF", Icon: Code2 },
                  { label: "arc-defi-trader", color: "#22c55e", Icon: TrendingUp },
                  { label: "arc-legal", color: "#EAB308", Icon: ScaleIcon },
                  { label: "arc-design", color: "#EC4899", Icon: Sparkles },
                  { label: "arc-support", color: "#38BDF8", Icon: HelpCircle },
                  { label: "arc-compliance", color: "#10B981", Icon: Shield },
                  { label: "arc-data", color: "#6366F1", Icon: BarChart },
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
                Every spawned child genesis memrefs the latest head of each
                certified agent + the seeded ARC DAG. Full-mesh provenance
                inherited at birth.
              </p>
            </CardContent>
          </Card>

          {/* Agent Info */}
          <div className="flex items-center gap-4 text-[10px] text-white/15 font-mono flex-wrap">
            <span>agent: {result.agent_pubkey?.slice(0, 24)}...</span>
            <span>final: {result.final_id?.slice(0, 20)}...</span>
            <span>
              records: {result.record_ids.length} &middot; children:{" "}
              {result.spawned.length} &middot; dag_refs:{" "}
              {result.dag_memrefs.length}
            </span>
          </div>
        </div>
      )}

      {/* Seeded orchestrator history — shown before submission */}
      {!result && !mutation.isPending && seedOrchRecords.length > 0 && (
        <div className="space-y-4 anim-fade-up anim-delay-1">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Records",
                value: seedOrchRecords.length,
                icon: Layers,
                color: "#F97316",
              },
              {
                label: "Agent",
                value: "arc-orchestrator",
                icon: Network,
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
              <GitBranch className="h-3.5 w-3.5 text-[#F97316]/70" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Recent Orchestrator Inscriptions
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] text-[#F97316]/80 border-[#F97316]/25 px-1.5"
              >
                live seed chain
              </Badge>
            </div>
            <div className="h-[420px] border border-[#F97316]/20 rounded-xl overflow-hidden bg-[#020202] orch-dag-glow">
              <Suspense
                fallback={<div className="h-full skeleton-shimmer rounded-xl" />}
              >
                <DAGViewer records={seedOrchRecords} />
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
              ARC CLI &middot; Direct Meta-Agent Spawn
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#F97316]/70">$</span>
                <code className="text-white/50">
                  cd backend &amp;&amp; python orchestrator_agent.py --children
                  research,codegen &quot;coordinate L2 reference impl&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F97316]/70">$</span>
                <code className="text-white/50">
                  python orchestrator_agent.py --children
                  research,codegen,compliance,data &quot;full-mesh product
                  audit&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F97316]/70">$</span>
                <code className="text-white/50">arc view-chain RECORD_ID</code>
                <span className="text-white/15 ml-auto">view provenance</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F97316]/70">$</span>
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
