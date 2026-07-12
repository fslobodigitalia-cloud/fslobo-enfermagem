import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AccentId = "blue" | "rose" | "purple" | "green" | "amber" | "teal" | "red";

export const ACCENTS: { id: AccentId; label: string; hex: string; primary: string; glow: string }[] = [
  { id: "blue",   label: "Azul",   hex: "#2563EB", primary: "oklch(0.55 0.22 264)", glow: "oklch(0.7 0.17 240)" },
  { id: "rose",   label: "Rosa",   hex: "#E11D74", primary: "oklch(0.6 0.22 5)",   glow: "oklch(0.75 0.17 15)" },
  { id: "purple", label: "Roxo",   hex: "#7C3AED", primary: "oklch(0.55 0.25 300)", glow: "oklch(0.72 0.19 300)" },
  { id: "green",  label: "Verde",  hex: "#059669", primary: "oklch(0.6 0.17 160)",  glow: "oklch(0.75 0.15 165)" },
  { id: "amber",  label: "Âmbar",  hex: "#D97706", primary: "oklch(0.7 0.17 65)",   glow: "oklch(0.82 0.14 75)" },
  { id: "teal",   label: "Turquesa", hex: "#0D9488", primary: "oklch(0.6 0.13 195)", glow: "oklch(0.74 0.12 200)" },
  { id: "red",    label: "Vermelho", hex: "#DC2626", primary: "oklch(0.58 0.22 25)", glow: "oklch(0.72 0.19 30)" },
];

const STORAGE_KEY = "fslobo:accent";
const DEFAULT: AccentId = "blue";

function applyAccent(id: AccentId) {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--primary", a.primary);
  root.style.setProperty("--primary-glow", a.glow);
  root.style.setProperty("--ring", a.primary);
  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, ${a.primary} 0%, ${a.glow} 100%)`,
  );
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", a.hex);
}

type Ctx = { accent: AccentId; setAccent: (id: AccentId) => void };
const AccentCtx = createContext<Ctx>({ accent: DEFAULT, setAccent: () => {} });

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as AccentId | null;
      if (saved && ACCENTS.some((a) => a.id === saved)) {
        setAccentState(saved);
        applyAccent(saved);
      } else {
        applyAccent(DEFAULT);
      }
    } catch {
      applyAccent(DEFAULT);
    }
  }, []);

  function setAccent(id: AccentId) {
    setAccentState(id);
    applyAccent(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  return <AccentCtx.Provider value={{ accent, setAccent }}>{children}</AccentCtx.Provider>;
}

export const useAccent = () => useContext(AccentCtx);