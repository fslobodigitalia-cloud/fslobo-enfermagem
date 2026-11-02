import * as React from "react";

/**
 * Ilustrações do app (WebP com transparência, aparadas, 3 larguras), servidas
 * de /fslobo-app/. Só são requisitadas quando uma tela do /app as renderiza.
 */
const SIZES = {
  estudo: { w: 1100, h: 595 },
  pratica: { w: 1100, h: 500 },
  conquistas: { w: 1100, h: 523 },
} as const;

export type IllustrationName = keyof typeof SIZES;

type Props = {
  name: IllustrationName;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function Illustration({ name, sizes, priority, className, style }: Props) {
  const { w, h } = SIZES[name];
  const base = `/fslobo-app/${name}`;
  return (
    <img
      src={`${base}-800.webp`}
      srcSet={`${base}-480.webp 480w, ${base}-800.webp 800w, ${base}-1100.webp 1100w`}
      sizes={sizes}
      width={w}
      height={h}
      alt=""
      aria-hidden="true"
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={className}
      style={style}
      draggable={false}
    />
  );
}
