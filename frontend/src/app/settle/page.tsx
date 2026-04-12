"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Copy, Check } from "lucide-react";
import type { SettleResult } from "@/lib/types";

function HashGrid({ hash }: { hash: string }) {
  const cells = hash
    .slice(0, 64)
    .split("")
    .map((c, i) => {
      const val = parseInt(c, 16);
      const opacity = (val / 15) * 0.8 + 0.1;
      return (
        <div
          key={i}
          className="rounded-[2px]"
          style={{ background: `rgba(247, 147, 26, ${opacity})` }}
        />
      );
    });
  return (
    <div className="grid grid-cols-8 gap-[3px] w-[120px] h-[120px] p-3 bg-black rounded-xl border border-white/[0.06]">
      {cells}
    </div>
  );
}

export default function SettlePage() {
  const [recordId, setRecordId] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<SettleResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.settle({ record_id: recordId, amount: parseInt(amount) }),
    onSuccess: (data) => {
      setResult(data);
      setError("");
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => setError(e.message),
  });

  function copyHash() {
    if (!result) return;
    navigator.clipboard.writeText(result.payment_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6 anim-fade-up">
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span className="text-emerald-400" style={{ textShadow: "0 0 40px rgba(34,197,94,0.3), 0 0 80px rgba(34,197,94,0.1)" }}>Lightning</span>{" "}
          <span className="text-white/90">Settlement</span>
        </h2>
        <p className="text-white/25 text-sm mt-2">
          Economic settlement via the Lightning Network
        </p>
      </div>

      {/* One-button Request Sats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#F7931A]" />
            Request Sats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Record ID</Label>
            <Input
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              placeholder="Paste record ID to settle..."
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label>Amount (satoshis)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              min={1}
            />
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!recordId || !amount || mutation.isPending}
            className="w-full gap-2"
          >
            <Zap className="h-4 w-4" />
            {mutation.isPending ? "Creating..." : "Request Sats"}
          </Button>
          {error && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement Result with QR-like HashGrid */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
          >
            <Card className="border-emerald-500/20 glass-active relative">
              <div className="ripple absolute inset-0 rounded-lg pointer-events-none" />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-emerald-400 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Settlement Created
                  </CardTitle>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {parseInt(amount).toLocaleString()} sats
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-start gap-6">
                  <HashGrid hash={result.payment_hash} />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                        Settlement ID
                      </p>
                      <p className="text-xs font-mono text-white/50 select-all break-all">
                        {result.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                        Payment Hash
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-white/50 select-all break-all flex-1">
                          {result.payment_hash}
                        </p>
                        <button
                          onClick={copyHash}
                          className="shrink-0 p-1.5 rounded-md hover:bg-white/[0.04] transition-colors"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-white/25" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                        Preimage
                      </p>
                      <p className="text-xs font-mono text-[#F7931A]/60 select-all break-all">
                        {result.preimage}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.03]">
                  <p className="text-[11px] text-white/20">
                    In production, the preimage is revealed only after Lightning
                    payment confirmation. This demo generates it locally.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <PreimageVerifier />
    </div>
  );
}

function PreimageVerifier() {
  const [hash, setHash] = useState("");
  const [preimage, setPreimage] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);

  async function verify() {
    try {
      const bytes = new Uint8Array(
        (preimage.match(/.{2}/g) || []).map((b) => parseInt(b, 16))
      );
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
      const computed = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setValid(computed === hash);
    } catch {
      setValid(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preimage Verifier</CardTitle>
        <p className="text-xs text-white/25">
          Verify preimage produces the expected payment hash
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Payment Hash</Label>
          <Input
            value={hash}
            onChange={(e) => {
              setHash(e.target.value);
              setValid(null);
            }}
            placeholder="Expected SHA-256 hash..."
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>Preimage</Label>
          <Input
            value={preimage}
            onChange={(e) => {
              setPreimage(e.target.value);
              setValid(null);
            }}
            placeholder="Preimage hex..."
            className="font-mono text-xs"
          />
        </div>
        <Button
          variant="outline"
          onClick={verify}
          disabled={!hash || !preimage}
        >
          Verify
        </Button>
        <AnimatePresence>
          {valid !== null && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-sm font-medium ${
                valid ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {valid
                ? "\u2713 Valid: preimage matches payment hash"
                : "\u2717 Invalid: preimage does not match"}
            </motion.p>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
