"use client";

import { use, Suspense } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle, XCircle, Copy } from "lucide-react";

const ChainViewer = dynamic(
  () =>
    import("@/components/chain-viewer").then((m) => ({
      default: m.ChainViewer,
    })),
  { ssr: false }
);

const typeColors: Record<string, string> = {
  genesis: "bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20",
  action: "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20",
  settlement: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ["record", id],
    queryFn: () => api.record(id),
  });

  const { data: chain } = useQuery({
    queryKey: ["chain", id],
    queryFn: () => api.chain(id),
    enabled: !!data,
  });

  const { data: inscriptionData } = useQuery({
    queryKey: ["inscription", id],
    queryFn: () => api.inscription(id),
    enabled: !!data,
  });

  const validation = useMutation({ mutationFn: () => api.validate(id) });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg skeleton-shimmer" />
        <div className="h-64 rounded-xl skeleton-shimmer" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-white/25">
          Record not found.
        </CardContent>
      </Card>
    );
  }

  const { record } = data;

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/explorer"
            className="text-xs text-white/25 hover:text-white/50 flex items-center gap-1 mb-3 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Explorer
          </Link>
          <h2 className="text-xl font-bold tracking-tight truncate text-white/90">
            {record.action}
          </h2>
          <button
            onClick={() => navigator.clipboard.writeText(id)}
            className="text-[11px] font-mono text-white/20 hover:text-white/40 flex items-center gap-1.5 mt-1.5 transition-colors"
          >
            {id.slice(0, 32)}&hellip;
            <Copy className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={typeColors[record.type]}>{record.type}</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => validation.mutate()}
            disabled={validation.isPending}
          >
            {validation.isPending
              ? "..."
              : validation.data
                ? validation.data.valid
                  ? "\u2713 Valid"
                  : "\u2717 Invalid"
                : "Validate"}
          </Button>
        </div>
      </div>

      {/* Validation Result */}
      <AnimatePresence>
        {validation.data && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card
              className={
                validation.data.valid
                  ? "border-emerald-500/20"
                  : "border-red-500/20"
              }
            >
              <CardContent className="p-4 flex items-start gap-3">
                {validation.data.valid ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-emerald-400 font-medium">
                        Valid &ndash; full chain verified
                      </p>
                      <p className="text-xs text-white/25 mt-1">
                        All signatures, timestamps, and references checked
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-red-400 font-medium mb-1">
                        Validation failed
                      </p>
                      {validation.data.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-400/70">
                          &bull; {e}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen Chain Viewer */}
      {chain && chain.length > 1 && (
        <div className="h-[300px] border border-white/[0.04] rounded-xl overflow-hidden">
          <Suspense
            fallback={<div className="h-full skeleton-shimmer rounded-xl" />}
          >
            <ChainViewer records={chain} />
          </Suspense>
        </div>
      )}

      {/* Record Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-white/40 font-medium">
            Record Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <Field label="Type" value={record.type} />
            <Field
              label="Timestamp"
              value={new Date(record.ts).toLocaleString()}
            />
            <Field
              label="Agent Pubkey"
              value={record.agent.pubkey}
              mono
              truncate
            />
            <Field label="Alias" value={record.agent.alias || "\u2014"} />
            <Field label="Input Hash" value={record.ihash} mono truncate />
            <Field label="Output Hash" value={record.ohash} mono truncate />
          </div>

          {record.prev && (
            <div className="mt-4 pt-4 border-t border-white/[0.04]">
              <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                Previous Record
              </p>
              <Link
                href={`/explorer/${record.prev}`}
                className="text-xs font-mono text-[#F7931A]/70 hover:text-[#F7931A] transition-colors"
              >
                {record.prev}
              </Link>
            </div>
          )}

          {record.memrefs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.04]">
              <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                Memory References ({record.memrefs.length})
              </p>
              <div className="space-y-1">
                {record.memrefs.map((m) => (
                  <Link
                    key={m}
                    href={`/explorer/${m}`}
                    className="block text-xs font-mono text-[#00F0FF]/60 hover:text-[#00F0FF] transition-colors"
                  >
                    {m}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {record.settlement && (
            <div className="mt-4 pt-4 border-t border-white/[0.04]">
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                <p className="text-sm text-emerald-400 font-medium">
                  Lightning Settlement:{" "}
                  {record.settlement.amount_sats.toLocaleString()} sats
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-white/30">
                    <span className="text-white/20">Payment Hash:</span>{" "}
                    <span className="font-mono">
                      {record.settlement.payment_hash}
                    </span>
                  </p>
                  {record.settlement.preimage && (
                    <p className="text-xs text-white/30">
                      <span className="text-white/20">Preimage:</span>{" "}
                      <span className="font-mono text-[#F7931A]/70">
                        {record.settlement.preimage}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-white/[0.04]">
            <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
              Schnorr Signature
            </p>
            <p className="text-[11px] font-mono text-white/20 break-all select-all">
              {record.sig}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bitcoin Inscription Command */}
      {inscriptionData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-white/40 font-medium">
              Bitcoin Inscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-[11px] font-mono text-white/25 whitespace-pre-wrap break-all bg-black/50 p-4 rounded-lg overflow-auto max-h-48 border border-white/[0.03]">
              {inscriptionData.command}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-white/25 mb-0.5 uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-sm ${mono ? "font-mono text-xs text-white/50" : "text-white/70"} ${
          truncate ? "truncate" : ""
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
