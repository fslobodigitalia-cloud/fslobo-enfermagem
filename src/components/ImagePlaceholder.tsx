import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared placeholder shown whenever a product/banner/category has no image.
 * Keeps visual language consistent across store, product page, and admin.
 */
export function ImagePlaceholder({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div
      className={cn(
        "grid h-full w-full place-items-center bg-gradient-to-br from-muted to-secondary text-muted-foreground",
        className,
      )}
    >
      <ImageIcon className={cn("h-8 w-8 opacity-50", iconClassName)} />
    </div>
  );
}

/**
 * Returns a valid http(s) image URL or null. Prevents broken <img src="">.
 */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) return null;
  return trimmed;
}