import { Info, Quote } from "lucide-react";
import { copy, sectionIds } from "@/config/site";
import { SectionHeading } from "./common/SectionHeading";
import { Reveal, RevealGroup, RevealItem } from "./common/Reveal";

export function QuestionExamples() {
  return (
    <section id={sectionIds.questions} className="relative scroll-mt-24 py-16 sm:py-20 lg:py-28">
      <div className="shell relative z-10">
        <SectionHeading
          eyebrow="Exemplos"
          title={copy.questionExamples.title}
          text={copy.questionExamples.text}
        />

        <RevealGroup as="ul" className="mt-10 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4">
          {copy.questionExamples.items.map((question) => (
            <RevealItem
              as="li"
              key={question}
              className="glass group flex items-start gap-4 rounded-2xl p-5 transition-colors duration-300 hover:border-gold/45"
            >
              <Quote
                className="mt-0.5 h-4 w-4 shrink-0 text-gold/70 transition-colors duration-300 group-hover:text-gold"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span className="text-[15px] leading-relaxed text-cream/90">{question}</span>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal className="mt-8 sm:mt-10">
          <div
            role="note"
            className="mx-auto flex max-w-3xl items-start gap-4 rounded-2xl border border-gold/25 bg-plum/40 p-5 backdrop-blur-sm"
          >
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-[14px] leading-relaxed text-dim">
              {copy.questionExamples.disclaimer}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
