"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MemoryRecord, MemoryType } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Search,
  Clock,
  GitCommit,
  User,
  Hash,
  ArrowRight,
  Layers,
  Sparkles,
  Trash2,
} from "lucide-react";

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: "text-[#00F0FF] border-[#00F0FF]/30 bg-[#00F0FF]/10",
  decision: "text-[#F7931A] border-[#F7931A]/30 bg-[#F7931A]/10",
  preference: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  context: "text-white/60 border-white/20 bg-white/5",
  learning: "text-[#A855F7] border-[#A855F7]/30 bg-[#A855F7]/10",
};

const TOMBSTONE_MARKER = "__ARC_MEMORY_TOMBSTONE__";

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: searchResult, isLoading: searchLoading } = useQuery({
    queryKey: ["memory", "search", query],
    queryFn: () => api.memorySearch(query, undefined, 200),
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["memory", "stats"],
    queryFn: api.memoryStats,
    refetchInterval: 60_000,
  });

  const { data: timeline } = useQuery({
    queryKey: ["memory", "timeline", selectedKey],
    queryFn: () => api.memoryTimeline(selectedKey || ""),
    enabled: !!selectedKey,
  });

  const memories = searchResult?.results || [];

  const byAgent = useMemo(() => {
    const groups = new Map<string, MemoryRecord[]>();
    for (const m of memories) {
      const key = m.record.agent.alias || m.record.agent.pubkey.slice(0, 16);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries()).sort(
      (a, b) => b[1].length - a[1].length,
    );
  }, [memories]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-[#A855F7]/10 border border-[#A855F7]/20">
            <Database className="h-5 w-5 text-[#A855F7]" />
          </div>
          <Badge className="bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20">
            VERIFIABLE CROSS-SESSION MEMORY
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">
          <span className="text-[#A855F7] text-glow-cyan">Memory Layer</span>{" "}
          <span className="text-white/90">
            — Schnorr-signed memory for Goose
          </span>
        </h1>
        <p className="text-white/40 text-sm mt-3 max-w-3xl">
          Every memory is a{" "}
          <span className="text-white/70">BIP-340 Schnorr-signed</span> ARC
          record, hash-chained to the agent&apos;s DAG. Goose writes memories
          via the <span className="text-white/70">arc_memory_store</span>{" "}
          MCP tool; future sessions recall them via{" "}
          <span className="text-white/70">arc_memory_recall</span> /{" "}
          <span className="text-white/70">arc_memory_latest</span>. Tamper any
          byte and the signature fails.
        </p>
        <div className="accent-line w-48 mt-4" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: "Total memories",
            value: stats?.total ?? 0,
            color: "text-[#A855F7]",
          },
          {
            label: "Agents",
            value: stats?.by_agent_count ?? 0,
            color: "text-[#00F0FF]",
          },
          {
            label: "Tombstoned",
            value: stats?.tombstoned ?? 0,
            color: "text-white/50",
          },
          {
            label: "Expired",
            value: stats?.expired ?? 0,
            color: "text-white/40",
          },
          {
            label: "Fact / Decision",
            value: `${stats?.by_type?.fact ?? 0} / ${stats?.by_type?.decision ?? 0}`,
            color: "text-emerald-400",
          },
        ].map((s) => (
          <Card key={s.label} className="glow-card">
            <CardContent className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
                {s.label}
              </div>
              <div className={`text-xl font-bold tracking-tight ${s.color}`}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top keys */}
      {stats && stats.top_keys && stats.top_keys.length > 0 && (
        <Card className="glow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-white/80">
              <Sparkles className="h-4 w-4 text-[#F7931A]" />
              Most active keys
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.top_keys.map((k) => (
                <button
                  key={k.key}
                  onClick={() => setSelectedKey(k.key)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-[#A855F7]/40 text-xs font-mono text-white/70 hover:text-[#A855F7] transition-colors"
                >
                  <span className="text-[#A855F7]">{k.key}</span>
                  <span className="text-white/30 ml-2">×{k.count}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by key pattern — user., project.api., task.bug123., …"
            className="pl-10 font-mono text-sm"
          />
        </div>
        {query && (
          <Button variant="outline" onClick={() => setQuery("")}>
            Clear
          </Button>
        )}
      </div>

      {/* Timeline view (when a key is selected) */}
      {selectedKey && (
        <Card className="glow-card border-[#A855F7]/20">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                  Timeline for key
                </div>
                <div className="font-mono text-[#A855F7] text-sm">
                  {selectedKey}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedKey(null)}
              >
                Close
              </Button>
            </div>
            {timeline?.history?.length ? (
              <div className="space-y-2">
                {timeline.history.map((entry, i) => (
                  <MemoryRow
                    key={entry.id}
                    entry={entry}
                    indexLabel={
                      i === 0
                        ? "HEAD"
                        : `−${i}`
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40">No history for this key.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Memory list */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#A855F7]" />
          {query ? `Results for "${query}"` : "All memories"}
          <span className="text-white/30">({memories.length})</span>
        </h2>

        {searchLoading && (
          <Card className="glow-card">
            <CardContent className="p-8 text-center text-white/40">
              Searching…
            </CardContent>
          </Card>
        )}

        {!searchLoading && memories.length === 0 && (
          <Card className="glow-card">
            <CardContent className="p-8 text-center text-white/40 text-sm">
              No memories yet. Agents write memories via the{" "}
              <span className="text-white/70 font-mono">arc_memory_store</span>{" "}
              MCP tool.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {memories.map((m) => (
            <MemoryRow
              key={m.id}
              entry={m}
              onSelectKey={(k) => setSelectedKey(k)}
            />
          ))}
        </div>
      </div>

      {/* Agent-grouped view */}
      {byAgent.length > 1 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <User className="h-4 w-4 text-[#00F0FF]" />
            Grouped by agent
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {byAgent.map(([agent, list]) => (
              <Card key={agent} className="glow-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-xs text-[#00F0FF]">
                      {agent}
                    </div>
                    <Badge className="bg-white/[0.04] text-white/60 border-white/10">
                      {list.length}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs font-mono text-white/60">
                    {list.slice(0, 5).map((m) => (
                      <div key={m.id} className="truncate">
                        <span className="text-[#A855F7]">
                          {m.record.memory_key}
                        </span>
                        <span className="text-white/30 mx-1">=</span>
                        <span className="text-white/70">
                          {m.record.memory_value.slice(0, 48)}
                          {m.record.memory_value.length > 48 ? "…" : ""}
                        </span>
                      </div>
                    ))}
                    {list.length > 5 && (
                      <div className="text-white/30 italic">
                        +{list.length - 5} more
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryRow({
  entry,
  onSelectKey,
  indexLabel,
}: {
  entry: MemoryRecord;
  onSelectKey?: (key: string) => void;
  indexLabel?: string;
}) {
  const r = entry.record;
  const mtype = (r.memory_type || "context") as MemoryType;
  const isTombstone = r.memory_value === TOMBSTONE_MARKER;
  const valPreview = isTombstone
    ? "(tombstoned — memory soft-deleted)"
    : r.memory_value.slice(0, 200);

  return (
    <Card className="glow-card hover:border-[#A855F7]/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {indexLabel && (
            <div className="font-mono text-[10px] text-white/30 min-w-[40px] pt-1">
              {indexLabel}
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={TYPE_COLORS[mtype]}>{mtype}</Badge>
              <button
                onClick={() => onSelectKey?.(r.memory_key || "")}
                className="font-mono text-sm text-[#A855F7] hover:underline truncate"
                title="View timeline for this key"
              >
                {r.memory_key}
              </button>
              {r.supersedes && (
                <Badge className="bg-white/[0.04] text-white/50 border-white/10 gap-1">
                  <GitCommit className="h-3 w-3" />
                  supersedes {r.supersedes.slice(0, 8)}…
                </Badge>
              )}
              {r.ttl && (
                <Badge className="bg-white/[0.04] text-white/50 border-white/10 gap-1">
                  <Clock className="h-3 w-3" />
                  ttl {r.ttl}s
                </Badge>
              )}
              {isTombstone && (
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                  <Trash2 className="h-3 w-3" />
                  tombstone
                </Badge>
              )}
            </div>
            <p
              className={`text-sm ${
                isTombstone
                  ? "italic text-white/30"
                  : "text-white/80 font-mono"
              } break-words`}
            >
              {valPreview}
              {!isTombstone && r.memory_value.length > 200 && "…"}
            </p>
            <div className="flex items-center gap-3 text-[10px] text-white/35 font-mono flex-wrap">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {entry.id.slice(0, 16)}…
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {r.agent.alias || r.agent.pubkey.slice(0, 12) + "…"}
              </span>
              <span>{new Date(r.ts).toLocaleString()}</span>
              <Link
                href={`/explorer?q=${entry.id}`}
                className="text-[#00F0FF] hover:underline ml-auto flex items-center gap-1"
              >
                Inspect in DAG
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
