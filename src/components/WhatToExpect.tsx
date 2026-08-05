import {
  CircleCheck,
  Clock3,
  HeartHandshake,
  ListChecks,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import { copy, sectionIds, testimonials } from "@/config/site";
import { SectionHeading } from "./common/SectionHeading";
import { RevealGroup, RevealItem } from "./common/Reveal";

const icons = [ListChecks, Clock3, HeartHandshake, ShieldCheck, MessagesSquare, CircleCheck] as const;

/**
 * Enquanto não existirem depoimentos reais e autorizados, esta seção apresenta
 * o que a experiência oferece. A estrutura de depoimentos já está pronta:
 * basta preencher `testimonials` em src/config/site.ts.
 */
export function WhatToExpect() {
  const hasTestimonials = testimonials.length > 0;

  return (
    <section id={sectionIds.experience} className="relative scroll-mt-24 py-16 sm:py-20 lg:py-28">
      <div className="shell relative z-10">
        <SectionHeading
          eyebrow={copy.whatToExpect.eyebrow}
          title={copy.whatToExpect.title}
          text={copy.whatToExpect.text}
        />

        <RevealGroup as="ul" className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
          {copy.whatToExpect.items.map((item, index) => {
            const Icon = icons[index] ?? CircleCheck;
            return (
              <RevealItem
                as="li"
                key={item.title}
                className="glass flex h-full flex-col gap-3 rounded-[22px] p-5 transition-colors duration-300 hover:border-gold/45 sm:p-6"
              >
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-gold/30 bg-gold/[0.06] text-gold"
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </span>
                <h3 className="font-display text-[1.28rem] leading-snug text-cream">{item.title}</h3>
                <p className="text-[14px] leading-relaxed text-dim">{item.text}</p>
              </RevealItem>
            );
          })}
        </RevealGroup>

        {/* Depoimentos reais aparecem automaticamente quando cadastrados. */}
        {hasTestimonials && (
          <RevealGroup as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <RevealItem
                as="li"
                key={testimonial.name}
                className="glass flex h-full flex-col gap-4 rounded-[22px] p-6"
              >
                <p className="text-[15px] leading-relaxed text-cream/90">“{testimonial.text}”</p>
                <p className="mt-auto text-[13px] font-semibold text-gold/90">
                  {testimonial.name}
                  {testimonial.packageName ? (
                    <span className="font-normal text-dim"> · {testimonial.packageName}</span>
                  ) : null}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        )}
      </div>
    </section>
  );
}
