"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { gooseApi } from "@/lib/api";
import type {
  RecipeReport,
  RecipeRunStatus,
  RecipeSummary,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Play,
  Zap,
  Loader2,
  Check,
  X,
  ArrowRight,
  FileText,
  GitBranch,
  Sparkles,
  Clock,
} from "lucide-react";

export default function RecipesPage() {
  const { data: recipes, isLoading } = useQuery({
    queryKey: ["recipes"],
    queryFn: gooseApi.recipes,
    refetchInterval: 60_000,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const spec = useMemo(
    () => recipes?.find((r) => r.name === selected) ?? null,
    [recipes, selected],
  );

  useEffect(() => {
    setParams({});
    setRunId(null);
    setSubmitError(null);
  }, [selected]);

  const { data: run } = useQuery<RecipeRunStatus>({
    queryKey: ["recipe-run", runId],
    queryFn: () => gooseApi.recipeRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 800;
    },
  });

  const { data: report } = useQuery<RecipeReport>({
    queryKey: ["recipe-report", runId],
    queryFn: () => gooseApi.recipeReport(runId!),
    enabled:
      !!runId && (run?.status === "completed" || run?.status === "failed"),
  });

  async function launch() {
    if (!spec) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const coerced: Record<string, unknown> = {};
      for (const p of spec.parameters) {
        const v = params[p.name];
        if (v !== undefined && v !== "") coerced[p.name] = v;
      }
      const res = await gooseApi.runRecipe(spec.name, coerced);
      setRunId(res.run_id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-[#F7931A]/10 border border-[#F7931A]/20">
            <BookOpen className="h-5 w-5 text-[#F7931A]" />
          </div>
          <Badge className="bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20">
            GOOSE RECIPES · ARC-WRAPPED
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">
          <span className="text-[#F7931A] text-glow-cyan">Provenance-wrapped</span>{" "}
          <span className="text-white/90">Goose recipes</span>
        </h1>
        <p className="text-white/40 text-sm mt-3 max-w-3xl">
          Every recipe step becomes a Schnorr-signed ARC record. On completion
          the whole workflow is an auditable, hash-chained DAG with optional
          Lightning settlement. Pick a recipe, fill the parameters, and run —
          each step posts its own record and the final head is the settlement
          anchor.
        </p>
        <div className="accent-line w-48 mt-4" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: recipe list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#F7931A]" />
            Available recipes{" "}
            {recipes && (
              <span className="text-white/30">({recipes.length})</span>
            )}
          </h2>
          {isLoading && (
            <Card className="glow-card">
              <CardContent className="p-5 text-white/40 text-sm">
                Loading recipes…
              </CardContent>
            </Card>
          )}
          {recipes?.map((r) => (
            <RecipeCard
              key={r.name}
              recipe={r}
              active={selected === r.name}
              onClick={() => setSelected(r.name)}
            />
          ))}
          {!isLoading && !recipes?.length && (
            <Card className="glow-card">
              <CardContent className="p-5 text-white/40 text-sm">
                No recipes loaded. The orchestrator service reads YAMLs from{" "}
                <span className="font-mono text-white/60">
                  orchestrator/recipes/
                </span>
                .
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: detail + run */}
        <div className="lg:col-span-2 space-y-6">
          {!spec && (
            <Card className="glow-card">
              <CardContent className="p-8 text-center text-white/40 text-sm">
                Select a recipe on the left to view its steps and launch a run.
              </CardContent>
            </Card>
          )}

          {spec && (
            <Card className="glow-card">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white/90">
                    {spec.name}
                  </h3>
                  <p className="text-sm text-white/50 mt-1 whitespace-pre-line">
                    {spec.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                    <Badge className="bg-white/[0.04] text-white/60 border-white/10">
                      agent: {spec.arc.agent || "—"}
                    </Badge>
                    <Badge className="bg-white/[0.04] text-white/60 border-white/10">
                      memref: {spec.arc.memref_strategy}
                    </Badge>
                    {spec.arc.settle_on_complete && (
                      <Badge className="bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20 gap-1">
                        <Zap className="h-3 w-3" />
                        settles {spec.arc.settlement_amount_sats.toLocaleString()} sats
                      </Badge>
                    )}
                    {spec.arc.inscription && (
                      <Badge className="bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20">
                        inscribe on Bitcoin
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Parameters */}
                {spec.parameters.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-white/40">
                      Parameters
                    </div>
                    {spec.parameters.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <label className="text-xs text-white/60 flex items-center gap-2">
                          <span className="font-mono text-[#F7931A]">
                            {p.name}
                          </span>
                          {p.required !== false && (
                            <span className="text-red-400">*</span>
                          )}
                          {p.description && (
                            <span className="text-white/30">
                              — {p.description}
                            </span>
                          )}
                        </label>
                        <Input
                          value={params[p.name] ?? ""}
                          onChange={(e) =>
                            setParams({ ...params, [p.name]: e.target.value })
                          }
                          placeholder={
                            p.default !== undefined
                              ? `default: ${String(p.default)}`
                              : ""
                          }
                          className="font-mono text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Steps preview */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    Steps ({spec.steps.length})
                  </div>
                  <div className="space-y-1">
                    {spec.steps.map((s, i) => (
                      <div
                        key={s.name}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span className="font-mono text-white/30 w-6">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[#F7931A] w-32 truncate">
                          {s.name}
                        </span>
                        <span className="text-white/60 truncate flex-1">
                          {s.action_label}
                        </span>
                        {s.memrefs.length > 0 && (
                          <span className="text-[10px] text-white/30 font-mono">
                            → {s.memrefs.join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={launch}
                    disabled={submitting || !!runId && run?.status === "running"}
                    className="gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Run recipe
                  </Button>
                  {submitError && (
                    <span className="text-xs text-red-400 font-mono">
                      {submitError}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Live progress */}
          {runId && run && (
            <Card className="glow-card border-[#00F0FF]/20">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-[#00F0FF]" />
                    <span className="text-sm font-semibold text-white/80">
                      Live run
                    </span>
                    <Badge
                      className={
                        run.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : run.status === "failed"
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20"
                      }
                    >
                      {run.status}
                    </Badge>
                    {run.dry_run && (
                      <Badge className="bg-white/[0.04] text-white/50 border-white/10">
                        dry-run
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-white/30">
                    {run.id}
                  </span>
                </div>

                <div className="space-y-2">
                  {run.steps.map((s) => (
                    <StepRow key={s.name} step={s} />
                  ))}
                </div>

                {run.chain_head_after && (
                  <div className="pt-2 border-t border-white/5 text-[11px] font-mono text-white/40 flex items-center gap-2">
                    <span>head:</span>
                    <Link
                      href={`/explorer?q=${run.chain_head_after}`}
                      className="text-[#00F0FF] hover:underline truncate"
                    >
                      {run.chain_head_after}
                    </Link>
                    <ArrowRight className="h-3 w-3 text-white/30" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Report */}
          {report && (
            <Card className="glow-card">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#A855F7]" />
                  <span className="text-sm font-semibold text-white/80">
                    Provenance report
                  </span>
                  {report.validation.verified ? (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                      <Check className="h-3 w-3" /> verified
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                      <X className="h-3 w-3" /> failed
                    </Badge>
                  )}
                  {report.duration_seconds != null && (
                    <span className="text-[10px] text-white/40 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {report.duration_seconds.toFixed(2)}s
                    </span>
                  )}
                </div>

                <pre className="text-[11px] leading-relaxed text-white/70 font-mono whitespace-pre overflow-x-auto">
                  {report.dag_ascii}
                </pre>

                {report.settlement.settled && (
                  <div className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                    <Zap className="h-3 w-3" />
                    Settled {report.settlement.amount_sats?.toLocaleString()} sats ·{" "}
                    {report.settlement.record_id?.slice(0, 16)}…
                  </div>
                )}

                {report.inscription_cmd && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                      Bitcoin inscription command
                    </div>
                    <pre className="text-[10px] text-white/60 font-mono bg-black/60 p-3 rounded-lg border border-white/5 overflow-x-auto">
                      {report.inscription_cmd}
                    </pre>
                  </div>
                )}

                {report.error && (
                  <div className="text-xs text-red-400 font-mono">
                    {report.error}
                  </div>
                )}

                {report.explorer_url && (
                  <Link
                    href={`/explorer?q=${report.chain_head_after}`}
                    className="text-xs text-[#00F0FF] hover:underline inline-flex items-center gap-1"
                  >
                    Inspect the chain in the DAG explorer
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  active,
  onClick,
}: {
  recipe: RecipeSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left">
      <Card
        className={`glow-card transition-colors ${
          active
            ? "border-[#F7931A]/50 shadow-[0_0_24px_rgba(247,147,26,0.15)]"
            : "hover:border-white/[0.12]"
        }`}
      >
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-[#F7931A]">
              {recipe.name}
            </span>
            <span className="text-[10px] text-white/30 font-mono">
              {recipe.steps.length} steps
            </span>
          </div>
          <p className="text-[11px] text-white/50 line-clamp-2 whitespace-pre-line">
            {recipe.description}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {recipe.arc.settle_on_complete && (
              <Badge className="bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20 gap-1 text-[9px]">
                <Zap className="h-2.5 w-2.5" />
                {recipe.arc.settlement_amount_sats.toLocaleString()} sats
              </Badge>
            )}
            <Badge className="bg-white/[0.03] text-white/50 border-white/10 text-[9px]">
              {recipe.arc.memref_strategy}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function StepRow({
  step,
}: {
  step: RecipeRunStatus["steps"][number];
}) {
  const icon =
    step.status === "ok" ? (
      <Check className="h-3 w-3 text-emerald-400" />
    ) : step.status === "skipped" ? (
      <Check className="h-3 w-3 text-white/40" />
    ) : step.status === "failed" ? (
      <X className="h-3 w-3 text-red-400" />
    ) : step.status === "running" ? (
      <Loader2 className="h-3 w-3 animate-spin text-[#F7931A]" />
    ) : (
      <span className="h-3 w-3 rounded-full border border-white/20 block" />
    );
  return (
    <div className="flex items-center gap-3 text-xs border-l-2 border-white/5 pl-3 py-1">
      <span className="w-4">{icon}</span>
      <span className="font-mono text-[#F7931A] w-32 truncate">{step.name}</span>
      <span className="text-white/70 truncate flex-1">{step.action_label}</span>
      {step.record_id ? (
        <Link
          href={`/explorer?q=${step.record_id}`}
          className="font-mono text-[10px] text-[#00F0FF] hover:underline"
        >
          {step.record_id.slice(0, 12)}…
        </Link>
      ) : (
        <span className="font-mono text-[10px] text-white/20">—</span>
      )}
      {step.cached && (
        <Badge className="bg-white/[0.04] text-white/50 border-white/10 text-[9px]">
          cached
        </Badge>
      )}
    </div>
  );
}
