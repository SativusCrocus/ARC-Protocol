"use client";

import { useEffect, useRef } from "react";

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.left = `${e.clientX}px`;
        el.style.top = `${e.clientY}px`;
        el.style.opacity = "1";
      });
    };

    const onLeave = () => {
      el.style.opacity = "0";
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-500"
    >
      <div
        className="h-[200px] w-[200px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(247, 147, 26, 0.04) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
