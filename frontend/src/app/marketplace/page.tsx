"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Play,
  Zap,
  ArrowRight,
  CheckCircle2,
  Shield,
  Users,
  Loader2,
  Store,
  Clock,
  FileText,
} from "lucide-react";
import type { ServiceJob, DemoResult, DemoStep } from "@/lib/types";

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  requested: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  offered: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  accepted: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  delivered: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  paid: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

const STEP_META: { label: string; agent: string; color: string }[] = [
  { label: "REQUEST", agent: "Customer", color: "#00F0FF" },
  { label: "OFFER", agent: "Service", color: "#F7931A" },
  { label: "ACCEPT", agent: "Customer", color: "#00F0FF" },
  { label: "DELIVER", agent: "Service", color: "#F7931A" },
  { label: "PAYMENT", agent: "Customer", color: "#22c55e" },
  { label: "RECEIPT", agent: "Service", color: "#22c55e" },
];

export default function MarketplacePage() {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: jobs = [] } = useQuery<ServiceJob[]>({
    queryKey: ["service-jobs"],
    queryFn: () => api.serviceJobs(),
    refetchInterval: 5000,
  });

  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);

  const demo = useMutation({
    mutationFn: () => api.serviceDemo(),
    onSuccess: (data) => {
      setDemoResult(data);
      setVisibleSteps(0);
      qc.invalidateQueries({ queryKey: ["service-jobs"] });
      qc.invalidateQueries({ queryKey: ["records"] });
    },
  });

  // Animate steps appearing one by one
  useEffect(() => {
    if (!demoResult || visibleSteps >= demoResult.steps.length) return;
    const timer = setTimeout(() => setVisibleSteps((v) => v + 1), 400);
    return () => clearTimeout(timer);
  }, [demoResult, visibleSteps]);

  const stats = {
    total: jobs.length,
    active: jobs.filter((j) => !["completed"].includes(j.status)).length,
    completed: jobs.filter((j) => j.status === "completed").length,
    settled: jobs.filter((j) => j.status === "completed").reduce((s, j) => s + j.amount_sats, 0),
  };

  return (
    <div className="space-y-8 anim-fade-up">
      {/* Hero */}
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span
            className="text-[#F7931A]"
            style={{
              textShadow: "0 0 40px rgba(247,147,26,0.3), 0 0 80px rgba(247,147,26,0.1)",
            }}
          >
            Service
          </span>{" "}
          <span className="text-white/90">Marketplace</span>
        </h2>
        <p className="text-white/25 text-sm mt-2 max-w-xl">
          Autonomous agents trade services over ARC Protocol. Customer requests
          a task, service agent delivers, Lightning settles the invoice. Every
          step is a signed, chain-linked record with full provenance.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Jobs", value: stats.total, icon: FileText },
          { label: "Active", value: stats.active, icon: Clock },
          { label: "Completed", value: stats.completed, icon: CheckCircle2 },
          { label: "Sats Settled", value: stats.settled.toLocaleString(), icon: Zap },
        ].map((s, i) => (
          <Card key={s.label} className={`anim-fade-up anim-delay-${i + 1}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className="h-3.5 w-3.5 text-white/20" />
                <p className="text-[10px] text-white/25 uppercase tracking-wider">{s.label}</p>
              </div>
              <p className="text-2xl font-bold text-white/90 anim-count-up">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Run Demo */}
      <Card className="glow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[#F7931A]" />
              Two-Agent Demo
            </CardTitle>
            <Badge className="bg-white/[0.04] text-white/40 border-white/[0.06]">
              6-step protocol
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-white/30 leading-relaxed">
            Runs the full marketplace flow: Customer requests mempool analysis
            &rarr; Service offers at 2,000 sats &rarr; Customer accepts &rarr;
            Service delivers &rarr; Customer pays via Lightning &rarr; Service
            confirms receipt. All records are signed with BIP-340 Schnorr and
            cross-linked via memrefs.
          </p>

          <Button
            onClick={() => {
              setDemoResult(null);
              setVisibleSteps(0);
              demo.mutate();
            }}
            disabled={demo.isPending}
            className="w-full gap-2"
          >
            {demo.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running 6-step protocol...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Full Demo
              </>
            )}
          </Button>

          {demo.isError && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{demo.error.message}</p>
            </div>
          )}

          {/* Demo Steps Timeline */}
          <AnimatePresence>
            {demoResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2 pt-2"
              >
                {demoResult.steps.map((step: DemoStep, i: number) => {
                  const meta = STEP_META[i];
                  const visible = i < visibleSteps;
                  return (
                    <motion.div
                      key={step.step}
                      initial={{ opacity: 0, x: -12 }}
                      animate={visible ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: `${meta.color}15`,
                          color: meta.color,
                          boxShadow: visible ? `0 0 12px ${meta.color}30` : "none",
                        }}
                      >
                        {step.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: meta.color }}
                          >
                            {meta.agent}
                          </span>
                          <span className="text-[10px] text-white/20">&rarr;</span>
                          <span className="text-xs text-white/60 font-medium">{meta.label}</span>
                          {step.action === "PAYMENT" && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                              <Zap className="h-2.5 w-2.5 mr-0.5" />
                              {(step.record?.settlement?.amount_sats ?? 0).toLocaleString()} sats
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-white/20 font-mono truncate mt-0.5">
                          {step.record?.action?.slice(0, 80) ?? ""}
                        </p>
                      </div>
                      {visible && (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0"
                          style={{ color: meta.color }}
                        />
                      )}
                    </motion.div>
                  );
                })}

                {/* Completion CTA */}
                {visibleSteps >= demoResult.steps.length && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="pt-2"
                  >
                    <Card className="border-emerald-500/20 glass-active relative">
                      <div className="ripple absolute inset-0 rounded-lg pointer-events-none" />
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Shield className="h-5 w-5 text-emerald-400" />
                          <div>
                            <p className="text-sm text-emerald-400 font-medium">
                              Protocol complete — all records signed and verified
                            </p>
                            <p className="text-[11px] text-white/20 mt-0.5">
                              Cross-agent provenance DAG ready for dispute resolution
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => router.push(`/marketplace/${demoResult.job_id}`)}
                        >
                          Dispute View
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Job Listing */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider">
            All Jobs
          </h3>
          <div className="space-y-2">
            {jobs.map((job) => {
              const s = STATUS_STYLES[job.status] ?? STATUS_STYLES.requested;
              return (
                <Link key={job.id} href={`/marketplace/${job.id}`}>
                  <Card className="hover:border-white/[0.08] transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-4">
                      <Store className="h-4 w-4 text-white/15 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/70 truncate">{job.task}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-mono text-white/20">
                            {job.id}
                          </span>
                          <span className="text-[10px] text-white/15">
                            {new Date(job.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {job.amount_sats > 0 && (
                        <div className="text-xs text-white/40 flex items-center gap-1 shrink-0">
                          <Zap className="h-3 w-3 text-[#F7931A]/60" />
                          {job.amount_sats.toLocaleString()}
                        </div>
                      )}
                      <Badge className={`${s.bg} ${s.text} ${s.border} shrink-0`}>
                        {job.status}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-white/15 shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
