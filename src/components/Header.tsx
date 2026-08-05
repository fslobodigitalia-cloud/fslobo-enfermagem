import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { copy, navLinks, sectionIds } from "@/config/site";
import { scrollToHref, scrollToId } from "@/lib/scroll";
import { useSelection } from "@/context/SelectionContext";
import { Logo } from "./common/Logo";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function Header() {
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string>(sectionIds.hero);
  const { goToOffer } = useSelection();
  const reduced = useReducedMotion();

  /* Fundo escuro + borda dourada aparecem depois da primeira rolagem. */
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Marca o link correspondente à seção visível (aria-current). */
  React.useEffect(() => {
    const ids = navLinks.map((link) => link.href.replace("#", ""));
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.2, 0.6] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* Bloqueia a rolagem do corpo enquanto o menu em tela cheia está aberto. */
  React.useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleNav = (href: string) => {
    setMenuOpen(false);
    window.setTimeout(() => scrollToHref(href), menuOpen ? 180 : 0);
  };

  const handleCta = () => {
    setMenuOpen(false);
    window.setTimeout(goToOffer, menuOpen ? 180 : 0);
  };

  return (
    <>
      <header
        id="site-header"
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-gold/20 bg-ink/80 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/65"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="shell flex h-[72px] items-center justify-between gap-4 lg:h-[84px]">
          <a
            href={`#${sectionIds.hero}`}
            onClick={(event) => {
              event.preventDefault();
              scrollToId(sectionIds.hero);
            }}
            className="rounded-xl"
            aria-label="Entre Nós Tarô — ir para o início"
          >
            <Logo size={36} className="sm:hidden" />
            <Logo size={44} className="hidden sm:inline-flex" />
          </a>

          <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => {
              const isActive = activeSection === link.href.replace("#", "");
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "true" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    handleNav(link.href);
                  }}
                  className={cn(
                    "relative rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-300",
                    isActive ? "text-gold-light" : "text-dim hover:text-cream",
                  )}
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-4 -bottom-0.5 h-px origin-center bg-gold/70 transition-transform duration-300",
                      isActive ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button size="sm" className="hidden lg:inline-flex" onClick={handleCta}>
              Escolher minha leitura
            </Button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu de navegação"
              aria-expanded={menuOpen}
              aria-controls="menu-mobile"
              className="grid h-12 w-12 place-items-center rounded-2xl border border-gold/25 bg-white/[0.04] text-cream transition-colors hover:border-gold/55 lg:hidden"
            >
              <Menu className="h-5 w-5" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu-mobile"
            id="menu-mobile"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="fixed inset-0 z-[60] lg:hidden"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            // O exit precisa animar de fato para que o overlay seja desmontado.
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.28 }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(170deg, rgba(24,10,42,0.96) 0%, rgba(7,4,13,0.98) 60%)",
                backdropFilter: "blur(18px)",
              }}
            />

            <div className="relative flex h-full flex-col">
              <div className="shell flex h-[72px] items-center justify-between">
                <Logo size={36} />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fechar menu de navegação"
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-gold/25 bg-white/[0.04] text-cream transition-colors hover:border-gold/55"
                >
                  <X className="h-5 w-5" strokeWidth={1.6} />
                </button>
              </div>

              <nav aria-label="Navegação principal (celular)" className="shell mt-6 flex flex-1 flex-col">
                <ul className="flex flex-col">
                  {navLinks.map((link, index) => (
                    <motion.li
                      key={link.href}
                      initial={reduced ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 + index * 0.05, duration: 0.4 }}
                      className="border-b border-gold/15"
                    >
                      <a
                        href={link.href}
                        onClick={(event) => {
                          event.preventDefault();
                          handleNav(link.href);
                        }}
                        className="flex min-h-[64px] items-center justify-between py-2 font-display text-2xl text-cream"
                      >
                        {link.label}
                        <span aria-hidden="true" className="text-gold/60">
                          ✦
                        </span>
                      </a>
                    </motion.li>
                  ))}
                </ul>

                <div className="mt-auto pb-10 pt-8">
                  <Button full onClick={handleCta}>
                    {copy.hero.primaryCta}
                  </Button>
                  <p className="mt-4 text-center text-[13px] text-dim">
                    Atendimento online, individual e confidencial.
                  </p>
                </div>
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
