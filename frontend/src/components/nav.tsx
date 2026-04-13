"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  PlusCircle,
  GitBranch,
  Zap,
  KeyRound,
  Menu,
  X,
  Orbit,
  Store,
  Brain,
  Code2,
  TrendingUp,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/research", label: "Deep Research", icon: Brain },
  { href: "/codegen", label: "Code Generator", icon: Code2 },
  { href: "/trader", label: "DeFi Trader", icon: TrendingUp },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/create", label: "New Record", icon: PlusCircle },
  { href: "/explorer", label: "Memory DAG", icon: GitBranch },
  { href: "/dag", label: "Agent DAG", icon: Orbit },
  { href: "/settle", label: "Settlements", icon: Zap },
  { href: "/wallet", label: "Keys", icon: KeyRound },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <>
      {/* Logo */}
      <div className="p-6 pb-4">
        <Link href="/" onClick={() => setOpen(false)} className="block">
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
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="relative block"
            >
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
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#F7931A] rounded-full shadow-[0_0_12px_rgba(247,147,26,0.5)]"
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
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#111111]/80 backdrop-blur-xl border border-white/[0.06] text-white/60 hover:text-white transition-colors"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 border-r border-white/[0.04] bg-black flex-col">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-black border-r border-white/[0.04] flex flex-col"
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-md text-white/30 hover:text-white/60 transition-colors"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
