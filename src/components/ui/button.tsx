import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Variantes neutras (slate/teal) — usadas pelas páginas institucionais
 * novas (Home, Materiais, Produto). A página do Guia de Evolução de
 * Enfermagem não depende destas variantes: define seu próprio
 * CTA_BUTTON_CLASS local e o passa via `className`, que sempre tem
 * prioridade (cn/tailwind-merge). Nenhum comportamento dela muda aqui.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold transition-all duration-200 will-change-transform hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  {
    variants: {
      variant: {
        primary:
          "bg-teal-700 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_10px_24px_-10px_rgba(13,148,136,0.55)] hover:bg-teal-800 hover:shadow-[0_2px_4px_rgba(15,23,42,0.10),0_16px_32px_-12px_rgba(13,148,136,0.6)]",
        outline:
          "border border-slate-300 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-teal-400 hover:text-teal-800",
        subtle: "border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300",
        link: "text-teal-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[52px] px-6 text-[15px]",
        sm: "min-h-[42px] px-4 text-sm",
        lg: "min-h-[56px] px-8 text-base",
        icon: "h-11 w-11 rounded-xl px-0",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { variant: "primary", size: "default", full: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, full }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
