import { useEffect } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";

function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

export function BrandThemeApplier() {
  const { data } = useSiteContent();
  const hex = data?.brand.primary_hex;

  useEffect(() => {
    if (!hex || !isHex(hex)) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", hex);
    root.style.setProperty("--ring", hex);
    root.style.setProperty(
      "--primary-glow",
      `color-mix(in oklab, ${hex} 60%, white)`,
    );
    root.style.setProperty(
      "--gradient-primary",
      `linear-gradient(135deg, ${hex} 0%, color-mix(in oklab, ${hex} 60%, white) 100%)`,
    );
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", hex);
  }, [hex]);

  return null;
}