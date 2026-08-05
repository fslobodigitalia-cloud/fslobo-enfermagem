import * as React from "react";
import { sectionIds, type ReadingPackage, type ThemeId } from "@/config/site";
import { scrollToId } from "@/lib/scroll";
import { trackInitiateCheckout, trackSelectPackage } from "@/lib/metaPixel";

const THEME_KEY = "ent_tema_selecionado";

interface SelectionState {
  /** Tema escolhido na seção de temas — pré-seleciona a etapa 2 do modal. */
  selectedTheme: ThemeId | null;
  setSelectedTheme: (theme: ThemeId | null) => void;
  /** Pacote em qualificação. */
  selectedPackage: ReadingPackage | null;
  isModalOpen: boolean;
  /** Seleciona um pacote e abre o modal de qualificação. */
  openQualification: (pkg: ReadingPackage) => void;
  closeQualification: () => void;
  /** Fecha o modal e leva o visitante de volta aos pacotes. */
  backToPackages: () => void;
  /**
   * Leva ao próximo passo da jornada: os pacotes, quando existirem na página
   * atual; caso contrário, os temas de leitura.
   */
  goToOffer: () => void;
}

const SelectionContext = React.createContext<SelectionState | null>(null);

const readStoredTheme = (): ThemeId | null => {
  try {
    const value = window.sessionStorage.getItem(THEME_KEY);
    return (value as ThemeId) || null;
  } catch {
    return null;
  }
};

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedTheme, setThemeState] = React.useState<ThemeId | null>(null);
  const [selectedPackage, setSelectedPackage] = React.useState<ReadingPackage | null>(null);
  const [isModalOpen, setModalOpen] = React.useState(false);

  React.useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setSelectedTheme = React.useCallback((theme: ThemeId | null) => {
    setThemeState(theme);
    try {
      if (theme) window.sessionStorage.setItem(THEME_KEY, theme);
      else window.sessionStorage.removeItem(THEME_KEY);
    } catch {
      /* sessionStorage indisponível: o estado permanece apenas em memória. */
    }
  }, []);

  const goToOffer = React.useCallback(() => {
    const target = document.getElementById(sectionIds.packages)
      ? sectionIds.packages
      : sectionIds.themes;
    scrollToId(target);
  }, []);

  const openQualification = React.useCallback((pkg: ReadingPackage) => {
    const payload = { packageName: pkg.eventName, questions: pkg.questions, value: pkg.price };
    trackSelectPackage(payload);
    trackInitiateCheckout(payload);
    setSelectedPackage(pkg);
    setModalOpen(true);
  }, []);

  const closeQualification = React.useCallback(() => setModalOpen(false), []);

  const backToPackages = React.useCallback(() => {
    setModalOpen(false);
    // Aguarda o fim da animação de saída antes de rolar.
    window.setTimeout(() => scrollToId(sectionIds.packages), 220);
  }, []);

  const value = React.useMemo<SelectionState>(
    () => ({
      selectedTheme,
      setSelectedTheme,
      selectedPackage,
      isModalOpen,
      openQualification,
      closeQualification,
      backToPackages,
      goToOffer,
    }),
    [
      selectedTheme,
      setSelectedTheme,
      selectedPackage,
      isModalOpen,
      openQualification,
      closeQualification,
      backToPackages,
      goToOffer,
    ],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionState {
  const ctx = React.useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection precisa estar dentro de <SelectionProvider>.");
  return ctx;
}
