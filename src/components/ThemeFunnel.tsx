import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, MessageCircle, Sparkles } from "lucide-react";
import {
  commercial,
  copy,
  formatOptions,
  packages,
  type FormatId,
  type ReadingPackage,
  type ReadingTheme,
  type ResultTag,
} from "@/config/site";
import {
  trackContact,
  trackInitiateCheckout,
  trackLead,
  trackSelectPackage,
  trackViewPackages,
} from "@/lib/metaPixel";
import { openFunnelWhatsApp } from "@/lib/whatsapp";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { StarField } from "./common/StarField";
import { cn } from "@/lib/utils";

type Phase = "intro" | "quiz" | "summary" | "pricing" | "details" | "final";

const TAG_PRIORITY: ResultTag[] = ["clareza", "ciclo", "seguranca", "coragem"];

/**
 * Experiência central de cada página de tema: introdução → quiz emocional →
 * resumo instigante → pacotes (só aqui os valores aparecem) → dados do
 * cliente → WhatsApp. A foto da carta fica no fundo do início ao fim.
 */
export function ThemeFunnel({ theme }: { theme: ReadingTheme }) {
  const [phase, setPhase] = React.useState<Phase>("intro");
  const [quizIndex, setQuizIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<ResultTag[]>([]);
  const [selectedPackage, setSelectedPackage] = React.useState<ReadingPackage | null>(null);
  const [firstName, setFirstName] = React.useState("");
  const [format, setFormat] = React.useState<FormatId | null>(null);
  const [questionsText, setQuestionsText] = React.useState("");
  const [awareDeadline, setAwareDeadline] = React.useState(false);
  const [awarePrice, setAwarePrice] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; questions?: string; consent?: string }>({});

  const reduced = useReducedMotion();
  const f = copy.funnel;

  const resultTag = React.useMemo<ResultTag>(() => {
    if (answers.length === 0) return "clareza";
    const counts: Record<ResultTag, number> = { clareza: 0, seguranca: 0, ciclo: 0, coragem: 0 };
    answers.forEach((tag) => counts[tag]++);
    return TAG_PRIORITY.slice().sort((a, b) => counts[b] - counts[a])[0];
  }, [answers]);

  const result = theme.quiz.results[resultTag];

  /* A seção de pacotes só existe visualmente quando a fase chega nela — o
     evento ViewContent dispara nesse momento, não antes. */
  React.useEffect(() => {
    if (phase === "pricing") trackViewPackages();
  }, [phase]);

  /* Trava o avanço enquanto a transição da pergunta atual está em curso —
     evita que um duplo clique pule uma pergunta do quiz. */
  const advancingRef = React.useRef(false);
  React.useEffect(() => {
    advancingRef.current = false;
  }, [quizIndex, phase]);

  const answerQuiz = (tag: ResultTag) => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    const next = [...answers];
    next[quizIndex] = tag;
    setAnswers(next);

    window.setTimeout(
      () => {
        if (quizIndex + 1 < theme.quiz.questions.length) {
          setQuizIndex((i) => i + 1);
        } else {
          setPhase("summary");
        }
      },
      reduced ? 0 : 200,
    );
  };

  const choosePackage = (pkg: ReadingPackage) => {
    const payload = { packageName: pkg.eventName, questions: pkg.questions, value: pkg.price };
    trackSelectPackage(payload);
    trackInitiateCheckout(payload);
    setSelectedPackage(pkg);
    setPhase("details");
  };

  const submitDetails = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPackage) return;

    const nextErrors: typeof errors = {};
    if (firstName.trim().length < 2) nextErrors.name = f.nameError;
    if (questionsText.trim().length === 0) nextErrors.questions = f.questionsError;
    if (!awareDeadline || !awarePrice) nextErrors.consent = f.consentError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {
      packageName: selectedPackage.eventName,
      questions: selectedPackage.questions,
      value: selectedPackage.price,
    };
    trackLead("prazo_confirmado", payload);
    trackLead("valor_confirmado", payload);
    trackLead("tela_final_whatsapp", payload);
    setPhase("final");
  };

  const sendToWhatsApp = () => {
    if (!selectedPackage) return;
    trackContact({
      packageName: selectedPackage.eventName,
      questions: selectedPackage.questions,
      value: selectedPackage.price,
    });
    openFunnelWhatsApp({
      firstName,
      pkg: selectedPackage,
      theme: theme.id,
      format,
      questionsText,
    });
  };

  const transition = reduced ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <section
      id="funil-tema"
      className="relative isolate flex min-h-[100svh] scroll-mt-20 items-center justify-center overflow-hidden py-24"
    >
      {/* A foto da carta permanece no fundo em todas as etapas do funil. */}
      <div aria-hidden="true" className="absolute inset-0">
        <picture>
          <source srcSet={theme.image.heroAvif} type="image/avif" />
          <img
            src={theme.image.heroWebp}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
          />
        </picture>
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
            background:
              "radial-gradient(60% 55% at 50% 48%, rgba(7,4,13,0.55) 0%, transparent 72%)",
          }}
        />
      </div>
      <StarField count={20} mobileCount={8} seed={17} className="z-[1]" />

      <div className="shell relative z-10 flex justify-center">
        <div className="w-full max-w-[560px]">
          <AnimatePresence mode="wait">
            {phase === "intro" && (
              <Stage key="intro" transition={transition}>
                <IntroStep theme={theme} onStart={() => setPhase("quiz")} />
              </Stage>
            )}

            {phase === "quiz" && (
              <Stage key={`quiz-${quizIndex}`} transition={transition}>
                <QuizStep
                  index={quizIndex}
                  total={theme.quiz.questions.length}
                  question={theme.quiz.questions[quizIndex]}
                  onAnswer={answerQuiz}
                  onBack={
                    quizIndex > 0
                      ? () => setQuizIndex((i) => i - 1)
                      : () => setPhase("intro")
                  }
                />
              </Stage>
            )}

            {phase === "summary" && (
              <Stage key="summary" transition={transition}>
                <SummaryStep result={result} onContinue={() => setPhase("pricing")} />
              </Stage>
            )}

            {phase === "pricing" && (
              <Stage key="pricing" transition={transition}>
                <PricingStep onChoose={choosePackage} onBack={() => setPhase("summary")} />
              </Stage>
            )}

            {phase === "details" && selectedPackage && (
              <Stage key="details" transition={transition}>
                <DetailsStep
                  pkg={selectedPackage}
                  firstName={firstName}
                  setFirstName={setFirstName}
                  format={format}
                  setFormat={setFormat}
                  questionsText={questionsText}
                  setQuestionsText={setQuestionsText}
                  awareDeadline={awareDeadline}
                  setAwareDeadline={setAwareDeadline}
                  awarePrice={awarePrice}
                  setAwarePrice={setAwarePrice}
                  errors={errors}
                  onSubmit={submitDetails}
                  onChangePackage={() => setPhase("pricing")}
                />
              </Stage>
            )}

            {phase === "final" && selectedPackage && (
              <Stage key="final" transition={transition}>
                <FinalStep pkg={selectedPackage} onSend={sendToWhatsApp} />
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

function IntroStep({ theme, onStart }: { theme: ReadingTheme; onStart: () => void }) {
  const f = copy.funnel;
  return (
    <div className="flex flex-col items-center text-center">
      <span className="eyebrow inline-flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-gold" strokeWidth={1.6} aria-hidden="true" />
        {theme.page.eyebrow}
      </span>
      <h1 className="mt-4 font-display text-[clamp(1.9rem,6vw,2.8rem)] leading-[1.08] text-cream text-balance">
        {theme.page.title}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-dim">{theme.page.intro}</p>

      <ul className="mt-6 flex w-full flex-col gap-2.5 text-left">
        {theme.page.observe.slice(0, 4).map((item) => (
          <li key={item} className="flex items-start gap-3 text-[14px] leading-snug text-cream/85">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={2.2} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <Button full onClick={onStart} className="mt-8">
        {f.startCta}
      </Button>
      <p className="mt-3 text-[12px] text-dim/70">{f.startNote}</p>
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
  question: ReadingTheme["quiz"]["questions"][number];
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
        {f.summaryNote}
      </p>

      <Button full onClick={onContinue} className="mt-7">
        {f.summaryCta}
      </Button>
    </div>
  );
}

/* ────────────────────────────── Pacotes ────────────────────────────────── */

function PricingStep({
  onChoose,
  onBack,
}: {
  onChoose: (pkg: ReadingPackage) => void;
  onBack: () => void;
}) {
  const f = copy.funnel;
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
        <p className="eyebrow flex-1 text-center">{f.pricingEyebrow}</p>
        <span aria-hidden="true" className="h-10 w-10 shrink-0" />
      </div>

      <h2 className="mt-4 text-center font-display text-[1.6rem] leading-snug text-cream">
        {f.pricingTitle}
      </h2>
      <p className="mx-auto mt-2 max-w-[40ch] text-center text-[14px] text-dim">{f.pricingText}</p>

      <ul className="mt-7 flex flex-col gap-3">
        {packages.map((pkg) => (
          <li key={pkg.id}>
            <button
              type="button"
              onClick={() => onChoose(pkg)}
              className={cn(
                "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-300 active:scale-[0.99]",
                pkg.featured
                  ? "border-gold/55 bg-gold/[0.08] hover:border-gold/80"
                  : "border-gold/25 bg-white/[0.03] hover:border-gold/50 hover:bg-white/[0.06]",
              )}
            >
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-display text-[1.15rem] text-cream">{pkg.name}</span>
                  {pkg.badge && (
                    <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gold-light">
                      {pkg.badge}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[12.5px] text-dim">
                  {pkg.questions} perguntas · {pkg.description}
                </span>
              </span>
              <span className="shrink-0 font-display text-[1.4rem] gold-text">{pkg.priceLabel}</span>
            </button>
          </li>
        ))}
      </ul>

      <ul className="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[12px] text-dim/85">
        <li>Entrega estimada: {commercial.deliveryTime}</li>
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold/55" />
          Pagamento por {commercial.paymentMethod}
        </li>
      </ul>
    </div>
  );
}

/* ─────────────────────────── Dados do cliente ──────────────────────────── */

function DetailsStep({
  pkg,
  firstName,
  setFirstName,
  format,
  setFormat,
  questionsText,
  setQuestionsText,
  awareDeadline,
  setAwareDeadline,
  awarePrice,
  setAwarePrice,
  errors,
  onSubmit,
  onChangePackage,
}: {
  pkg: ReadingPackage;
  firstName: string;
  setFirstName: (v: string) => void;
  format: FormatId | null;
  setFormat: (v: FormatId) => void;
  questionsText: string;
  setQuestionsText: (v: string) => void;
  awareDeadline: boolean;
  setAwareDeadline: (v: boolean) => void;
  awarePrice: boolean;
  setAwarePrice: (v: boolean) => void;
  errors: { name?: string; questions?: string; consent?: string };
  onSubmit: (event: React.FormEvent) => void;
  onChangePackage: () => void;
}) {
  const f = copy.funnel;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-white/[0.03] p-4">
        <span>
          <span className="block font-display text-[1.1rem] text-cream">{pkg.name}</span>
          <span className="text-[12.5px] text-dim">{pkg.questions} perguntas</span>
        </span>
        <span className="font-display text-[1.3rem] gold-text">{pkg.priceLabel}</span>
      </div>
      <button
        type="button"
        onClick={onChangePackage}
        className="mt-2 text-[12.5px] text-dim underline underline-offset-4 transition-colors hover:text-gold-light"
      >
        {f.changePackage}
      </button>

      <p className="mt-6 eyebrow">{f.detailsEyebrow}</p>
      <h2 className="mt-2 font-display text-[1.4rem] leading-snug text-cream">{f.detailsTitle}</h2>

      <div className="mt-5 flex flex-col gap-2.5">
        <Label htmlFor="funil-nome">{f.nameLabel}</Label>
        <Input
          id="funil-nome"
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

      <div className="mt-5 flex flex-col gap-2.5">
        <Label htmlFor="funil-perguntas">
          {f.questionsLabel} — {f.questionsHint} {pkg.questions}
        </Label>
        <textarea
          id="funil-perguntas"
          value={questionsText}
          onChange={(e) => setQuestionsText(e.target.value)}
          placeholder={f.questionsPlaceholder}
          rows={5}
          aria-invalid={Boolean(errors.questions)}
          className="w-full rounded-2xl border border-gold/25 bg-white/[0.04] p-4 text-[15px] leading-relaxed text-cream placeholder:text-dim/50 transition-colors focus:border-gold/70 focus:bg-white/[0.06]"
        />
        {errors.questions && (
          <p role="alert" className="text-[13px] text-red-300">
            {errors.questions}
          </p>
        )}
      </div>

      <fieldset className="mt-5 flex flex-col gap-2.5">
        <legend className="mb-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-dim">
          {f.formatLabel}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {formatOptions.map((option) => {
            const active = format === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFormat(option.id)}
                className={cn(
                  "min-h-[50px] rounded-2xl border px-2 text-[13px] font-medium transition-all duration-300 active:scale-[0.98]",
                  active
                    ? "border-gold/70 bg-gold/[0.12] text-cream"
                    : "border-gold/25 bg-white/[0.03] text-cream/85 hover:border-gold/50",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-col gap-3">
        <label htmlFor="funil-prazo" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="funil-prazo"
            checked={awareDeadline}
            onCheckedChange={(v) => setAwareDeadline(v === true)}
          />
          <span className="text-[13.5px] leading-snug text-cream/90">{f.consentDeadline}</span>
        </label>
        <label htmlFor="funil-valor" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="funil-valor"
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
        {f.submitCta}
      </Button>
    </form>
  );
}

/* ──────────────────────────── Tela final ───────────────────────────────── */

function FinalStep({ pkg, onSend }: { pkg: ReadingPackage; onSend: () => void }) {
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
          <span className="text-dim">Pacote</span>
          <span className="font-semibold">{pkg.name}</span>
        </p>
        <p className="mt-2 flex items-center justify-between text-[14px] text-cream/90">
          <span className="text-dim">Valor</span>
          <span className="font-semibold">{pkg.priceLabel}</span>
        </p>
      </div>

      <Button full onClick={onSend} className="mt-7">
        <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {f.finalCta}
      </Button>
    </div>
  );
}
