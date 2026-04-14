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
  Image as ImageIcon,
  Zap,
  GitBranch,
  Layers,
  Link2,
  Loader2,
  Copy,
  Check,
  Sparkles,
  Wand2,
  Palette,
  Ratio,
  Camera,
  Boxes,
  Squircle,
  PenLine,
  Terminal,
  ExternalLink,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Hash,
  Cpu,
} from "lucide-react";
import type {
  DesignResult,
  RecordWithId,
  DesignVerifyResult,
} from "@/lib/types";

const DAGViewer = dynamic(
  () =>
    import("@/components/dag-viewer").then((m) => ({ default: m.DAGViewer })),
  { ssr: false },
);

// ── Styles (mirrors backend/design_agent.py STYLES) ──────────────────────────

const STYLES = [
  {
    key: "photorealistic",
    label: "Photorealistic",
    icon: Camera,
    desc: "DSLR, 85mm, cinematic lighting",
  },
  {
    key: "cyberpunk",
    label: "Cyberpunk",
    icon: Cpu,
    desc: "Neon, rain, high contrast",
  },
  {
    key: "abstract",
    label: "Abstract",
    icon: Boxes,
    desc: "Flowing geometry, chromatic",
  },
  {
    key: "anime",
    label: "Anime",
    icon: PenLine,
    desc: "Cel shaded, vivid palette",
  },
  {
    key: "minimalist",
    label: "Minimalist",
    icon: Squircle,
    desc: "Flat, Swiss, whitespace",
  },
  {
    key: "retrofuturist",
    label: "Retrofuturist",
    icon: Sparkles,
    desc: "1980s synthwave + grid",
  },
] as const;

const ASPECT_RATIOS = [
  { key: "1:1", label: "1:1", desc: "Square" },
  { key: "16:9", label: "16:9", desc: "Widescreen" },
  { key: "9:16", label: "9:16", desc: "Vertical" },
  { key: "4:3", label: "4:3", desc: "Classic" },
  { key: "3:4", label: "3:4", desc: "Portrait" },
] as const;

