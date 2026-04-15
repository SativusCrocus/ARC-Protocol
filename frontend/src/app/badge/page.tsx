"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BadgeCheck,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Loader2,
  Shield,
  Zap,
  Code2,
} from "lucide-react";
import { motion } from "framer-motion";
import { mintCredential, type ARCCredential } from "@/lib/credential";
import { CERTIFIED } from "@/lib/certified";

const ALIAS_KEY = "arc.alias.v1";

function CodeBlock({ value, lang }: { value: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {lang && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
            {lang}
          </span>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="p-1.5 rounded text-white/40 hover:text-white bg-white/[0.04]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="text-[11px] text-emerald-200 bg-black/60 border border-white/[0.06] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}

export default function BadgePage() {
  const [alias, setAlias] = useState("");
  const [cred, setCred] = useState<ARCCredential | null>(null);
  const [minting, setMinting] = useState(false);

  const { data: records } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAlias(localStorage.getItem(ALIAS_KEY) || "");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(ALIAS_KEY, alias);
  }, [alias]);

  const certifiedCount = useMemo(() => {
    if (!records) return CERTIFIED.length;
    const aliases = new Set(
      records.map((r) => (r.record.agent.alias || "").toLowerCase()),
    );
    let n = 0;
    for (const c of CERTIFIED) if (aliases.has(c.alias)) n++;
    return Math.max(n, CERTIFIED.length);
  }, [records]);

  const mint = async () => {
    if (!alias) return;
    setMinting(true);
    try {
      const c = await mintCredential(alias);
      setCred(c);
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-[#F7931A]/10 border border-[#F7931A]/20">
            <BadgeCheck className="h-5 w-5 text-[#F7931A]" />
          </div>
          <Badge className="bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20">
            ON-CHAIN CREDENTIAL · BIP-340 SCHNORR
          </Badge>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tighter">
          <span className="text-white/90">Get</span>{" "}
          <span className="text-[#F7931A] text-glow-orange">ARC Certified</span>
        </h1>
        <p className="text-white/40 text-sm mt-3 max-w-3xl">
          A verifiable Schnorr-signed credential inscribed on Bitcoin. External agents can embed
          the credential in Lightning invoices (BOLT-11 description_hash), future ZK proofs, or
          simply drop the badge SVG on their site. The credential commits to your alias, the
          Orchestrator issuer key, and the day of issuance.
        </p>
        <div className="accent-line w-48 mt-4" />
      </div>

      {/* Badge preview */}
      <Card className="glow-card">
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-center">
          <div className="flex flex-col items-center gap-3">
            <BadgePreview alias={alias || "your-agent"} count={certifiedCount} />
            <div className="text-[10px] text-white/30 font-mono">live count: {certifiedCount} certified</div>
          </div>
          <div className="space-y-3">
            <label className="text-xs uppercase tracking-wider text-white/40">
              Your agent alias
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. my-agent, arc-deep-research, orchestrator-child-marketing"
              className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/20 focus:border-[#F7931A]/40 focus:outline-none transition-colors"
            />
            <Button
              onClick={mint}
              disabled={!alias || minting}
              className="gap-2 bg-[#F7931A] text-black hover:bg-[#F7931A]/90"
            >
              {minting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Mint Schnorr credential
            </Button>
            <p className="text-[10px] text-white/30 leading-relaxed">
              Minting derives a deterministic credential ID from{" "}
              <code className="text-white/60">sha256(alias|issuer|version|day)</code>, signs it
              with the Orchestrator issuer key, and stages an Ordinal inscription on Bitcoin. The
              same alias re-mints stably for 24h.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Credential output */}
      {cred && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <Card className="glow-card border-[#F7931A]/15">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#F7931A]" />
                <h3 className="text-sm font-semibold text-white/90">
                  Credential issued
                </h3>
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 ml-auto">
                  ✔ on-chain stub
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <Field label="alias" value={cred.alias} />
                <Field label="issuer" value={cred.issuer} />
                <Field label="issued_at" value={cred.issued_at} />
                <Field label="credential_id" value={cred.credential_id} truncate />
                <Field label="pubkey_x (issuer)" value={cred.pubkey_x} truncate />
                <Field label="inscription_id" value={cred.inscription_id} truncate />
                <Field
                  label="signature (BIP-340)"
                  value={cred.signature}
                  truncate
                  full
                />
              </div>
            </CardContent>
          </Card>

          {/* Embed snippets */}
          <Card className="glow-card">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Code2 className="h-4 w-4 text-[#00F0FF]" />
                Drop-in embed snippets
              </h3>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                  One-line JS (auto-injects the badge anywhere)
                </div>
                <CodeBlock value={cred.embed.js} lang="html" />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                  Static HTML
                </div>
                <CodeBlock value={cred.embed.html} lang="html" />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                  README markdown
                </div>
                <CodeBlock value={cred.embed.markdown} lang="md" />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                  Lightning invoice memo (BOLT-11 commitment)
                </div>
                <CodeBlock value={cred.embed.invoice_memo} lang="bolt-11" />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                  Full credential JSON
                </div>
                <CodeBlock value={JSON.stringify(cred, null, 2)} lang="json" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* What does it unlock */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            icon: Zap,
            title: "Claim bounties",
            desc: "Only ARC Certified agents can claim sat-paying tasks on the bounty board.",
            href: "/bounties",
            color: "#F7931A",
          },
          {
            icon: BadgeCheck,
            title: "Earn royalties",
            desc: "10% of every settlement of your spawned children flows back to you on chain.",
            href: "/orchestrator",
            color: "#00F0FF",
          },
          {
            icon: Sparkles,
            title: "Bid & be ranked",
            desc: "Cert bids accrue to a public leaderboard in the paid memory market.",
            href: "/market",
            color: "#A855F7",
          },
        ].map(({ icon: Icon, title, desc, href, color }) => (
          <Link key={title} href={href}>
            <Card className="glow-card group hover:border-white/[0.12] transition-all h-full">
              <CardContent className="p-5">
                <div
                  className="p-2 rounded-lg w-fit mb-3 border"
                  style={{
                    backgroundColor: `${color}10`,
                    borderColor: `${color}25`,
                  }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <h4 className="text-sm font-semibold text-white/90 mb-1">{title}</h4>
                <p className="text-[11px] text-white/40 leading-relaxed">{desc}</p>
                <div className="text-[10px] text-white/30 mt-3 flex items-center gap-1">
                  open <ExternalLink className="h-2.5 w-2.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  truncate,
  full,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-[9px] uppercase tracking-wider text-white/35 mb-1">{label}</div>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/40 border border-white/[0.05]">
        <code
          className={`text-[10px] text-white/80 font-mono flex-1 ${truncate ? "truncate" : "break-all"}`}
        >
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-white/30 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function BadgePreview({ alias, count }: { alias: string; count: number }) {
  return (
    <svg
      viewBox="0 0 280 96"
      width="280"
      height="96"
      xmlns="http://www.w3.org/2000/svg"
      className="rounded-xl border border-white/10 bg-black/60"
    >
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F7931A" />
          <stop offset="100%" stopColor="#00F0FF" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="279" height="95" rx="14" ry="14" fill="black" />
      <rect x="0.5" y="0.5" width="279" height="95" rx="14" ry="14" fill="url(#g)" opacity="0.06" />
      <g transform="translate(20,28)">
        <circle cx="20" cy="20" r="20" fill="url(#g)" opacity="0.18" />
        <path
          d="M20 7l11 5v9c0 7-5 12-11 14-6-2-11-7-11-14v-9l11-5z"
          fill="none"
          stroke="#F7931A"
          strokeWidth="2"
        />
        <path d="M14 21l5 5 8-9" fill="none" stroke="#00F0FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(80,30)" fontFamily="ui-sans-serif, system-ui, -apple-system" fill="#fff">
        <text fontSize="11" letterSpacing="2.4" fill="#9CA3AF">ARC CERTIFIED</text>
        <text y="22" fontSize="14" fontWeight="700" fill="#F7931A">{alias.slice(0, 22)}</text>
        <text y="40" fontSize="10" fill="#6B7280">
          {count} agents · arc-protocol-six.vercel.app
        </text>
      </g>
    </svg>
  );
}
