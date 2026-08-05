import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      // 16px mínimo evita o zoom automático do iOS ao focar o campo.
      "h-[54px] w-full rounded-2xl border border-gold/25 bg-white/[0.04] px-4 text-[16px] text-cream",
      "placeholder:text-dim/55 transition-colors duration-200",
      "hover:border-gold/40 focus:border-gold/70 focus:bg-white/[0.06]",
      "aria-[invalid=true]:border-red-400/70",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