const STEPS = [
  { key: "init", label: "Identity", icon: Zap, color: "#F7931A" },
  { key: "expand", label: "Expand", icon: Wand2, color: "#a855f7" },
  { key: "render", label: "Render", icon: ImageIcon, color: "#EC4899" },
  { key: "caption", label: "Caption", icon: PenLine, color: "#00F0FF" },
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

// ── Collapsible output section ───────────────────────────────────────────────

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
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-mono rounded-lg p-4 max-h-[400px] overflow-y-auto text-white/60 bg-white/[0.02]">
            {content}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Generate & Inscribe button ───────────────────────────────────────────────

function GenerateInscribeButton({
  result,
  onVerified,
}: {
  result: DesignResult;
  onVerified: (v: DesignVerifyResult) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = useMutation({
    mutationFn: () => api.designVerify(result.final_id),
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
      className="bg-[#EC4899]/10 border border-[#EC4899]/30 text-[#EC4899] hover:bg-[#EC4899]/20 design-btn-glow transition-all"
    >
      {verifying || verify.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Inscribing &amp; Verifying...
        </>
      ) : copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-emerald-400" />
          Inscribed &amp; Verified
        </>
      ) : (
        <>
          <GitBranch className="h-4 w-4 mr-2" />
          Generate &amp; Inscribe
        </>
      )}
    </Button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DesignPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("cyberpunk");
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [model, setModel] = useState("llama3.2");
  const [result, setResult] = useState<DesignResult | null>(null);
  const [verification, setVerification] = useState<DesignVerifyResult | null>(
    null,
  );
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedCid, setCopiedCid] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: {
      prompt: string;
      style: string;
      aspect_ratio: string;
      model: string;
    }) => api.design(data),
    onSuccess: (data) => {
      setResult(data);
      setVerification(null);
    },
  });

  const chainQuery = useQuery({
    queryKey: ["design-chain", result?.final_id],
    queryFn: () => api.designChain(result!.final_id),
    enabled: !!result?.final_id,
  });

  // Fallback: live arc-design seed chain so the DAG viewer is never empty.
  const seedRecordsQuery = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    staleTime: 10_000,
  });

  const seedDesignRecords: RecordWithId[] = useMemo(
    () =>
      (seedRecordsQuery.data || [])
        .filter(
          (r) => (r.record.agent.alias || "").toLowerCase() === "arc-design",
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
    activeRecords.length > 0 ? activeRecords : seedDesignRecords;

  const selectedStyle = STYLES.find((s) => s.key === style);
  const selectedAspect = ASPECT_RATIOS.find((a) => a.key === aspectRatio);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || mutation.isPending) return;
      setResult(null);
      setVerification(null);
      mutation.mutate({
        prompt: prompt.trim(),
        style,
        aspect_ratio: aspectRatio,
        model,
      });
    },
    [prompt, style, aspectRatio, model, mutation],
  );

  const copyInscription = useCallback(() => {
    if (result?.inscription_cmd) {
      navigator.clipboard.writeText(result.inscription_cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    }
  }, [result]);

  const copyCid = useCallback(() => {
    if (result?.image_cid) {
      navigator.clipboard.writeText(result.image_cid);
      setCopiedCid(true);
      setTimeout(() => setCopiedCid(false), 2000);
    }
  }, [result]);

  // Build a data: URL for the generated SVG so it renders inline without
  // needing a static asset pipeline or CORS-gated IPFS gateway at preview.
  const imageDataUrl = useMemo(() => {
    if (!result?.svg) return "";
    return `data:image/svg+xml;utf8,${encodeURIComponent(result.svg)}`;
  }, [result?.svg]);

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[48px] font-bold tracking-tighter leading-none">
            <span className="text-[#EC4899] text-glow-orange">Design</span>{" "}
            <span className="text-white/90">&amp; Images</span>
          </h2>
          <p className="text-white/25 text-sm mt-2">
            LangGraph + Flux/Ollama generative agent &middot; every image
            pinned to an IPFS CID and anchored to the full ARC DAG
          </p>
        </div>
        <Link href="/dag">
          <Button
            variant="outline"
            className="gap-2 border-[#EC4899]/20 text-[#EC4899]/80 hover:border-[#EC4899]/40 hover:text-[#EC4899]"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Agent DAG
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>
        </Link>
      </div>

      {/* Prompt Form */}
      <Card className="border-white/[0.06] bg-[#0a0a0a] design-card-glow">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Style selector */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Palette className="h-2.5 w-2.5" />
                Style
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {STYLES.map((s) => {
                  const Icon = s.icon;
                  const active = s.key === style;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStyle(s.key)}
                      className={`group relative flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-all duration-200 ${
                        active
                          ? "border-[#EC4899]/40 bg-[#EC4899]/[0.06] shadow-[0_0_18px_rgba(236,72,153,0.12)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          active ? "text-[#EC4899]" : "text-white/40"
                        }`}
                      />
                      <div>
                        <div
                          className={`text-[11px] font-semibold tracking-wide ${
                            active ? "text-[#EC4899]" : "text-white/70"
                          }`}
                        >
                          {s.label}
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5 leading-snug">
                          {s.desc}
                        </div>
                      </div>
                      {active && (
                        <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#EC4899] shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect ratio selector */}
            <div>
              <label className="text-[9px] text-white/20 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Ratio className="h-2.5 w-2.5" />
                Aspect Ratio
              </label>
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIOS.map((a) => {
                  const active = a.key === aspectRatio;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setAspectRatio(a.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] transition-all duration-200 ${
                        active
                          ? "border-[#EC4899]/40 bg-[#EC4899]/[0.06] text-[#EC4899] shadow-[0_0_12px_rgba(236,72,153,0.1)]"
                          : "border-white/[0.06] bg-white/[0.02] text-white/60 hover:border-white/[0.12] hover:text-white/80"
                      }`}
                    >
                      <span className="font-mono font-semibold">{a.label}</span>
                      <span className="opacity-60">{a.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt input */}
            <div className="relative">
              <Wand2 className="absolute left-3 top-3.5 h-4 w-4 text-white/20" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image... (e.g., A luminous Bitcoin ordinal inscription floating above a Lightning network mesh under a synthwave sunset)"
                rows={3}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder:text-white/15 focus:outline-none focus:border-[#EC4899]/30 focus:ring-1 focus:ring-[#EC4899]/20 transition-all resize-none"
              />
            </div>

            {/* Model + submit row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[9px] text-white/20 uppercase tracking-wider flex items-center gap-1">
                    <Terminal className="h-2.5 w-2.5" />
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none focus:border-[#EC4899]/30"
                  >
                    <option value="llama3.2">llama3.2</option>
                    <option value="llama3.1:8b">llama3.1:8b</option>
                    <option value="qwen2.5:14b">qwen2.5:14b</option>
                    <option value="qwen3:14b">qwen3:14b</option>
                    <option value="mistral">mistral</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/20 flex-wrap">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" /> 5-node LangGraph
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" /> 5 inscriptions / image
                  </span>
                  <span className="flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Cross-agent memrefs
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" /> IPFS CIDv1
                  </span>
                </div>
              </div>
              <Button
                type="submit"
                disabled={!prompt.trim() || mutation.isPending}
                className="bg-[#EC4899]/10 border border-[#EC4899]/20 text-[#EC4899] hover:bg-[#EC4899]/20 disabled:opacity-30 design-btn-glow"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Image
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Pipeline progress */}
      {mutation.isPending && (
        <div className="anim-fade-up">
          <Card className="border-[#EC4899]/10 bg-[#0a0a0a]">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-[#EC4899]/20 border-t-[#EC4899] animate-spin" />
                  <ImageIcon className="absolute inset-0 m-auto h-5 w-5 text-[#EC4899]/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/60">
                    Design agent rendering and anchoring...
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    init &rarr; expand &rarr; render &rarr; caption &rarr;
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
                : "Design agent failed"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 anim-fade-up">
          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Records",
                value: result.record_ids.length,
                icon: Layers,
                color: "#EC4899",
              },
              {
                label: "DAG Refs",
                value: result.dag_memrefs.length,
                icon: Link2,
                color: "#a855f7",
              },
              {
                label: "Style",
                value: selectedStyle?.label || result.style_name,
                icon: Palette,
                color: "#00F0FF",
                isText: true,
              },
              {
                label: "Aspect",
                value: `${result.aspect_ratio} (${result.width}x${result.height})`,
                icon: Ratio,
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

          {/* Image preview */}
          <Card className="border-[#EC4899]/10 bg-[#0a0a0a] overflow-hidden design-card-glow">
            <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.04]">
              <ImageIcon className="h-4 w-4 text-[#EC4899]" />
              <span className="text-sm font-medium text-[#EC4899]">
                Generated Image
              </span>
              <Badge
                variant="outline"
                className="text-[8px] text-[#EC4899]/70 border-[#EC4899]/30 px-1.5 uppercase"
              >
                {result.style}
              </Badge>
              <Badge
                variant="outline"
                className="text-[8px] text-[#00F0FF]/70 border-[#00F0FF]/30 px-1.5"
              >
                {result.aspect_ratio}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyCid}
                  className="design-cid-pill flex items-center gap-1.5 hover:bg-[#EC4899]/15 transition-colors"
                  title="Copy IPFS CID"
                >
                  <Hash className="h-3 w-3" />
                  <span className="truncate max-w-[180px]">
                    {result.image_cid.slice(0, 26)}...
                  </span>
                  {copiedCid ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 opacity-60" />
                  )}
                </button>
              </div>
            </div>
            <CardContent className="p-4">
              <div className="design-image-frame mx-auto max-w-full">
                {imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageDataUrl}
                    alt={result.caption || result.prompt}
                    className="w-full h-auto block"
                    style={{
                      aspectRatio: `${result.width} / ${result.height}`,
                    }}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center text-white/20 text-xs"
                    style={{ aspectRatio: `${result.width} / ${result.height}` }}
                  >
                    No render
                  </div>
                )}
              </div>
              {result.caption && (
                <p className="text-[12px] text-white/60 italic mt-3 text-center">
                  &ldquo;{result.caption}&rdquo;
                </p>
              )}
              <div className="mt-3 flex items-center gap-4 text-[10px] text-white/25 font-mono flex-wrap">
                <span>
                  uri:{" "}
                  <span className="text-[#EC4899]/70">{result.image_uri}</span>
                </span>
                <span>
                  dims:{" "}
                  <span className="text-white/50">
                    {result.width}&times;{result.height}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Generate & Inscribe */}
          <Card className="border-[#EC4899]/15 bg-[#0a0a0a] design-card-glow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="h-3.5 w-3.5 text-[#EC4899]/60" />
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-medium">
                      Generate &amp; Inscribe on Bitcoin
                    </h4>
                  </div>
                  <p className="text-[11px] text-white/30">
                    One click copies the ARC CLI ord command and deep-verifies
                    the full chain + cross-agent memrefs.
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
                      <span className="text-[#EC4899]">
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

          {/* Expanded prompt (collapsible) */}
          <OutputSection
            title="Expanded Prompt (Flux-ready)"
            icon={Wand2}
            color="#a855f7"
            content={result.expanded_prompt}
            defaultOpen
          />

          {/* Provenance DAG */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-[#EC4899]/60" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Generative Design Provenance Chain
              </h3>
              {result.dag_memrefs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[8px] text-[#EC4899]/70 border-[#EC4899]/25 px-1.5"
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
                        "repeating-linear-gradient(90deg, #EC4899 0, #EC4899 3px, transparent 3px, transparent 6px)",
                    }}
                  />{" "}
                  memref
                </span>
              </div>
            </div>
            <div className="h-[420px] border border-[#EC4899]/15 rounded-xl overflow-hidden bg-[#020202] design-dag-glow">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#EC4899]" />
                </div>
              )}
            </div>
          </div>

          {/* Inscription command */}
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

          {/* Agent info */}
          <div className="flex items-center gap-4 text-[10px] text-white/15 font-mono flex-wrap">
            <span>agent: {result.agent_pubkey?.slice(0, 24)}...</span>
            <span>final: {result.final_id?.slice(0, 20)}...</span>
            <span>
              records: {result.record_ids.length} &middot; dag_refs:{" "}
              {result.dag_memrefs.length}
            </span>
            <span>cid: {result.image_cid?.slice(0, 24)}...</span>
          </div>
        </div>
      )}

      {/* Recent arc-design inscriptions (seeded) — shown before submission */}
      {!result && !mutation.isPending && seedDesignRecords.length > 0 && (
        <div className="space-y-4 anim-fade-up anim-delay-1">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Records",
                value: seedDesignRecords.length,
                icon: Layers,
                color: "#EC4899",
              },
              {
                label: "Agent",
                value: "arc-design",
                icon: ImageIcon,
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
              <GitBranch className="h-3.5 w-3.5 text-[#EC4899]/60" />
              <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
                Recent Generative Design Inscriptions
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] text-[#EC4899]/70 border-[#EC4899]/25 px-1.5"
              >
                live seed chain
              </Badge>
              <span className="ml-auto text-[10px] text-white/20 font-mono">
                style: {selectedStyle?.label} &middot; aspect:{" "}
                {selectedAspect?.label}
              </span>
            </div>
            <div className="h-[420px] border border-[#EC4899]/15 rounded-xl overflow-hidden bg-[#020202] design-dag-glow">
              <Suspense
                fallback={
                  <div className="h-full skeleton-shimmer rounded-xl" />
                }
              >
                <DAGViewer records={seedDesignRecords} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* CLI reference */}
      {!result && !mutation.isPending && (
        <Card className="border-white/[0.04] bg-[#0a0a0a] anim-fade-up anim-delay-2">
          <CardContent className="p-4">
            <h4 className="text-xs text-white/30 uppercase tracking-wider mb-3">
              ARC CLI &middot; Direct Image Generation
            </h4>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start gap-2">
                <span className="text-[#EC4899]/60">$</span>
                <code className="text-white/50">
                  cd backend &amp;&amp; python design_agent.py --style cyberpunk
                  --aspect 16:9 &quot;Luminous ordinal over Lightning mesh&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#EC4899]/60">$</span>
                <code className="text-white/50">
                  python design_agent.py --style minimalist --aspect 1:1
                  &quot;ARC certified-agent badge&quot;
                </code>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#EC4899]/60">$</span>
                <code className="text-white/50">
                  arc view-chain RECORD_ID
                </code>
                <span className="text-white/15 ml-auto">view provenance</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#EC4899]/60">$</span>
                <code className="text-white/50">
                  arc validate RECORD_ID --deep
                </code>
                <span className="text-white/15 ml-auto">verify chain</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#EC4899]/60">$</span>
                <code className="text-white/50">
                  FLUX_HOST=http://localhost:7860 python design_agent.py --style
                  photorealistic &quot;prompt&quot;
                </code>
                <span className="text-white/15 ml-auto">use Flux endpoint</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
