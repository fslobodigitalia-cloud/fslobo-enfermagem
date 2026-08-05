import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { copy, legalLinks } from "@/config/site";
import { getConsent, setConsent } from "@/lib/consent";
import { initMetaPixel } from "@/lib/metaPixel";
import { Button } from "./ui/button";

/**
 * Aviso discreto de medição. O Meta Pixel só é carregado depois de
 * "Aceitar métricas" — o site funciona normalmente sem consentimento.
 */
export function ConsentBanner() {
  const [open, setOpen] = React.useState(false);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const status = getConsent();
    if (status === "granted") {
      initMetaPixel();
      return;
    }
    if (status === "unknown") {
      // Pequeno atraso para não competir com o carregamento da hero.
      const timer = window.setTimeout(() => setOpen(true), 1200);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    setConsent("granted");
    initMetaPixel();
    setOpen(false);
  };

  const decline = () => {
    setConsent("denied");
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="aviso-consentimento"
          role="region"
          aria-label={copy.consent.title}
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : 24 }}
          transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-[55] px-[22px] pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-[420px] lg:px-0 lg:pb-0"
        >
          <div className="glass-strong rounded-[22px] p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/[0.07] text-gold"
              >
                <BarChart3 className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-cream">{copy.consent.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{copy.consent.text}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button size="sm" full onClick={accept}>
                {copy.consent.accept}
              </Button>
              <Button size="sm" variant="subtle" full onClick={decline}>
                {copy.consent.decline}
              </Button>
            </div>

            <a
              href={legalLinks[0].href}
              className="mt-3 inline-block text-[12px] text-dim underline underline-offset-4 transition-colors hover:text-gold-light"
            >
              {legalLinks[0].label}
            </a>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
