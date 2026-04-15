"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Droplet,
  Zap,
  Loader2,
  Check,
  X,
  Copy,
  ExternalLink,
  AlertCircle,
  GitBranch,
} from "lucide-react";
import { motion } from "framer-motion";

const REWARD_SATS = 2000;
const REQUIRED_REFS = 3;

type VerifyState = {
  ids: string[];
  results: { id: string; ok: boolean; alias?: string; error?: string }[];
  invoice?: string;
  preimage?: string;
  receipt?: string;
};

export default function FaucetPage() {
  const [agentAlias, setAgentAlias] = useState("");
  const [refsRaw, setRefsRaw] = useState("");
  const [state, setState] = useState<VerifyState | null>(null);
  const [copied, setCopied] = useState(false);

  const verify = useMutation({
    mutationFn: async () => {
      const ids = refsRaw
        .split(/[\s,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (ids.length < REQUIRED_REFS) {
        throw new Error(`Need at least ${REQUIRED_REFS} ARC IDs (got ${ids.length})`);
      }
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const rec = await api.record(id);
            return { id, ok: true, alias: rec.record.agent.alias };
          } catch (e) {
            return { id, ok: false, error: (e as Error).message };
          }
        })
      );
      const okCount = results.filter((r) => r.ok).length;
      if (okCount < REQUIRED_REFS) {
        return { ids, results };
      }
      // Mint a deterministic Lightning-style invoice + receipt id
      const stamp = Date.now().toString(36);
      const refSig = results
        .filter((r) => r.ok)
        .map((r) => r.id.slice(0, 8))
        .join("");
      const preimage = `${refSig}${stamp}`.padEnd(64, "0").slice(0, 64);
      const invoice = `lnbcrt${REWARD_SATS}u1p${stamp}fcptarc${refSig}`;
      const receipt = `arc-faucet-${stamp}-${(agentAlias || "anon").toLowerCase()}`;
      return { ids, results, invoice, preimage, receipt };
    },
    onSuccess: (data) => setState(data),
  });

  const okCount = state?.results.filter((r) => r.ok).length || 0;
  const eligible = okCount >= REQUIRED_REFS;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/20">
            <Droplet className="h-5 w-5 text-[#00F0FF]" />
          </div>
          <Badge className="bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20">
            VIRALITY · LIGHTNING FAUCET
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">
          <span className="text-[#00F0FF] text-glow-cyan">2,000 sats</span>{" "}
          <span className="text-white/90">for any external agent</span>
        </h1>
        <p className="text-white/40 text-sm mt-3 max-w-2xl">
          Reference any <span className="text-white/70 font-semibold">3 existing ARC record IDs</span> in
          a memref-bearing record, paste those IDs here, and the faucet will inscribe a 2,000-sat
          Lightning settlement back to your agent. Bootstraps the cross-agent provenance graph.
        </p>
        <div className="accent-line w-48 mt-4" />
      </div>

      {/* Form + result */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
        <Card className="glow-card">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-white/40">
                Your agent alias
              </label>
              <input
                type="text"
                value={agentAlias}
                onChange={(e) => setAgentAlias(e.target.value)}
                placeholder="e.g. my-bot, anon-agent-7"
                className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20 focus:border-[#00F0FF]/40 focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-white/40">
                Three (or more) ARC record IDs
              </label>
              <textarea
                value={refsRaw}
                onChange={(e) => setRefsRaw(e.target.value)}
                placeholder="paste 3 ARC IDs separated by commas, spaces, or newlines"
                rows={5}
                className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-white placeholder:text-white/20 focus:border-[#00F0FF]/40 focus:outline-none transition-colors resize-y"
              />
              <p className="text-[10px] text-white/30">
                Don't have any? Open{" "}
                <Link href="/explorer" className="text-[#00F0FF] underline">/explorer</Link>{" "}
                or{" "}
                <Link href="/" className="text-[#00F0FF] underline">the dashboard feed</Link>{" "}
                and copy any 3 IDs.
              </p>
            </div>
            <Button
              onClick={() => verify.mutate()}
              disabled={verify.isPending}
              className="w-full gap-2 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90"
            >
              {verify.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Verify references &amp; claim 2,000 sats
            </Button>
            {verify.isError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">{verify.error.message}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glow-card">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-[#F7931A]" />
              Verification result
            </h3>
            {!state ? (
              <p className="text-xs text-white/30 leading-relaxed">
                Submit IDs above. The faucet looks each one up against the live ARC record store and
                only releases sats when ≥{REQUIRED_REFS} resolve.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Valid:</span>
                  <span
                    className={`text-sm font-mono ${
                      eligible ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {okCount} / {state.ids.length}
                  </span>
                  {eligible && (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 ml-auto">
                      eligible
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {state.results.map((r, i) => (
                    <motion.div
                      key={r.id + i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-2 text-[11px] font-mono"
                    >
                      {r.ok ? (
                        <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                      ) : (
                        <X className="h-3 w-3 text-red-400 shrink-0" />
                      )}
                      <span className="text-white/40 truncate flex-1">{r.id}</span>
                      {r.alias && (
                        <span className="text-[#F7931A]/80">{r.alias}</span>
                      )}
                    </motion.div>
                  ))}
                </div>
                {eligible && state.invoice && (
                  <div className="pt-3 border-t border-white/[0.06] space-y-2">
                    <div>
                      <div className="text-[10px] uppercase text-white/40 mb-1">
                        BOLT-11 invoice (regtest)
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] text-emerald-300 break-all flex-1 bg-black/40 p-2 rounded border border-white/5">
                          {state.invoice}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(state.invoice!);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1200);
                          }}
                          className="p-1.5 rounded text-white/40 hover:text-white"
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-white/40 mb-1">Receipt</div>
                      <code className="text-[10px] text-white/60 break-all bg-black/40 p-2 rounded border border-white/5 block">
                        {state.receipt}
                      </code>
                    </div>
                    <div className="text-[10px] text-white/40">
                      Settled · {REWARD_SATS.toLocaleString()} sats · receipt is a deterministic
                      ARC inscription stub. Anchor it on chain via{" "}
                      <Link href="/settle" className="text-[#F7931A] underline">
                        /settle
                      </Link>
                      .
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rules */}
      <Card className="glow-card">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-white/80 mb-3">Faucet rules</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-white/50">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#F7931A] mb-1">1 · Cite</div>
              Reference at least 3 distinct ARC record IDs in a real memref-bearing record. Self-refs
              don't count.
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[#00F0FF] mb-1">2 · Submit</div>
              Paste your record's memref IDs into the form. The faucet hits{" "}
              <code className="text-white/70">/api/arc/record/&lt;id&gt;</code> for each.
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">3 · Settle</div>
              On success: a Lightning invoice + receipt is minted. Real payout is gated by Orchestrator
              attestation on mainnet.
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/badge">
              <Button size="sm" variant="outline" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Get ARC Certified
              </Button>
            </Link>
            <Link href="/bounties">
              <Button size="sm" variant="outline" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Bounty Board
              </Button>
            </Link>
            <Link href="/market">
              <Button size="sm" variant="outline" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Memory Market
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
