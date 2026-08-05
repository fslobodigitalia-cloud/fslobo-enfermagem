import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold transition-all duration-300 will-change-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
  {
    variants: {
      variant: {
        gold: "btn-gold",
        ghost: "btn-ghost",
        outline:
          "border border-gold/35 bg-transparent text-cream hover:border-gold/70 hover:bg-white/[0.05]",
        subtle:
          "border border-white/10 bg-white/[0.04] text-dim hover:border-gold/40 hover:text-cream",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[54px] px-6 text-[15px]",
        sm: "min-h-[44px] px-4 text-sm",
        lg: "min-h-[58px] px-8 text-base",
        icon: "h-11 w-11 rounded-xl px-0",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { variant: "gold", size: "default", full: false },
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
