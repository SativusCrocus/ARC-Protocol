"use client";

import Link from "next/link";
import type { ARCRecord } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const typeStyles: Record<string, string> = {
  genesis: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  action: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  settlement: "bg-green-500/10 text-green-500 border-green-500/20",
};

export function RecordCard({ id, record }: { id: string; record: ARCRecord }) {
  return (
    <Link href={`/explorer/${id}`}>
      <Card className="hover:border-zinc-700 transition-colors cursor-pointer">
        <CardContent className="p-4 flex items-center gap-4">
          <Badge className={typeStyles[record.type] || ""}>
            {record.type}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{record.action}</p>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              {id.slice(0, 24)}&hellip;
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-zinc-500">
              {new Date(record.ts).toLocaleDateString()}
            </p>
            <p className="text-[11px] text-zinc-600">
              {new Date(record.ts).toLocaleTimeString()}
            </p>
          </div>
          {record.settlement && (
            <Badge
              variant="outline"
              className="text-green-500 border-green-500/20 shrink-0"
            >
              <Zap className="h-3 w-3 mr-1" />
              {record.settlement.amount_sats} sats
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function Zap({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
