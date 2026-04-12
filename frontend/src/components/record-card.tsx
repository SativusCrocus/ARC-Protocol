"use client";

import Link from "next/link";
import type { ARCRecord } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";

const typeStyles: Record<string, { badge: string; dot: string }> = {
  genesis: {
    badge: "bg-[#F7931A]/10 text-[#F7931A] border-[#F7931A]/20",
    dot: "bg-[#F7931A]",
  },
  action: {
    badge: "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/20",
    dot: "bg-[#00F0FF]",
  },
  settlement: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-400",
  },
};

export function RecordCard({ id, record }: { id: string; record: ARCRecord }) {
  const style = typeStyles[record.type] || typeStyles.action;

  return (
    <Link href={`/explorer/${id}`}>
      <div className="group relative glow-card rounded-lg border border-white/[0.04] bg-[#111111]/60 backdrop-blur-sm hover:border-white/[0.08] hover:bg-[#111111]/80 hover:shadow-[0_0_20px_rgba(247,147,26,0.03)] transition-all duration-300 cursor-pointer">
        <div className="p-4 flex items-center gap-4">
          {/* Type indicator dot */}
          <div className="relative">
            <div className={`h-2 w-2 rounded-full ${style.dot}`} />
            <div
              className={`absolute inset-0 h-2 w-2 rounded-full ${style.dot} opacity-40 blur-sm`}
            />
          </div>

          <Badge className={style.badge}>{record.type}</Badge>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors">
              {record.action}
            </p>
            <p className="text-[11px] text-white/20 font-mono mt-0.5">
              {id.slice(0, 24)}&hellip;
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[11px] text-white/25">
              {new Date(record.ts).toLocaleDateString()}
            </p>
            <p className="text-[10px] text-white/15 font-mono">
              {new Date(record.ts).toLocaleTimeString()}
            </p>
          </div>

          {record.settlement && (
            <Badge
              variant="outline"
              className="text-emerald-400 border-emerald-500/20 shrink-0 gap-1"
            >
              <Zap className="h-3 w-3" />
              {record.settlement.amount_sats.toLocaleString()} sats
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
