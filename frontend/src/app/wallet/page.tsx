"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, KeyRound, ShieldAlert } from "lucide-react";

export default function WalletPage() {
  const [alias, setAlias] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["keys"],
    queryFn: api.keys,
  });

  const { data: records } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
  });

  const qc = useQueryClient();
  const keygen = useMutation({
    mutationFn: () => api.keygen(alias || undefined),
    onSuccess: () => {
      setAlias("");
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  function copyPubkey(pubkey: string) {
    navigator.clipboard.writeText(pubkey);
    setCopied(pubkey);
    setTimeout(() => setCopied(null), 2000);
  }

  function getAgentStats(pubkey: string) {
    if (!records) return { count: 0, settlements: 0, sats: 0 };
    const agentRecords = records.filter(
      (r) => r.record.agent.pubkey === pubkey
    );
    return {
      count: agentRecords.length,
      settlements: agentRecords.filter(
        (r) => r.record.type === "settlement"
      ).length,
      sats: agentRecords.reduce(
        (sum, r) => sum + (r.record.settlement?.amount_sats || 0),
        0
      ),
    };
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Wallet</h2>
        <p className="text-zinc-400 mt-1">Manage Taproot keypairs</p>
      </div>

      {/* Generate */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Keypair</CardTitle>
          <p className="text-sm text-zinc-400">
            Create a new BIP-340 Schnorr keypair for agent identity
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Alias (optional)</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="my-agent"
            />
          </div>
          <Button
            onClick={() => keygen.mutate()}
            disabled={keygen.isPending}
            className="w-full"
          >
            <KeyRound className="h-4 w-4 mr-2" />
            {keygen.isPending ? "Generating..." : "Generate New Keypair"}
          </Button>
          {keygen.data && (
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-2">
              <p className="text-sm text-green-500 font-medium">
                Keypair generated
              </p>
              <div>
                <p className="text-xs text-zinc-500">Public Key (x-only)</p>
                <p className="text-xs font-mono text-zinc-300 select-all">
                  {keygen.data.pubkey}
                </p>
              </div>
              <div className="p-2 bg-red-500/5 border border-red-500/20 rounded">
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Secret key stored locally at ~/.arc/keys/. Never share.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Your Keys</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-20 bg-zinc-900 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : keys?.length ? (
          <div className="space-y-3">
            {keys.map((k) => {
              const stats = getAgentStats(k.pubkey);
              return (
                <Card key={k.pubkey}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium">{k.name}</p>
                          {stats.count > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5"
                            >
                              {stats.count} records
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs font-mono text-zinc-400 truncate">
                          {k.pubkey}
                        </p>
                        {stats.count > 0 && (
                          <div className="flex gap-4 mt-2">
                            <p className="text-xs text-zinc-500">
                              Chain length:{" "}
                              <span className="text-zinc-300">
                                {stats.count}
                              </span>
                            </p>
                            {stats.sats > 0 && (
                              <p className="text-xs text-zinc-500">
                                Settled:{" "}
                                <span className="text-green-500">
                                  {stats.sats.toLocaleString()} sats
                                </span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyPubkey(k.pubkey)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        {copied === k.pubkey ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-zinc-500">
              No keys yet. Generate one above.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Security Notice */}
      <Card className="border-yellow-500/20">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-500 font-medium">
              Security Notice
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Private keys are stored in ~/.arc/keys/ with restricted
              permissions. This implementation is for development and testing.
              For production use with real Bitcoin, use a hardware wallet and
              never store mainnet keys on disk.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
