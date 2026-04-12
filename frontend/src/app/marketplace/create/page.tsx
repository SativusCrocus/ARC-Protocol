"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Code,
  BarChart3,
  Image,
  FileSearch,
  Sparkles,
  Zap,
  CheckCircle,
  FileCode,
  Copy,
  Check,
  Terminal,
  ArrowRight,
} from "lucide-react";
import type { GenerateResult } from "@/lib/types";

const CONTENT_TYPES = [
  { key: "article", label: "Article", icon: FileText, placeholder: "Write a detailed article about quantum computing's impact on cryptography..." },
  { key: "code", label: "Code", icon: Code, placeholder: "Write a Python function that implements a Merkle tree with SHA-256 hashing..." },
  { key: "analysis", label: "Analysis", icon: BarChart3, placeholder: "Analyze the current state of Bitcoin Layer 2 solutions and their trade-offs..." },
  { key: "image_desc", label: "Image Desc", icon: Image, placeholder: "Describe a detailed scene: a futuristic Bitcoin mining facility in Iceland..." },
  { key: "summary", label: "Summary", icon: FileSearch, placeholder: "Summarize the key innovations in the Lightning Network protocol..." },
  { key: "creative", label: "Creative", icon: Sparkles, placeholder: "Write a short story about an AI agent that discovers the Bitcoin whitepaper..." },
];

