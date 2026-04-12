"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, KeyRound, ShieldAlert, Check } from "lucide-react";

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
      settlements: agentRecords.filter((r) => r.record.type === "settlement")
        .length,
      sats: agentRecords.reduce(
        (sum, r) => sum + (r.record.settlement?.amount_sats || 0),
        0
      ),
    };
  }

  return (
    <div className="max-w-2xl space-y-6 anim-fade-up">
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span className="text-[#F7931A] text-glow-orange">Taproot</span>{" "}
          <span className="text-white/90">Keys</span>
        </h2>
        <p className="text-white/25 text-sm mt-2">
          BIP-340 Schnorr keypair management
        </p>
      </div>

      {/* Generate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#F7931A]" />
            Generate Keypair
          </CardTitle>
          <p className="text-xs text-white/25">
            Create a new agent identity on secp256k1
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
            className="w-full gap-2"
          >
            <KeyRound className="h-4 w-4" />
            {keygen.isPending ? "Generating..." : "Generate New Keypair"}
          </Button>

          <AnimatePresence>
            {keygen.data && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-white/[0.02] rounded-lg border border-white/[0.04] space-y-3 relative"
              >
                <div className="ripple absolute inset-0 rounded-lg pointer-events-none" />
                <p className="text-sm text-emerald-400 font-medium">
                  Keypair generated
                </p>
                <div>
                  <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                    Public Key (x-only)
                  </p>
                  <p className="text-xs font-mono text-white/50 select-all break-all">
                    {keygen.data.pubkey}
                  </p>
                </div>
                <div className="p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg">
                  <p className="text-xs text-red-400/80 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    Secret key stored at ~/.arc/keys/. Never share.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Key List */}
      <div>
        <h3 className="text-xs font-medium text-white/30 mb-3 uppercase tracking-wider">
          Your Keys
        </h3>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg skeleton-shimmer" />
            ))}
          </div>
        ) : keys?.length ? (
          <div className="space-y-2">
            {keys.map((k) => {
              const stats = getAgentStats(k.pubkey);
              return (
                <Card
                  key={k.pubkey}
                  className="hover:border-white/[0.1] transition-all duration-200"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-sm font-medium text-white/80">
                            {k.name}
                          </p>
                          {stats.count > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5"
                            >
                              {stats.count} records
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-white/25 truncate">
                          {k.pubkey}
                        </p>
                        {stats.count > 0 && (
                          <div className="flex gap-4 mt-2">
                            <p className="text-[11px] text-white/20">
                              Chain:{" "}
                              <span className="text-white/50">
                                {stats.count}
                              </span>
                            </p>
                            {stats.sats > 0 && (
                              <p className="text-[11px] text-white/20">
                                Settled:{" "}
                                <span className="text-emerald-400/70">
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
                        className="gap-1.5"
                      >
                        {copied === k.pubkey ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-white/20 text-sm">
              No keys yet. Generate one above.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Security Notice */}
      <Card className="border-[#F7931A]/10">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-[#F7931A]/60 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-[#F7931A]/70 font-medium">
              Security Notice
            </p>
            <p className="text-xs text-white/25 mt-1 leading-relaxed">
              Private keys are stored in ~/.arc/keys/ with restricted
              permissions (0600). This implementation is for development and
              testing. For production use with real Bitcoin, use a hardware
              wallet and never store mainnet keys on disk.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
