import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, MessageCircle, X } from "lucide-react";
import {
  commercial,
  copy,
  formatOptions,
  sectionIds,
  themeOptions,
  type FormatId,
  type ReadingPackage,
  type ThemeId,
} from "@/config/site";
import { trackContact, trackLead } from "@/lib/metaPixel";
import { openWhatsApp } from "@/lib/whatsapp";
import { scrollToId } from "@/lib/scroll";
import { useSelection } from "@/context/SelectionContext";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type Intent = "conhecendo" | "compreender" | "hoje";
type PriceAnswer = "sim" | "outro" | "depois";

const TOTAL_STEPS = 5;

export default function QualificationModal() {
  const {
    isModalOpen,
    closeQualification,
    backToPackages,
    selectedPackage,
    selectedTheme,
    setSelectedTheme,
  } = useSelection();

  const [step, setStep] = React.useState<Step>(1);
  const [theme, setTheme] = React.useState<ThemeId | null>(selectedTheme);
  const [intent, setIntent] = React.useState<Intent | null>(null);
  const [priceAnswer, setPriceAnswer] = React.useState<PriceAnswer | null>(null);
  const [firstName, setFirstName] = React.useState("");
  const [format, setFormat] = React.useState<FormatId | null>(null);
  const [awareDeadline, setAwareDeadline] = React.useState(false);
  const [awarePrice, setAwarePrice] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; consent?: string }>({});

  const reduced = useReducedMotion();
  const pkg = selectedPackage;

  /* Cada abertura recomeça a qualificação, mantendo o tema já escolhido. */
  React.useEffect(() => {
    if (!isModalOpen) return;
    setStep(1);
    setTheme(selectedTheme);
    setIntent(null);
    setPriceAnswer(null);
    setFirstName("");
    setFormat(null);
    setAwareDeadline(false);
    setAwarePrice(false);
    setErrors({});
  }, [isModalOpen, selectedTheme]);

  if (!pkg) return null;

  const eventData = {
    packageName: pkg.eventName,
    questions: pkg.questions,
    value: pkg.price,
  };

  const progress = step === 6 ? 100 : ((step - 1) / TOTAL_STEPS) * 100 + 100 / TOTAL_STEPS / 2;

  const goBack = () => {
    setErrors({});
    setStep((current) => (current > 1 ? ((current - 1) as Step) : current));
  };

  const confirmPackage = () => {
    trackLead("pacote_confirmado", eventData);
    setStep(2);
  };

  const chooseTheme = (id: ThemeId) => {
    setTheme(id);
    setSelectedTheme(id);
    window.setTimeout(() => setStep(3), reduced ? 0 : 180);
  };

  const chooseIntent = (id: Intent) => {
    setIntent(id);
    if (id !== "conhecendo") window.setTimeout(() => setStep(4), reduced ? 0 : 180);
  };

  const answerPrice = (answer: PriceAnswer) => {
    setPriceAnswer(answer);
    if (answer === "sim") {
      trackLead("valor_confirmado", eventData);
      window.setTimeout(() => setStep(5), reduced ? 0 : 180);
    }
    if (answer === "outro") backToPackages();
  };

  const submitIdentification = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (firstName.trim().length < 2) nextErrors.name = copy.modal.step5.nameError;
    if (!awareDeadline || !awarePrice) nextErrors.consent = copy.modal.step5.consentError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    trackLead("prazo_confirmado", eventData);
    trackLead("tela_final_whatsapp", eventData);
    setStep(6);
  };

  const goToWhatsApp = () => {
    trackContact(eventData);
    openWhatsApp({ firstName, pkg, theme, format });
  };

  const understandHowItWorks = () => {
    closeQualification();
    window.setTimeout(() => scrollToId(sectionIds.howItWorks), 220);
  };

  const stepTitles: Record<Step, string> = {
    1: copy.modal.step1.title,
    2: copy.modal.step2.title,
    3: copy.modal.step3.title,
    4: copy.modal.step4.title,
    5: copy.modal.step5.title,
    6: "Confirmação",
  };

  const transition = reduced
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeQualification()}>
      <DialogContent
        className="glass-strong border border-gold/35 shadow-halo"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* Cabeçalho: progresso, voltar e fechar. */}
        <div className="flex items-center gap-3 border-b border-gold/20 px-5 py-4">
          {step > 1 && step < 6 ? (
            <button
              type="button"
              onClick={goBack}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-white/[0.03] text-cream transition-colors hover:border-gold/55"
              aria-label={copy.modal.back}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
            </button>
          ) : (
            <span aria-hidden="true" className="h-10 w-10 shrink-0" />
          )}

          <div className="flex-1">
            <DialogTitle className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/85">
              {stepTitles[step]}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {step === 6
                ? "Etapa final: continuar o atendimento pelo WhatsApp."
                : `Etapa ${step} de ${TOTAL_STEPS} da qualificação da leitura.`}
            </DialogDescription>
          </div>

          <button
            type="button"
            onClick={closeQualification}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-white/[0.03] text-cream transition-colors hover:border-gold/55"
            aria-label={copy.modal.close}
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        <Progress value={progress} label={copy.modal.progressLabel} className="rounded-none" />

        <div className="max-h-[calc(92svh-120px)] overflow-y-auto px-5 py-6 sm:px-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduced ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -18 }}
              transition={transition}
            >
              {step === 1 && <StepPackage pkg={pkg} onConfirm={confirmPackage} onChange={backToPackages} />}

              {step === 2 && (
                <StepChoice
                  question={copy.modal.step2.question}
                  options={themeOptions.map((option) => ({ id: option.id, label: option.label }))}
                  selected={theme}
                  onSelect={(id) => chooseTheme(id as ThemeId)}
                />
              )}

              {step === 3 && (
                <div className="flex flex-col gap-4">
                  <StepChoice
                    question={copy.modal.step3.question}
                    options={copy.modal.step3.options.map((option) => ({ ...option }))}
                    selected={intent}
                    onSelect={(id) => chooseIntent(id as Intent)}
                  />
                  {intent === "conhecendo" && (
                    <NoticeBox
                      message={copy.modal.step3.browsingMessage}
                      primaryLabel={copy.modal.step3.browsingPrimary}
                      onPrimary={understandHowItWorks}
                      secondaryLabel={copy.modal.step3.browsingSecondary}
                      onSecondary={() => setStep(4)}
                    />
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="flex flex-col gap-5">
                  <SummaryBox pkg={pkg} />
                  <StepChoice
                    question={copy.modal.step4.question}
                    options={copy.modal.step4.options.map((option) => ({ ...option }))}
                    selected={priceAnswer}
                    onSelect={(id) => answerPrice(id as PriceAnswer)}
                  />
                  {priceAnswer === "depois" && (
                    <NoticeBox
                      message={copy.modal.step4.declineMessage}
                      primaryLabel={copy.modal.step3.browsingPrimary}
                      onPrimary={understandHowItWorks}
                      secondaryLabel={copy.modal.close}
                      onSecondary={closeQualification}
                    />
                  )}
                </div>
              )}

              {step === 5 && (
                <StepIdentification
                  firstName={firstName}
                  setFirstName={setFirstName}
                  format={format}
                  setFormat={setFormat}
                  awareDeadline={awareDeadline}
                  setAwareDeadline={setAwareDeadline}
                  awarePrice={awarePrice}
                  setAwarePrice={setAwarePrice}
                  errors={errors}
                  onSubmit={submitIdentification}
                />
              )}

              {step === 6 && <StepFinal onContinue={goToWhatsApp} pkg={pkg} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────── Etapa 1 ───────────────────────────────── */

function StepPackage({
  pkg,
  onConfirm,
  onChange,
}: {
  pkg: ReadingPackage;
  onConfirm: () => void;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[20px] border border-gold/30 bg-white/[0.03] p-5">
        <p className="font-display text-[1.5rem] leading-tight text-cream">{pkg.name}</p>
        <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.18em] text-gold/90">
          {pkg.questions} perguntas
        </p>
        <p className="mt-4 font-display text-[2.5rem] leading-none gold-text">{pkg.priceLabel}</p>

        <ul className="mt-5 flex flex-col gap-2.5">
          {pkg.benefits.slice(0, 4).map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-[14px] text-cream/90">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={2.2} aria-hidden="true" />
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center font-display text-[1.25rem] text-cream">
        {copy.modal.step1.question}
      </p>

      <div className="flex flex-col gap-2.5">
        <Button full onClick={onConfirm}>
          {copy.modal.step1.confirm}
        </Button>
        <Button full variant="subtle" onClick={onChange}>
          {copy.modal.step1.change}
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────── Etapas 2, 3 e 4 — escolhas ─────────────────────── */

function StepChoice({
  question,
  options,
  selected,
  onSelect,
}: {
  question: string;
  options: { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-center font-display text-[1.3rem] leading-snug text-cream">
        {question}
      </legend>
      <div className="flex flex-col gap-2.5">
        {options.map((option) => {
          const isActive = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(option.id)}
              className={cn(
                "flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border px-5 text-left text-[15px]",
                "transition-all duration-300 active:scale-[0.99]",
                isActive
                  ? "border-gold/70 bg-gold/[0.12] text-cream"
                  : "border-gold/25 bg-white/[0.03] text-cream/90 hover:border-gold/50 hover:bg-white/[0.06]",
              )}
            >
              {option.label}
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
                  isActive ? "border-gold bg-gold text-ink" : "border-gold/35",
                )}
              >
                {isActive && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function NoticeBox({
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}) {
  return (
    <div role="status" className="rounded-[20px] border border-gold/30 bg-plum/45 p-5">
      <p className="text-[14px] leading-relaxed text-cream/90">{message}</p>
      <div className="mt-4 flex flex-col gap-2.5">
        <Button full variant="ghost" onClick={onPrimary}>
          {primaryLabel}
        </Button>
        <Button full variant="subtle" onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      </div>
    </div>
  );
}

function SummaryBox({ pkg }: { pkg: ReadingPackage }) {
  const rows = [
    { label: "Pacote", value: pkg.name },
    { label: "Quantidade", value: `${pkg.questions} perguntas` },
    { label: "Valor", value: pkg.priceLabel },
    { label: "Prazo estimado", value: commercial.deliveryTime },
  ];

  return (
    <dl className="grid gap-px overflow-hidden rounded-[20px] border border-gold/30 bg-gold/20">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 bg-ink-soft px-5 py-3.5">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-dim">
            {row.label}
          </dt>
          <dd className="text-right text-[15px] font-semibold text-cream">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ─────────────────────────────── Etapa 5 ───────────────────────────────── */

function StepIdentification({
  firstName,
  setFirstName,
  format,
  setFormat,
  awareDeadline,
  setAwareDeadline,
  awarePrice,
  setAwarePrice,
  errors,
  onSubmit,
}: {
  firstName: string;
  setFirstName: (value: string) => void;
  format: FormatId | null;
  setFormat: (value: FormatId) => void;
  awareDeadline: boolean;
  setAwareDeadline: (value: boolean) => void;
  awarePrice: boolean;
  setAwarePrice: (value: boolean) => void;
  errors: { name?: string; consent?: string };
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Label htmlFor="primeiro-nome">{copy.modal.step5.nameLabel}</Label>
        <Input
          id="primeiro-nome"
          name="primeiro-nome"
          autoComplete="given-name"
          enterKeyHint="next"
          placeholder={copy.modal.step5.namePlaceholder}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "erro-nome" : undefined}
          maxLength={40}
        />
        {errors.name && (
          <p id="erro-nome" role="alert" className="text-[13px] text-red-300">
            {errors.name}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-dim">
          {copy.modal.step5.formatLabel}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {formatOptions.map((option) => {
            const isActive = format === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFormat(option.id)}
                className={cn(
                  "min-h-[54px] rounded-2xl border px-2 text-[13px] font-medium transition-all duration-300 active:scale-[0.98]",
                  isActive
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

      <div className="flex flex-col gap-3.5">
        <label htmlFor="ciente-prazo" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="ciente-prazo"
            checked={awareDeadline}
            onCheckedChange={(value) => setAwareDeadline(value === true)}
            aria-describedby={errors.consent ? "erro-consentimento" : undefined}
          />
          <span className="text-[14px] leading-snug text-cream/90">
            {copy.modal.step5.consentDeadline}
          </span>
        </label>

        <label htmlFor="ciente-valor" className="flex cursor-pointer items-start gap-3">
          <Checkbox
            id="ciente-valor"
            checked={awarePrice}
            onCheckedChange={(value) => setAwarePrice(value === true)}
            aria-describedby={errors.consent ? "erro-consentimento" : undefined}
          />
          <span className="text-[14px] leading-snug text-cream/90">
            {copy.modal.step5.consentPrice}
          </span>
        </label>

        {errors.consent && (
          <p id="erro-consentimento" role="alert" className="text-[13px] text-red-300">
            {errors.consent}
          </p>
        )}
      </div>

      <p className="rounded-2xl border border-gold/20 bg-white/[0.02] p-4 text-[13px] leading-relaxed text-dim">
        {copy.modal.step5.privacyNote}
      </p>

      <Button type="submit" full>
        {copy.modal.step5.submit}
      </Button>
    </form>
  );
}

/* ──────────────────────────── Tela final ───────────────────────────────── */

function StepFinal({ onContinue, pkg }: { onContinue: () => void; pkg: ReadingPackage }) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-full border border-gold/45 bg-gold/[0.08] text-gold"
        style={{ boxShadow: "0 0 40px -10px rgba(217,172,91,0.75)" }}
      >
        <Check className="h-7 w-7" strokeWidth={1.8} />
      </span>

      <h3 className="font-display text-[1.75rem] leading-tight text-cream">
        {copy.modal.final.title}
      </h3>
      <p className="max-w-[38ch] text-[15px] leading-relaxed text-dim">{copy.modal.final.text}</p>

      <div className="w-full">
        <SummaryBox pkg={pkg} />
      </div>

      <Button full onClick={onContinue}>
        <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {copy.modal.final.button}
      </Button>
    </div>
  );
}
