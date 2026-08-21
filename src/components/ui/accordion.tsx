import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      "overflow-hidden rounded-2xl border border-slate-900/[0.06] bg-white transition-all duration-300",
      "shadow-[0_1px_2px_rgba(15,23,42,0.03),0_8px_20px_-16px_rgba(15,23,42,0.10)]",
      "data-[state=open]:border-teal-200 data-[state=open]:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-16px_rgba(13,148,136,0.16)]",
      className,
    )}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex min-h-[64px] flex-1 items-center justify-between gap-4 px-5 py-4 text-left",
        "text-[1rem] font-semibold leading-snug text-slate-900 transition-colors hover:text-teal-700 sm:text-[1.05rem]",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-teal-700",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(15,23,42,0.04)]",
          "transition-all duration-300 group-hover:border-teal-200 group-hover:bg-teal-50",
          "group-data-[state=open]:rotate-45 group-data-[state=open]:border-teal-300 group-data-[state=open]:bg-teal-50",
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={1.8} />
      </span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("px-5 pb-5 pt-0 text-[15px] leading-relaxed text-slate-600", className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
