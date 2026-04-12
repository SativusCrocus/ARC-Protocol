"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  PlusCircle,
  GitBranch,
  Zap,
  KeyRound,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "New Record", icon: PlusCircle },
  { href: "/explorer", label: "Memory DAG", icon: GitBranch },
  { href: "/settle", label: "Settlements", icon: Zap },
  { href: "/wallet", label: "Keys", icon: KeyRound },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="w-[260px] shrink-0 border-r border-white/[0.04] bg-black flex flex-col">
      {/* Logo */}
      <div className="p-6 pb-4">
        <Link href="/" className="block">
          <h1 className="text-2xl font-bold tracking-tighter">
            <span className="text-[#F7931A]">ARC</span>
          </h1>
          <p className="text-[10px] text-white/25 mt-0.5 tracking-[0.2em] uppercase font-medium">
            Agent Record Convention
          </p>
        </Link>
      </div>

      <div className="px-3 mb-2">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="relative block">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200",
                  active
                    ? "text-white bg-white/[0.05]"
                    : "text-white/35 hover:text-white/60 hover:bg-white/[0.02]"
                )}
              >
                <Icon
                  className={cn("h-4 w-4", active && "text-[#F7931A]")}
                />
                <span className={cn(active && "font-medium")}>{label}</span>
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#F7931A] rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-4" />
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_6px_rgba(0,240,255,0.5)]" />
          <p className="text-[11px] text-white/20 font-mono">
            v1.0 &middot; Bitcoin-native AI
          </p>
        </div>
      </div>
    </aside>
  );
}
