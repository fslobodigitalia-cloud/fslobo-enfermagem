import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  text?: string;
  align?: "left" | "center";
  className?: string;
  /** Id aplicado ao título — permite usar aria-labelledby na seção. */
  titleId?: string;
  /** O H1 é exclusivo da hero; as seções usam H2. */
  as?: "h2" | "h3";
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  align = "center",
  className,
  titleId,
  as: Tag = "h2",
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <Reveal className={cn("flex flex-col gap-4", centered && "items-center text-center", className)}>
      {eyebrow ? (
        <span className="eyebrow inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-px w-6 bg-gold/50" />
          {eyebrow}
        </span>
      ) : null}
      <Tag id={titleId} className={cn("section-title text-balance", centered && "max-w-[22ch]")}>
        {title}
      </Tag>
      {text ? <p className={cn("section-text text-pretty", centered && "mx-auto")}>{text}</p> : null}
    </Reveal>
  );
}
