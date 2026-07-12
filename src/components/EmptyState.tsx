import { Link } from "@tanstack/react-router";
import { PackageOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  actionLabel,
  actionHref,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-5 mt-3 flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-card/60 px-6 py-8 text-center animate-fade-in",
        className,
      )}
    >
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[260px] text-[12px] text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link
          to={actionHref}
          className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground shadow-[var(--shadow-elevated)] tap-scale"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}