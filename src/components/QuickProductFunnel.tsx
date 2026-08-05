import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, MessageCircle, Sparkles } from "lucide-react";
import { brand, commercial, copy, type QuickProduct, type ResultTag } from "@/config/site";
import { trackContact, trackInitiateCheckout, trackLead, trackSelectPackage } from "@/lib/metaPixel";
import { openQuickProductWhatsApp } from "@/lib/whatsapp";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { StarField } from "./common/StarField";

type Phase = "intro" | "quiz" | "summary" | "details" | "final";

const TAG_PRIORITY: ResultTag[] = ["clareza", "ciclo", "seguranca", "coragem"];

/**
 * Versão enxuta do funil de tema: sem escolha de pacote (preço único) e com
 * quiz opcional. A Carta Canalizada pula direto pra confirmação — perguntar
 * antes contradiria a própria ideia de mensagem espontânea do universo.
 */
export function QuickProductFunnel({ product }: { product: QuickProduct }) {
  const [phase, setPhase] = React.useState<Phase>("intro");
  const [quizIndex, setQuizIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<ResultTag[]>([]);
  const [firstName, setFirstName] = React.useState("");
  const [context, setContext] = React.useState("");
  const [awareDeadline, setAwareDeadline] = React.useState(false);
  const [awarePrice, setAwarePrice] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; consent?: string }>({});

  const reduced = useReducedMotion();
  const f = copy.funnel;

  const eventPayload = { packageName: product.eventName, questions: 1, value: product.price };

  const resultTag = React.useMemo<ResultTag>(() => {
    if (answers.length === 0) return "clareza";
    const counts: Record<ResultTag, number> = { clareza: 0, seguranca: 0, ciclo: 0, coragem: 0 };
    answers.forEach((tag) => counts[tag]++);
    return TAG_PRIORITY.slice().sort((a, b) => counts[b] - counts[a])[0];
  }, [answers]);

  const result = product.quiz?.results[resultTag];

  const advancingRef = React.useRef(false);
  React.useEffect(() => {
    advancingRef.current = false;
  }, [quizIndex, phase]);

  const start = () => {
    trackSelectPackage(eventPayload);
    trackInitiateCheckout(eventPayload);
    setPhase(product.hasQuiz ? "quiz" : "details");
  };

  const answerQuiz = (tag: ResultTag) => {
    if (advancingRef.current || !product.quiz) return;
    advancingRef.current = true;

    const next = [...answers];
    next[quizIndex] = tag;
    setAnswers(next);

    window.setTimeout(
      () => {
        if (quizIndex + 1 < product.quiz!.questions.length) {
          setQuizIndex((i) => i + 1);
        } else {
          setPhase("summary");
        }
      },
      reduced ? 0 : 200,
    );
  };

  const submitDetails = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (firstName.trim().length < 2) nextErrors.name = f.nameError;
    if (!awareDeadline || !awarePrice) nextErrors.consent = f.consentError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    trackLead("prazo_confirmado", eventPayload);
    trackLead("valor_confirmado", eventPayload);
    trackLead("tela_final_whatsapp", eventPayload);
    setPhase("final");
  };

  const sendToWhatsApp = () => {
    trackContact(eventPayload);
    openQuickProductWhatsApp({ firstName, product, context });
  };

  const transition = reduced ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <section
      id="funil-experiencia"
      className="relative isolate flex min-h-[100svh] scroll-mt-20 items-center justify-center overflow-hidden py-24"
    >
      <div aria-hidden="true" className="absolute inset-0">
        <img
          src={brand.heroVideo.poster}
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,4,13,0.55) 0%, rgba(7,4,13,0.3) 28%, rgba(7,4,13,0.4) 68%, rgba(7,4,13,0.82) 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "radial-gradient(60% 55% at 50% 48%, rgba(7,4,13,0.55) 0%, transparent 72%)",
          }}
        />
      </div>
      <StarField count={20} mobileCount={8} seed={29} className="z-[1]" />

      <div className="shell relative z-10 flex justify-center">
        <div className="w-full max-w-[560px]">
          <AnimatePresence mode="wait">
            {phase === "intro" && (
              <Stage key="intro" transition={transition}>
                <IntroStep product={product} onStart={start} />
              </Stage>
            )}

            {phase === "quiz" && product.quiz && (
              <Stage key={`quiz-${quizIndex}`} transition={transition}>
                <QuizStep
                  index={quizIndex}
                  total={product.quiz.questions.length}
                  question={product.quiz.questions[quizIndex]}
                  onAnswer={answerQuiz}
                  onBack={quizIndex > 0 ? () => setQuizIndex((i) => i - 1) : () => setPhase("intro")}
                />
              </Stage>
            )}

            {phase === "summary" && result && (
              <Stage key="summary" transition={transition}>
                <SummaryStep result={result} onContinue={() => setPhase("details")} />
              </Stage>
            )}

            {phase === "details" && (
              <Stage key="details" transition={transition}>
                <DetailsStep
                  product={product}
                  firstName={firstName}
                  setFirstName={setFirstName}
                  context={context}
                  setContext={setContext}
                  awareDeadline={awareDeadline}
                  setAwareDeadline={setAwareDeadline}
                  awarePrice={awarePrice}
                  setAwarePrice={setAwarePrice}
                  errors={errors}
                  onSubmit={submitDetails}
                  onBack={() => setPhase(product.hasQuiz ? "summary" : "intro")}
                />
              </Stage>
            )}

            {phase === "final" && (
              <Stage key="final" transition={transition}>
                <FinalStep product={product} onSend={sendToWhatsApp} />
              </Stage>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── Palco ─────────────────────────────────── */

function Stage({
  children,
  transition,
}: {
  children: React.ReactNode;
  transition: { duration: number; ease?: readonly [number, number, number, number] };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={transition}
      className="glass-strong rounded-[28px] p-6 shadow-halo sm:p-9"
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────── Etapa 1 ───────────────────────────────── */

function IntroStep({ product, onStart }: { product: QuickProduct; onStart: () => void }) {
  const qf = copy.quickFunnel;
  return (
    <div className="flex flex-col items-center text-center">
      <span className="eyebrow inline-flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-gold" strokeWidth={1.6} aria-hidden="true" />
        {product.page.eyebrow}
      </span>
      <h1 className="mt-4 font-display text-[clamp(1.9rem,6vw,2.8rem)] leading-[1.08] text-cream text-balance">
        {product.page.title}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-dim">{product.page.intro}</p>

      <ul className="mt-6 flex w-full flex-col gap-2.5 text-left">
        {product.page.observe.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[14px] leading-snug text-cream/85">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={2.2} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-6 font-display text-[1.6rem] gold-text">{product.priceLabel}</p>

      <Button full onClick={onStart} className="mt-6">
        {qf.startCta}
      </Button>
    </div>
  );
}

/* ─────────────────────────────── Quiz ──────────────────────────────────── */

function QuizStep({
  index,
  total,
  question,
  onAnswer,
  onBack,
}: {
  index: number;
  total: number;
  question: NonNullable<QuickProduct["quiz"]>["questions"][number];
  onAnswer: (tag: ResultTag) => void;
  onBack: () => void;
}) {
  const f = copy.funnel;
  const progress = ((index + 1) / total) * 100;

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={f.back}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-white/[0.03] text-cream transition-colors hover:border-gold/55"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
        </button>
        <div className="flex-1">
          <Progress value={progress} label={f.quizProgressLabel} />
        </div>
        <span className="shrink-0 text-[12px] font-semibold text-dim">
          {index + 1}/{total}
        </span>
      </div>

      <fieldset className="mt-7 flex flex-col gap-4">
        <legend className="mb-1 text-center font-display text-[1.4rem] leading-snug text-cream">
          {question.question}
        </legend>
        <div className="flex flex-col gap-2.5">
          {question.options.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onAnswer(option.tag)}
              className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-white/[0.03] px-5 text-left text-[15px] text-cream/90 transition-all duration-300 hover:border-gold/55 hover:bg-white/[0.07] active:scale-[0.99]"
            >
              {option.label}
              <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-gold/35" />
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/* ────────────────────────────── Resumo ─────────────────────────────────── */

function SummaryStep({
  result,
  onContinue,
}: {
  result: { title: string; text: string };
  onContinue: () => void;
}) {
  const f = copy.funnel;
  const qf = copy.quickFunnel;
  return (
    <div className="flex flex-col items-center text-center">
      <span
        aria-hidden="true"
        className="grid h-14 w-14 place-items-center rounded-full border border-gold/45 bg-gold/[0.08] text-gold"
        style={{ boxShadow: "0 0 34px -8px rgba(217,172,91,0.75)" }}
      >
        <Sparkles className="h-6 w-6" strokeWidth={1.6} />
      </span>

      <p className="mt-5 eyebrow">{f.summaryEyebrow}</p>
      <h2 className="mt-3 font-display text-[1.7rem] leading-tight text-cream">{result.title}</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-cream/85">{result.text}</p>

      <p className="mt-5 rounded-2xl border border-gold/20 bg-white/[0.02] p-4 text-[13px] leading-relaxed text-dim">
        {qf.summaryNote}
      </p>

      <Button full onClick={onContinue} className="mt-7">
        {qf.summaryCta}
      </Button>
    </div>
  );
}

/* ─────────────────────────── Dados do cliente ──────────────────────────── */

function DetailsStep({
  product,
  firstName,
  setFirstName,
  context,
  setContext,
  awareDeadline,
  setAwareDeadline,
  awarePrice,
  setAwarePrice,
  errors,
  onSubmit,
  onBack,
}: {
  product: QuickProduct;
  firstName: string;
  setFirstName: (v: string) => void;
  context: string;
  setContext: (v: string) => void;
  awareDeadline: boolean;
  setAwareDeadline: (v: boolean) => void;
  awarePrice: boolean;
  setAwarePrice: (v: boolean) => void;
  errors: { name?: string; consent?: string };
  onSubmit: (event: React.FormEvent) => void;
  onBack: () => void;
}) {
  const f = copy.funnel;
  const qf = copy.quickFunnel;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={f.back}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-white/[0.03] text-cream transition-colors hover:border-gold/55"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
        </button>
        <p className="eyebrow flex-1 text-center">{f.detailsEyebrow}</p>
        <span aria-hidden="true" className="h-10 w-10 shrink-0" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-white/[0.03] p-4">
        <span className="font-display text-[1.1rem] text-cream">{product.name}</span>
        <span className="font-display text-[1.3rem] gold-text">{product.priceLabel}</span>
      </div>

      <h2 className="mt-6 font-display text-[1.4rem] leading-snug text-cream">{qf.detailsTitle}</h2>

      <div className="mt-5 flex flex-col gap-2.5">
        <Label htmlFor="rapida-nome">{f.nameLabel}</Label>
        <Input
          id="rapida-nome"
          autoComplete="given-name"
          placeholder={f.namePlaceholder}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          aria-invalid={Boolean(errors.name)}
          maxLength={40}
        />
        {errors.name && (
          <p role="alert" className="text-[13px] text-red-300">
            {errors.name}
          </p>
        )}
      </div>

      {product.collectContext && (
        <div className="mt-5 flex flex-col gap-2.5">
          <Label htmlFor="rapida-contexto">{qf.contextLabel}</Label>
          <textarea
            id="rapida-contexto"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={qf.contextPlaceholder}
            rows={3}
            className="w-full rounded-2xl border border-gold/25 bg-white/[0.04] p-4 text-[15px] leading-relaxed text-cream placeholder:text-dim/50 transition-colors focus:border-gold/70 focus:bg-white/[0.06]"
          />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        <label htmlFor="rapida-prazo" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="rapida-prazo"
            checked={awareDeadline}
            onCheckedChange={(v) => setAwareDeadline(v === true)}
          />
          <span className="text-[13.5px] leading-snug text-cream/90">{f.consentDeadline}</span>
        </label>
        <label htmlFor="rapida-valor" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="rapida-valor"
            checked={awarePrice}
            onCheckedChange={(v) => setAwarePrice(v === true)}
          />
          <span className="text-[13.5px] leading-snug text-cream/90">{f.consentPrice}</span>
        </label>
        {errors.consent && (
          <p role="alert" className="text-[13px] text-red-300">
            {errors.consent}
          </p>
        )}
      </div>

      <Button type="submit" full className="mt-7">
        {qf.submitCta}
      </Button>
    </form>
  );
}

/* ──────────────────────────── Tela final ───────────────────────────────── */

function FinalStep({ product, onSend }: { product: QuickProduct; onSend: () => void }) {
  const f = copy.funnel;
  return (
    <div className="flex flex-col items-center text-center">
      <span
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-full border border-gold/45 bg-gold/[0.08] text-gold"
        style={{ boxShadow: "0 0 40px -10px rgba(217,172,91,0.75)" }}
      >
        <Check className="h-7 w-7" strokeWidth={1.8} />
      </span>

      <h2 className="mt-5 font-display text-[1.7rem] leading-tight text-cream">{f.finalTitle}</h2>
      <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-dim">{f.finalText}</p>

      <div className="mt-6 w-full rounded-2xl border border-gold/25 bg-white/[0.03] p-4 text-left">
        <p className="flex items-center justify-between text-[14px] text-cream/90">
          <span className="text-dim">Experiência</span>
          <span className="font-semibold">{product.name}</span>
        </p>
        <p className="mt-2 flex items-center justify-between text-[14px] text-cream/90">
          <span className="text-dim">Valor</span>
          <span className="font-semibold">{product.priceLabel}</span>
        </p>
        <p className="mt-2 flex items-center justify-between text-[14px] text-cream/90">
          <span className="text-dim">Entrega estimada</span>
          <span className="font-semibold">{commercial.deliveryTime}</span>
        </p>
      </div>

      <Button full onClick={onSend} className="mt-7">
        <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {f.finalCta}
      </Button>
    </div>
  );
}
