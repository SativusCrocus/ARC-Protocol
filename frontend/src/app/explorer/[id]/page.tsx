"use client";

import { use } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChainViewer } from "@/components/chain-viewer";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, Copy } from "lucide-react";

const typeColors: Record<string, string> = {
  genesis: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  action: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  settlement: "bg-green-500/10 text-green-500 border-green-500/20",
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
        <div className="h-8 w-48 bg-zinc-900 rounded animate-pulse" />
        <div className="h-64 bg-zinc-900 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-zinc-500">
          Record not found.
        </CardContent>
      </Card>
    );
  }

  const { record } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/explorer"
            className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Explorer
          </Link>
          <h2 className="text-xl font-bold tracking-tight truncate">
            {record.action}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => navigator.clipboard.writeText(id)}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              {id.slice(0, 32)}&hellip;
              <Copy className="h-3 w-3" />
            </button>
          </div>
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
              ? "Validating..."
              : validation.data
                ? validation.data.valid
                  ? "Valid"
                  : "Invalid"
                : "Validate"}
          </Button>
        </div>
      </div>

      {/* Validation Result */}
      {validation.data && (
        <Card
          className={
            validation.data.valid
              ? "border-green-500/30"
              : "border-red-500/30"
          }
        >
          <CardContent className="p-4 flex items-start gap-3">
            {validation.data.valid ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-green-500 font-medium">
                    Valid &ndash; full chain verified
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    All signatures, timestamps, and references checked
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-500 font-medium mb-1">
                    Validation failed
                  </p>
                  {validation.data.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-400">
                      &bull; {e}
                    </p>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chain Viewer */}
      {chain && chain.length > 1 && (
        <div className="h-[250px] border border-zinc-800 rounded-lg overflow-hidden">
          <ChainViewer records={chain} />
        </div>
      )}

      {/* Record Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record Details</CardTitle>
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
            <Field
              label="Alias"
              value={record.agent.alias || "\u2014"}
            />
            <Field label="Input Hash" value={record.ihash} mono truncate />
            <Field label="Output Hash" value={record.ohash} mono truncate />
          </div>

          {/* Prev */}
          {record.prev && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1">Previous Record</p>
              <Link
                href={`/explorer/${record.prev}`}
                className="text-xs font-mono text-orange-500 hover:underline"
              >
                {record.prev}
              </Link>
            </div>
          )}

          {/* Memrefs */}
          {record.memrefs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1">
                Memory References ({record.memrefs.length})
              </p>
              <div className="space-y-1">
                {record.memrefs.map((m) => (
                  <Link
                    key={m}
                    href={`/explorer/${m}`}
                    className="block text-xs font-mono text-blue-500 hover:underline"
                  >
                    {m}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Settlement */}
          {record.settlement && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                <p className="text-sm text-green-500 font-medium">
                  Lightning Settlement: {record.settlement.amount_sats.toLocaleString()}{" "}
                  sats
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-zinc-400">
                    <span className="text-zinc-500">Payment Hash:</span>{" "}
                    <span className="font-mono">
                      {record.settlement.payment_hash}
                    </span>
                  </p>
                  {record.settlement.preimage && (
                    <p className="text-xs text-zinc-400">
                      <span className="text-zinc-500">Preimage:</span>{" "}
                      <span className="font-mono text-orange-500">
                        {record.settlement.preimage}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Signature */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">Schnorr Signature</p>
            <p className="text-xs font-mono text-zinc-400 break-all select-all">
              {record.sig}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inscription Command */}
      {inscriptionData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Bitcoin Inscription Command
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all bg-zinc-950 p-4 rounded-lg overflow-auto max-h-48">
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
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p
        className={`text-sm ${mono ? "font-mono text-xs" : ""} ${
          truncate ? "truncate" : ""
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
