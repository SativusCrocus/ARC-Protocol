"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordCard } from "@/components/record-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, Search, Zap, KeyRound } from "lucide-react";

export default function Dashboard() {
  const { data: records, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: api.records,
  });

  const stats = records
    ? {
        total: records.length,
        genesis: records.filter((r) => r.record.type === "genesis").length,
        actions: records.filter((r) => r.record.type === "action").length,
        settlements: records.filter((r) => r.record.type === "settlement")
          .length,
        agents: new Set(records.map((r) => r.record.agent.pubkey)).size,
        totalSats: records.reduce(
          (sum, r) => sum + (r.record.settlement?.amount_sats || 0),
          0
        ),
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-zinc-400 mt-1">ARC Protocol overview</p>
        </div>
        <div className="flex gap-2">
          <Link href="/create">
            <Button size="sm">
              <PlusCircle className="h-4 w-4 mr-2" />
              New Record
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: stats?.total ?? "\u2014", color: "text-zinc-100" },
          { label: "Agents", value: stats?.agents ?? "\u2014", color: "text-orange-500" },
          { label: "Actions", value: stats?.actions ?? "\u2014", color: "text-blue-500" },
          {
            label: "Settled",
            value: stats?.totalSats ? `${stats.totalSats.toLocaleString()} sats` : "\u2014",
            color: "text-green-500",
          },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: "/create", label: "Create Genesis", icon: PlusCircle, desc: "New agent identity" },
          { href: "/explorer", label: "Explore Chains", icon: Search, desc: "Browse records" },
          { href: "/settle", label: "Settlement", icon: Zap, desc: "Lightning payment" },
          { href: "/wallet", label: "Manage Keys", icon: KeyRound, desc: "Taproot keypairs" },
        ].map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-zinc-700 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-zinc-800">
                  <Icon className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-zinc-500">{desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : records?.length ? (
          <div className="space-y-2">
            {records.slice(0, 10).map(({ id, record }) => (
              <RecordCard key={id} id={id} record={record} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-zinc-500 mb-4">
                No records yet. Create a genesis record to get started.
              </p>
              <Link href="/create">
                <Button>Create Genesis Record</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
