import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm ring-offset-black placeholder:text-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F7931A]/30 focus-visible:border-[#F7931A]/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
