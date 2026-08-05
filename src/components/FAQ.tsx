import { copy, sectionIds } from "@/config/site";
import { SectionHeading } from "./common/SectionHeading";
import { Reveal } from "./common/Reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

export function FAQ() {
  return (
    <section id={sectionIds.faq} className="relative scroll-mt-24 py-16 sm:py-20 lg:py-28">
      <div className="shell relative z-10">
        <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} />

        <Reveal className="mx-auto mt-10 w-full max-w-3xl sm:mt-12">
          {/* O Radix cuida de aria-expanded, aria-controls e navegação por teclado. */}
          <Accordion type="single" collapsible className="flex flex-col gap-3">
            {copy.faq.items.map((item, index) => (
              <AccordionItem key={item.q} value={`faq-${index}`}>
                {/* O <AccordionPrimitive.Header> do Radix já renderiza um h3. */}
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
