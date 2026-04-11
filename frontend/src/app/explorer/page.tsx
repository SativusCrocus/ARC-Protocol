"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RecordCard } from "@/components/record-card";
import { ChainViewer } from "@/components/chain-viewer";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

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
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Explorer</h2>
        <p className="text-zinc-400 mt-1">
          Search and visualize ARC provenance chains
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
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
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Chain Visualization
          </h3>
          <div className="h-[350px] border border-zinc-800 rounded-lg overflow-hidden">
            <ChainViewer records={chain} />
          </div>
        </div>
      )}

      {chainLoading && (
        <Card>
          <CardContent className="p-6 text-center text-zinc-500">
            Searching...
          </CardContent>
        </Card>
      )}

      {chainError && (
        <Card className="border-red-500/20">
          <CardContent className="p-4">
            <p className="text-sm text-red-500">
              Not found. Check the record ID or pubkey.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Records List */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">
          {query ? `Results for ${query.slice(0, 16)}...` : "All Records"}
          {displayRecords && (
            <span className="text-zinc-600 ml-2">
              ({displayRecords.length})
            </span>
          )}
        </h3>
        <div className="space-y-2">
          {displayRecords?.map(({ id, record }) => (
            <RecordCard key={id} id={id} record={record} />
          ))}
          {!displayRecords?.length && !chainLoading && !query && (
            <Card>
              <CardContent className="p-8 text-center text-zinc-500">
                No records yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
