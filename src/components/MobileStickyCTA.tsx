import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { copy } from "@/config/site";
import { useSelection } from "@/context/SelectionContext";
import { Button } from "./ui/button";

/**
 * Barra fixa apenas no celular. Aparece após 20% da página, some quando o
 * modal está aberto e reserva o espaço da safe-area do iOS.
 */
export function MobileStickyCTA() {
  const [visible, setVisible] = React.useState(false);
  const { goToOffer, isModalOpen } = useSelection();
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      setVisible(progress > 0.2);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const show = visible && !isModalOpen;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="cta-fixo-mobile"
          initial={reduced ? false : { y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: reduced ? 0 : 90, opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-ink/85 px-[22px] pt-3 backdrop-blur-xl safe-bottom lg:hidden"
        >
          <Button full onClick={goToOffer}>
            {copy.mobileCta}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
