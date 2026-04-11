"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CreateResult } from "@/lib/types";

export default function CreatePage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Create Record</h2>
        <p className="text-zinc-400 mt-1">
          Inscribe a new ARC record on the provenance chain
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
    </div>
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
      api.genesis({ alias: alias || undefined, action, input_data: "genesis" }),
    onSuccess: (data) => {
      setResult(data);
      setError("");
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>New Genesis Record</CardTitle>
        <p className="text-sm text-zinc-400">
          Create the first record in a new agent&apos;s provenance chain
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Agent Alias (optional)</Label>
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
            rows={3}
          />
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!action || mutation.isPending}
          className="w-full"
        >
          {mutation.isPending ? "Creating..." : "Create Genesis"}
        </Button>

        {error && (
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {result && <ResultPanel result={result} />}
      </CardContent>
    </Card>
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

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>New Action Record</CardTitle>
        <p className="text-sm text-zinc-400">
          Extend an existing chain with a new signed action
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
            <span className="text-zinc-500 font-normal">(optional)</span>
          </Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Send to local LLM for ihash/ohash generation..."
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label>
            Memory References{" "}
            <span className="text-zinc-500 font-normal">
              (comma-separated IDs)
            </span>
          </Label>
          <Input
            value={memrefs}
            onChange={(e) => setMemrefs(e.target.value)}
            placeholder="id1, id2, ..."
            className="font-mono text-xs"
          />
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!prev || !action || mutation.isPending}
          className="w-full"
        >
          {mutation.isPending ? "Creating..." : "Create Action"}
        </Button>

        {error && (
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {result && <ResultPanel result={result} />}
      </CardContent>
    </Card>
  );
}

function ResultPanel({ result }: { result: CreateResult }) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-green-500 font-medium">
          Record created successfully
        </p>
        <button
          onClick={() => setShowJson(!showJson)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {showJson ? "Hide" : "Show"} JSON
        </button>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">Record ID</p>
        <p className="text-xs font-mono text-zinc-300 select-all">{result.id}</p>
      </div>
      {showJson && (
        <pre className="text-xs font-mono text-zinc-400 overflow-auto max-h-64 p-3 bg-zinc-950 rounded">
          {JSON.stringify(result.record, null, 2)}
        </pre>
      )}
    </div>
  );
}
