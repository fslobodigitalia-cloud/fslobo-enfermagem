import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowLeft, Search, Calculator, ListChecks, GraduationCap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bem-vindo")({
  head: () => ({
    meta: [
      { title: "Como funciona — FSlobo Enfermagem" },
      { name: "description", content: "Descubra em 4 passos como estudar, calcular doses e acompanhar plantões com o FSlobo." },
    ],
  }),
  component: OnboardingPage,
});

type Step = {
  icon: typeof Search;
  kicker: string;
  title: string;
  desc: string;
  gradient: string;
};

const STEPS: Step[] = [
  {
    icon: Search,
    kicker: "Passo 1",
    title: "Encontre o material certo",
    desc: "Busque por tema, categoria ou procedimento e receba resumos, apostilas e vídeos organizados para o seu nível.",
    gradient: "from-primary via-primary to-primary/70",
  },
  {
    icon: Calculator,
    kicker: "Passo 2",
    title: "Calcule doses em segundos",
    desc: "Calculadora clínica com gotejamento, diluições e conversões — respostas rápidas, seguras e explicadas.",
    gradient: "from-secondary via-secondary to-secondary/70",
  },
  {
    icon: ListChecks,
    kicker: "Passo 3",
    title: "Siga checklists de rotina",
    desc: "Passo a passo de procedimentos e rotinas de plantão para não esquecer nenhuma etapa importante.",
    gradient: "from-primary via-primary to-primary/70",
  },
  {
    icon: GraduationCap,
    kicker: "Passo 4",
    title: "Estude no seu ritmo",
    desc: "Acompanhe seu progresso, salve favoritos e receba recomendações personalizadas para evoluir todo dia.",
    gradient: "from-secondary via-secondary to-secondary/70",
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem("fsl_seen_onboarding", "1");
    } catch {
      /* ignore */
    }
  }, []);

  const isLast = i === STEPS.length - 1;
  const step = STEPS[i];
  const Icon = step.icon;

  function next() {
    if (isLast) {
      navigate({ to: "/auth" });
    } else {
      setI((v) => v + 1);
    }
  }

  function back() {
    if (i > 0) setI((v) => v - 1);
  }

  return (
    <div className="flex min-h-full flex-col p-5 pt-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          <Sparkles className="h-3 w-3" /> Bem-vindo(a)
        </span>
        <Link to="/auth" className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">
          Pular
        </Link>
      </div>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((_, k) => (
          <span
            key={k}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              k <= i ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col justify-center py-8 animate-fade-in" key={i}>
        <div
          className={cn(
            "mx-auto grid h-40 w-40 place-items-center rounded-[36px] bg-gradient-to-br text-white shadow-[var(--shadow-elevated)]",
            step.gradient,
          )}
        >
          <Icon className="h-16 w-16" strokeWidth={1.8} />
        </div>
        <p className="mt-8 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          {step.kicker}
        </p>
        <h1 className="mt-2 text-center text-[24px] font-extrabold leading-tight text-foreground">
          {step.title}
        </h1>
        <p className="mx-auto mt-3 max-w-[340px] text-center text-[14px] leading-snug text-muted-foreground">
          {step.desc}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          disabled={i === 0}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-card text-foreground shadow-[var(--shadow-card)] tap-scale disabled:opacity-40"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={next}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-elevated)] tap-scale"
        >
          {isLast ? "Entrar ou cadastrar" : "Próximo"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}