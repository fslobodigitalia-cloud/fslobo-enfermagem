import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Valor entre 0 e 100. */
  value: number;
  label: string;
}

/** Barra de progresso do modal de qualificação. */
export function Progress({ value, label, className, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("h-[3px] w-full overflow-hidden rounded-full bg-white/10", className)}
      {...props}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${clamped}%`,
          background: "linear-gradient(90deg, #6D28D9 0%, #D9AC5B 55%, #F3D79A 100%)",
        }}
      />
    </div>
  );
}
