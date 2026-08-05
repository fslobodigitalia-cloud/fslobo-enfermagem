import { Lock, MessageCircle, UserRound } from "lucide-react";
import { copy } from "@/config/site";
import { RevealGroup, RevealItem } from "./common/Reveal";

const icons = {
  message: MessageCircle,
  user: UserRound,
  lock: Lock,
} as const;

export function TrustIndicators() {
  return (
    <section aria-label="Garantias do atendimento" className="relative z-10 -mt-2 pb-4">
      <div className="shell">
        <RevealGroup as="ul" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {copy.trustIndicators.map((item) => {
            const Icon = icons[item.icon];
            return (
              <RevealItem
                as="li"
                key={item.title}
                className="glass flex items-start gap-4 rounded-2xl p-5 transition-colors duration-300 hover:border-gold/45"
              >
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/[0.07] text-gold"
                >
                  <Icon className="h-5 w-5" strokeWidth={1.4} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[15px] font-semibold text-cream">{item.title}</span>
                  <span className="text-[13px] leading-relaxed text-dim">{item.text}</span>
                </span>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
