"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RecordCard } from "@/components/record-card";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Search, GitBranch } from "lucide-react";

const ChainViewer = dynamic(
  () => import("@/components/chain-viewer").then((m) => ({ default: m.ChainViewer })),
  { ssr: false }
);

export default function ExplorerPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data: records } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
  });

  const {
    data: chain,
    isLoading: chainLoading,
    error: chainError,
  } = useQuery({
    queryKey: ["chain", query],
    queryFn: () => api.chain(query),
    enabled: !!query,
  });

  function doSearch() {
    if (search.trim()) setQuery(search.trim());
  }

  const displayRecords = chain || records;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tighter">
          <span className="text-[#00F0FF]">Memory</span>{" "}
          <span className="text-white/90">DAG</span>
        </h2>
        <p className="text-white/25 text-sm mt-1">
          Search and visualize provenance chains
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by record ID or agent pubkey..."
            className="pl-10 font-mono text-xs"
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
        </div>
        <Button onClick={doSearch} disabled={!search.trim()}>
          Search
        </Button>
        {query && (
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setSearch("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Chain Viewer */}
      {chain && chain.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="h-3.5 w-3.5 text-[#00F0FF]/50" />
            <h3 className="text-xs font-medium text-white/30 uppercase tracking-wider">
              Chain Visualization
            </h3>
          </div>
          <div className="h-[400px] border border-white/[0.04] rounded-xl overflow-hidden">
            <Suspense
              fallback={
                <div className="h-full skeleton-shimmer rounded-xl" />
              }
            >
              <ChainViewer records={chain} />
            </Suspense>
          </div>
        </motion.div>
      )}

      {chainLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[#F7931A]" />
            <p className="text-sm text-white/25 mt-3">Searching...</p>
          </CardContent>
        </Card>
      )}

      {chainError && (
        <Card className="border-red-500/10">
          <CardContent className="p-4">
            <p className="text-sm text-red-400/80">
              Not found. Check the record ID or pubkey.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Records List */}
      <div>
        <h3 className="text-xs font-medium text-white/30 mb-3 uppercase tracking-wider">
          {query
            ? `Results for ${query.slice(0, 16)}...`
            : "All Records"}
          {displayRecords && (
            <span className="text-white/15 ml-2">
              ({displayRecords.length})
            </span>
          )}
        </h3>
        <div className="space-y-2">
          {displayRecords?.map(({ id, record }, i) => (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015 }}
            >
              <RecordCard id={id} record={record} />
            </motion.div>
          ))}
          {!displayRecords?.length && !chainLoading && !query && (
            <Card>
              <CardContent className="p-8 text-center text-white/20 text-sm">
                No records yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </motion.div>
  );
}
