"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SettleResult } from "@/lib/types";

export default function SettlePage() {
  const [recordId, setRecordId] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<SettleResult | null>(null);
  const [error, setError] = useState("");
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

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Lightning Settlement
        </h2>
        <p className="text-zinc-400 mt-1">
          Create economic settlements via the Lightning Network
        </p>
      </div>

      {/* Create Settlement */}
      <Card>
        <CardHeader>
          <CardTitle>New Settlement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Record ID to settle</Label>
            <Input
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              placeholder="Paste record ID..."
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
            className="w-full"
          >
            {mutation.isPending ? "Creating..." : "Create Settlement"}
          </Button>

          {error && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement Result */}
      {result && (
        <Card className="border-green-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-green-500">
                Settlement Created
              </CardTitle>
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                {parseInt(amount).toLocaleString()} sats
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Settlement ID</p>
                <p className="text-xs font-mono text-zinc-300 select-all">
                  {result.id}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Payment Hash</p>
                <p className="text-xs font-mono text-zinc-300 select-all break-all">
                  {result.payment_hash}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Preimage (proof of payment)</p>
                <p className="text-xs font-mono text-orange-500 select-all break-all">
                  {result.preimage}
                </p>
              </div>
            </div>
            <div className="p-3 bg-zinc-900 rounded-lg">
              <p className="text-xs text-zinc-400">
                In production, the preimage is revealed only after Lightning
                payment confirmation. This demo generates it locally for testing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preimage Verifier */}
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
        <CardTitle>Preimage Verifier</CardTitle>
        <p className="text-sm text-zinc-400">
          Verify that a preimage produces the expected payment hash
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
        {valid !== null && (
          <p
            className={`text-sm font-medium ${
              valid ? "text-green-500" : "text-red-500"
            }`}
          >
            {valid
              ? "Valid: preimage matches payment hash"
              : "Invalid: preimage does not match"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
