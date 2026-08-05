import { Fingerprint, Route, ShieldCheck, Sun } from "lucide-react";
import { copy } from "@/config/site";
import { SectionHeading } from "./common/SectionHeading";
import { RevealGroup, RevealItem } from "./common/Reveal";

const icons = [Fingerprint, ShieldCheck, Sun, Route] as const;

export function Differentials() {
  return (
    <section aria-labelledby="diferenciais-titulo" className="relative py-16 sm:py-20 lg:py-28">
      <div className="shell relative z-10">
        <SectionHeading
          eyebrow={copy.differentials.eyebrow}
          title={copy.differentials.title}
          titleId="diferenciais-titulo"
        />

        <RevealGroup as="ul" className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2">
          {copy.differentials.items.map((item, index) => {
            const Icon = icons[index] ?? Fingerprint;
            return (
              <RevealItem
                as="li"
                key={item.title}
                className="glass group relative overflow-hidden rounded-[24px] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-gold/45 sm:p-7"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 blur-[52px] transition-opacity duration-500 group-hover:opacity-70"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(217,172,91,0.45) 0%, rgba(109,40,217,0.35) 55%, transparent 74%)",
                  }}
                />
                <span
                  aria-hidden="true"
                  className="relative grid h-12 w-12 place-items-center rounded-2xl border border-gold/30 bg-gold/[0.06] text-gold"
                >
                  <Icon className="h-5 w-5" strokeWidth={1.4} />
                </span>
                <h3 className="relative mt-5 font-display text-[1.4rem] leading-snug text-cream">
                  {item.title}
                </h3>
                <p className="relative mt-2.5 text-[14px] leading-relaxed text-dim">{item.text}</p>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
