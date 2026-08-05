import * as React from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { copy, sectionIds } from "@/config/site";
import { SectionHeading } from "./common/SectionHeading";
import { StarField } from "./common/StarField";

const STEPS = copy.howItWorks.steps;

/**
 * O fluxo se revela conforme a página desce: a linha dourada se desenha, um
 * ponto de luz percorre o caminho e cada etapa surge quando a luz chega nela.
 */
export function HowItWorks() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 78%", "end 62%"],
  });

  /* A mola suaviza o movimento e evita qualquer sensação de "pulo". */
  const progress = useSpring(scrollYProgress, {
    stiffness: 55,
    damping: 22,
    restDelta: 0.001,
  });

  return (
    <section
      id={sectionIds.howItWorks}
      ref={sectionRef}
      className="relative scroll-mt-24 overflow-hidden py-16 sm:py-20 lg:py-28"
    >
      <StarField count={22} mobileCount={8} seed={31} />

      <div className="shell relative z-10">
        <SectionHeading eyebrow={copy.howItWorks.eyebrow} title={copy.howItWorks.title} />

        <div className="relative mt-12 sm:mt-16">
          {/* Trilha e linha luminosa — vertical no celular, horizontal no desktop. */}
          <span
            aria-hidden="true"
            className="absolute left-[27px] top-4 bottom-4 w-px bg-gold/12 lg:left-0 lg:right-0 lg:top-[38px] lg:h-px lg:w-auto lg:bg-gold/12"
          />

          <motion.span
            aria-hidden="true"
            className="absolute left-[27px] top-4 bottom-4 w-px origin-top lg:hidden"
            style={{
              scaleY: reduced ? 1 : progress,
              background:
                "linear-gradient(180deg, rgba(217,172,91,0.2), rgba(243,215,154,0.95) 50%, rgba(217,172,91,0.2))",
              boxShadow: "0 0 14px rgba(243,215,154,0.55)",
            }}
          />

          <motion.span
            aria-hidden="true"
            className="absolute left-0 right-0 top-[38px] hidden h-px origin-left lg:block"
            style={{
              scaleX: reduced ? 1 : progress,
              background:
                "linear-gradient(90deg, rgba(217,172,91,0.2), rgba(243,215,154,0.95) 50%, rgba(217,172,91,0.2))",
              boxShadow: "0 0 14px rgba(243,215,154,0.55)",
            }}
          />

          {!reduced && <TravellingLight progress={progress} />}

          <ol className="relative grid gap-10 lg:grid-cols-3 lg:gap-10">
            {STEPS.map((step, index) => (
              <Step
                key={step.title}
                index={index}
                title={step.title}
                text={step.text}
                progress={progress}
                reduced={Boolean(reduced)}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Ponto de luz que percorre a linha à frente das etapas. */
function TravellingLight({ progress }: { progress: MotionValue<number> }) {
  const position = useTransform(progress, [0, 1], ["0%", "100%"]);
  const opacity = useTransform(progress, [0, 0.06, 0.94, 1], [0, 1, 1, 0]);

  return (
    <>
      <motion.span
        aria-hidden="true"
        className="absolute left-[27px] top-4 h-3 w-3 -translate-x-1/2 rounded-full lg:hidden"
        style={{
          top: position,
          opacity,
          background: "radial-gradient(circle, #F7F0E5 0%, #F3D79A 40%, rgba(217,172,91,0) 72%)",
          boxShadow: "0 0 22px rgba(243,215,154,0.9)",
        }}
      />
      <motion.span
        aria-hidden="true"
        className="absolute top-[38px] hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full lg:block"
        style={{
          left: position,
          opacity,
          background: "radial-gradient(circle, #F7F0E5 0%, #F3D79A 40%, rgba(217,172,91,0) 72%)",
          boxShadow: "0 0 22px rgba(243,215,154,0.9)",
        }}
      />
    </>
  );
}

function Step({
  index,
  title,
  text,
  progress,
  reduced,
}: {
  index: number;
  title: string;
  text: string;
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  /* Cada etapa acende quando a luz da linha passa por ela. */
  const start = index * 0.3;
  const opacity = useTransform(progress, [start, start + 0.22], [0, 1]);
  const y = useTransform(progress, [start, start + 0.22], [26, 0]);
  const blur = useTransform(progress, [start, start + 0.22], ["blur(7px)", "blur(0px)"]);
  const markGlow = useTransform(
    progress,
    [start, start + 0.18],
    ["0 0 0px rgba(217,172,91,0)", "0 0 34px -4px rgba(217,172,91,0.85)"],
  );
  const markBorder = useTransform(
    progress,
    [start, start + 0.18],
    ["rgba(217,172,91,0.22)", "rgba(217,172,91,0.75)"],
  );

  return (
    <motion.li
      className="relative flex gap-5 lg:flex-col lg:gap-0"
      style={
        reduced
          ? undefined
          : { opacity, y, filter: blur, willChange: "opacity, transform, filter" }
      }
    >
      <motion.span
        aria-hidden="true"
        className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink font-display text-xl text-gold-light"
        style={
          reduced
            ? { border: "1px solid rgba(217,172,91,0.45)" }
            : { borderWidth: 1, borderStyle: "solid", borderColor: markBorder, boxShadow: markGlow }
        }
      >
        {index + 1}
      </motion.span>

      <div className="lg:mt-7">
        <h3 className="font-display text-[1.5rem] leading-snug text-cream sm:text-[1.65rem]">
          {title}
        </h3>
        <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-dim">{text}</p>
      </div>
    </motion.li>
  );
}
