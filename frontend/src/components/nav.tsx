"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PlusCircle,
  Search,
  Zap,
  KeyRound,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "Create Record", icon: PlusCircle },
  { href: "/explorer", label: "Explorer", icon: Search },
  { href: "/settle", label: "Settlement", icon: Zap },
  { href: "/wallet", label: "Wallet", icon: KeyRound },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
      <div className="p-6 border-b border-zinc-800">
        <Link href="/">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-orange-500">ARC</span>{" "}
            <span className="text-zinc-100">Protocol</span>
          </h1>
          <p className="text-[11px] text-zinc-600 mt-1 tracking-wide uppercase">
            Agent Record Convention
          </p>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-zinc-800/80 text-orange-500 font-medium"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <p className="text-xs text-zinc-600">v1.0 &middot; Bitcoin-native AI</p>
        </div>
      </div>
    </aside>
  );
}