export default function MarketplaceCreatePage() {
  const [contentType, setContentType] = useState("article");
  const [prompt, setPrompt] = useState("");
  const [price, setPrice] = useState("1000");
  const [model, setModel] = useState("llama3.2");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");
  const [showInscription, setShowInscription] = useState(false);
  const [inscriptionCmd, setInscriptionCmd] = useState("");
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const selected = CONTENT_TYPES.find((t) => t.key === contentType)!;

  const mutation = useMutation({
    mutationFn: () =>
      api.generate({
        prompt,
        content_type: contentType,
        price_sats: parseInt(price) || 1000,
        model,
      }),
    onSuccess: (data) => {
      setResult(data);
      setError("");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => setError(e.message),
  });

  async function handleInscribe() {
    if (!result) return;
    try {
      const data = await api.inscription(result.id);
      setInscriptionCmd(data.command);
      setShowInscription(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get inscription command");
    }
  }

  function copyCmd() {
    navigator.clipboard.writeText(inscriptionCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 anim-fade-up">
      <div>
        <h2 className="text-[48px] font-bold tracking-tighter leading-none">
          <span className="text-[#00F0FF] text-glow-cyan">Generate</span>{" "}
          <span className="text-white/90">& Inscribe</span>
        </h2>
        <p className="text-white/25 text-sm mt-2">
          Prompt an AI agent, inscribe the output as a signed ARC record
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Generation Form */}
        <div className="space-y-4">
          {/* Content Type Selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider text-white/40 font-medium">
                Content Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {CONTENT_TYPES.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => setContentType(type.key)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium transition-all border ${
                      contentType === type.key
                        ? "bg-white/[0.06] text-white border-white/[0.1] shadow-[0_0_12px_rgba(0,240,255,0.06)]"
                        : "text-white/25 border-white/[0.03] hover:text-white/50 hover:bg-white/[0.02]"
                    }`}
                  >
                    <type.icon className={`h-3.5 w-3.5 ${contentType === type.key ? "text-[#00F0FF]" : ""}`} />
                    {type.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Prompt */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent Prompt</CardTitle>
              <p className="text-xs text-white/25">
                Describe what you want the AI to generate
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={selected.placeholder}
                rows={5}
                className="resize-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    Price <span className="text-white/15 font-normal">(sats)</span>
                  </Label>
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    min={1}
                    placeholder="1000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Model <span className="text-white/15 font-normal">(Ollama)</span>
                  </Label>
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="llama3.2"
                  />
                </div>
              </div>

              <Button
                onClick={() => mutation.mutate()}
                disabled={!prompt || mutation.isPending}
                className="w-full gap-2"
              >
                {mutation.isPending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Generating via Ollama...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate & Inscribe
                  </>
                )}
              </Button>

              {error && (
                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Genesis notice */}
                {result.genesis && (
                  <Card className="border-[#F7931A]/20">
                    <CardContent className="p-4 flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-[#F7931A] shrink-0" />
                      <div>
                        <p className="text-xs text-[#F7931A]/80 font-medium">
                          Genesis record created
                        </p>
                        <p className="text-[10px] text-white/20 font-mono mt-0.5">
                          {result.genesis.id.slice(0, 32)}&hellip;
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Generated Content */}
                <Card className="glass-active">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <CardTitle className="text-base text-emerald-400">
                          Content Generated & Inscribed
                        </CardTitle>
                      </div>
                      <Badge className="bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20 gap-1">
                        <Zap className="h-3 w-3" />
                        {result.price_sats.toLocaleString()} sats
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">
                        Record ID
                      </p>
                      <p className="text-xs font-mono text-white/50 select-all break-all">
                        {result.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/25 mb-2 uppercase tracking-wider">
                        Generated Output
                      </p>
                      <div className="max-h-48 overflow-auto p-3 bg-black/40 rounded-lg border border-white/[0.04]">
                        <p className="text-xs text-white/60 whitespace-pre-wrap leading-relaxed">
                          {result.content}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Signed ARC JSON */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-[#00F0FF]/60" />
                      <CardTitle className="text-base">
                        Signed ARC Record
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-[11px] font-mono text-white/30 overflow-auto max-h-64 p-3 bg-black/50 rounded-lg border border-white/[0.04]">
                      {JSON.stringify(result.record, null, 2)}
                    </pre>
                  </CardContent>
                </Card>

                {/* Inscribe Button */}
                {!showInscription ? (
                  <Button
                    onClick={handleInscribe}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Terminal className="h-4 w-4" />
                    Inscribe to Bitcoin
                  </Button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="border-[#F7931A]/20">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-[#F7931A]" />
                            Bitcoin Inscription Command
                          </CardTitle>
                          <button
                            onClick={copyCmd}
                            className="p-1.5 rounded-md hover:bg-white/[0.04] transition-colors"
                          >
                            {copied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-white/25" />
                            )}
                          </button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-[11px] font-mono text-[#F7931A]/50 whitespace-pre-wrap break-all bg-black/50 p-3 rounded-lg border border-white/[0.03] max-h-40 overflow-auto">
                          {inscriptionCmd}
                        </pre>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* View in Marketplace */}
                <Link href={`/marketplace/${result.id}`}>
                  <Button className="w-full gap-2" variant="outline">
                    View Listing
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {/* Preview skeleton */}
                <Card className="glass-active">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-[#00F0FF]/60" />
                      <CardTitle className="text-base">
                        Inscription Preview
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-[11px] font-mono text-white/20 overflow-auto max-h-80 p-3 bg-black/30 rounded-lg border border-white/[0.03]">
                      {JSON.stringify(
                        {
                          arc: "1.0",
                          type: "action",
                          agent: { pubkey: "<your-taproot-key>" },
                          prev: "<genesis-or-latest>",
                          memrefs: [],
                          ts: new Date().toISOString(),
                          ihash: `sha256(${prompt.slice(0, 20) || "..."})`,
                          ohash: "<sha256-of-ollama-output>",
                          action: `${contentType}: ${prompt.slice(0, 60) || "..."}`,
                          sig: "<bip340-schnorr>",
                        },
                        null,
                        2
                      )}
                    </pre>
                  </CardContent>
                </Card>

                {/* Flow explanation */}
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {[
                        { step: "1", label: "Prompt sent to local Ollama LLM" },
                        { step: "2", label: "Output hashed (ihash + ohash)" },
                        { step: "3", label: "ARC Action record created & BIP-340 signed" },
                        { step: "4", label: "Ready for Bitcoin inscription & Lightning settlement" },
                      ].map(({ step, label }) => (
                        <div key={step} className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                            <span className="text-[10px] text-white/30 font-mono">
                              {step}
                            </span>
                          </div>
                          <p className="text-xs text-white/25">{label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
