"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { FileCode, CheckCircle } from "lucide-react";
import type { CreateResult } from "@/lib/types";

function hashPreview(text: string): string {
  if (!text) return "\u2014";
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0") + "...";
}

export default function CreatePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tighter">
          <span className="text-[#F7931A]">Inscribe</span>{" "}
          <span className="text-white/90">Record</span>
        </h2>
        <p className="text-white/25 text-sm mt-1">
          Sign and commit to the provenance chain
        </p>
      </div>
      <Tabs defaultValue="genesis">
        <TabsList>
          <TabsTrigger value="genesis">Genesis</TabsTrigger>
          <TabsTrigger value="action">Action</TabsTrigger>
        </TabsList>
        <TabsContent value="genesis">
          <GenesisForm />
        </TabsContent>
        <TabsContent value="action">
          <ActionForm />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function GenesisForm() {
  const [alias, setAlias] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.genesis({
        alias: alias || undefined,
        action,
        input_data: "genesis",
      }),
    onSuccess: (data) => {
      setResult(data);
      setError("");
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      {/* Left: Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Genesis Record</CardTitle>
          <p className="text-xs text-white/25">
            First record in an agent&apos;s provenance chain
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Agent Alias</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="my-agent"
            />
          </div>
          <div className="space-y-2">
            <Label>Action Description</Label>
            <Textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Agent initialized for market analysis..."
              rows={4}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/20 font-mono">
            <span>ihash preview:</span>
            <span className="text-[#F7931A]/60">{hashPreview(action)}</span>
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!action || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending ? "Signing..." : "Create Genesis"}
          </Button>
          {error && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Preview */}
      <Card className="glass-active">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-[#00F0FF]/60" />
            <CardTitle className="text-base">Inscription Preview</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle className="h-4 w-4" />
                  Record inscribed
                </div>
                <div>
                  <p className="text-[10px] text-white/25 mb-1">Record ID</p>
                  <p className="text-xs font-mono text-white/60 select-all break-all">
                    {result.id}
                  </p>
                </div>
                <pre className="text-[11px] font-mono text-white/30 overflow-auto max-h-80 p-3 bg-black/50 rounded-lg border border-white/[0.04]">
                  {JSON.stringify(result.record, null, 2)}
                </pre>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <pre className="text-[11px] font-mono text-white/20 overflow-auto max-h-80 p-3 bg-black/30 rounded-lg border border-white/[0.03]">
                  {JSON.stringify(
                    {
                      arc: "1.0",
                      type: "genesis",
                      agent: {
                        pubkey: "<your-taproot-key>",
                        alias: alias || undefined,
                      },
                      prev: null,
                      memrefs: [],
                      ts: new Date().toISOString(),
                      ihash: `sha256(${action.slice(0, 20) || "..."})`,
                      ohash: "...",
                      action: action || "...",
                      sig: "<bip340-schnorr>",
                    },
                    null,
                    2
                  )}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

function ActionForm() {
  const [prev, setPrev] = useState("");
  const [action, setAction] = useState("");
  const [prompt, setPrompt] = useState("");
  const [memrefs, setMemrefs] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.action({
        prev,
        action,
        memrefs: memrefs
          ? memrefs
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        prompt: prompt || undefined,
      }),
    onSuccess: (data) => {
      setResult(data);
      setError("");
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => setError(e.message),
  });

  const previewRecord = useMemo(
    () => ({
      arc: "1.0",
      type: "action",
      agent: { pubkey: "<your-taproot-key>" },
      prev: prev || null,
      memrefs: memrefs
        ? memrefs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      ts: new Date().toISOString(),
      ihash: `sha256(${(prompt || action).slice(0, 16) || "..."})`,
      ohash: "...",
      action: action || "...",
      sig: "<bip340-schnorr>",
    }),
    [prev, action, prompt, memrefs]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      {/* Left: Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Action Record</CardTitle>
          <p className="text-xs text-white/25">
            Extend a chain with a signed action
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Previous Record ID</Label>
            <Input
              value={prev}
              onChange={(e) => setPrev(e.target.value)}
              placeholder="Paste the record ID to extend..."
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label>Action Description</Label>
            <Textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Analyzed BTC mempool congestion..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Ollama Prompt{" "}
              <span className="text-white/15 font-normal">(optional)</span>
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Send to local LLM for ihash/ohash..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Memory References{" "}
              <span className="text-white/15 font-normal">
                (comma-separated)
              </span>
            </Label>
            <Input
              value={memrefs}
              onChange={(e) => setMemrefs(e.target.value)}
              placeholder="id1, id2, ..."
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/20 font-mono">
            <span>ihash:</span>
            <span className="text-[#00F0FF]/50">
              {hashPreview(prompt || action)}
            </span>
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!prev || !action || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending ? "Signing..." : "Create Action"}
          </Button>
          {error && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Preview */}
      <Card className="glass-active">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-[#00F0FF]/60" />
            <CardTitle className="text-base">Inscription Preview</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <CheckCircle className="h-4 w-4" />
                  Record inscribed
                </div>
                <div>
                  <p className="text-[10px] text-white/25 mb-1">Record ID</p>
                  <p className="text-xs font-mono text-white/60 select-all break-all">
                    {result.id}
                  </p>
                </div>
                <pre className="text-[11px] font-mono text-white/30 overflow-auto max-h-80 p-3 bg-black/50 rounded-lg border border-white/[0.04]">
                  {JSON.stringify(result.record, null, 2)}
                </pre>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <pre className="text-[11px] font-mono text-white/20 overflow-auto max-h-80 p-3 bg-black/30 rounded-lg border border-white/[0.03]">
                  {JSON.stringify(previewRecord, null, 2)}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
