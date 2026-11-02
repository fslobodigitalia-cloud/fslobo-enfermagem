import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Bookmark, Stethoscope } from "../components/icons";
import { Avatar, Brand } from "../components/Brand";
import { Illustration } from "../components/Illustration";
import { useP } from "../base";
import { useAuth } from "./auth";
import { api, rpcMessage, type Progress, type Subject } from "./rpc";

/** Início da conta real: tudo vem do servidor. Sem dados fictícios; sem questões, mostra estado vazio. */
export default function RemoteHome() {
  const p = useP();
  const { profile } = useAuth();
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [subjects, setSubjects] = React.useState<Subject[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [pr, su] = await Promise.all([api.progress(), api.listSubjects()]);
      setProgress(pr);
      setSubjects(su);
    } catch (e) {
      setError(rpcMessage(e));
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const first = (profile?.display_name ?? "").split(" ")[0];
  const totalQuestions = (subjects ?? []).reduce((a, s) => a + s.question_count, 0);
  const goal = progress?.weekly_goal ?? profile?.weekly_goal ?? 5;
  const weekPct = progress ? Math.min(100, Math.round((progress.week_completed / Math.max(goal, 1)) * 100)) : 0;

  return (
    <div className="fsl-screen">
      <header className="fsl-topbar">
        <Brand />
        <Link to={p("/perfil")} className="fsl-avatar-link" aria-label="Abrir meu perfil">
          <Avatar size={56} initial={first || "?"} />
        </Link>
      </header>

      <div className="fsl-home-grid">
        <div className="fsl-home-main">
          <p className="fsl-hello">{first ? `Olá, ${first}!` : "Olá!"}</p>
          <h1 className="fsl-display">
            Um pouco melhor
            <br />
            <span className="fsl-underline">a cada plantão.</span>
          </h1>

          {error ? (
            <div className="fsl-empty" role="alert">
              <p>{error}</p>
              <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => void load()}>Tentar de novo</button>
            </div>
          ) : (
            <section className="fsl-hero" aria-labelledby="treino-titulo">
              <Illustration name="estudo" priority sizes="(min-width: 1024px) 560px, (min-width: 520px) 480px, calc(100vw - 72px)" className="fsl-hero-img" />
              <h2 id="treino-titulo" className="fsl-hero-title">Seu treino de hoje</h2>
              {subjects === null ? (
                <p className="fsl-hero-sub" role="status">Carregando…</p>
              ) : subjects.length > 0 ? (
                <>
                  <p className="fsl-hero-sub">{totalQuestions} questões em {subjects.length} {subjects.length === 1 ? "assunto" : "assuntos"}</p>
                  <span className="fsl-pill-white"><Stethoscope size={22} aria-hidden="true" /> {subjects[0].name}</span>
                  <Link to={p("/questoes")} className="fsl-btn fsl-btn-navy fsl-btn-block">
                    Começar treino <ArrowRight size={22} aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="fsl-hero-sub">Ainda não há questões publicadas</p>
                  <p className="fsl-hero-note">O banco de questões deste ambiente ainda não foi liberado. Quando for, seu treino aparecerá aqui.</p>
                  <Link to="/app/demo" className="fsl-hero-link">Ver a demonstração do app</Link>
                </>
              )}
            </section>
          )}
        </div>

        <div className="fsl-home-side">
          <section className="fsl-card fsl-week" aria-labelledby="semana-titulo">
            <div className="fsl-week-head">
              <h2 id="semana-titulo" className="fsl-h3">Sua semana</h2>
              <p className="fsl-week-count">
                <strong>{progress ? progress.week_completed : "–"} de {goal}</strong> treinos
              </p>
            </div>
            <div className="fsl-progress" role="progressbar" aria-label="Meta da semana" aria-valuemin={0} aria-valuemax={100} aria-valuenow={weekPct}>
              <span style={{ width: `${weekPct}%` }} />
            </div>
            <p className="fsl-note">Treinos concluídos desde segunda-feira. Sua meta semanal fica no perfil.</p>
          </section>

          <Link to={p("/revisao")} className="fsl-review-link">
            <span className="fsl-review-icon"><Bookmark size={26} fill="currentColor" aria-hidden="true" /></span>
            <span className="fsl-review-text">
              <strong>Revisar meus erros</strong>
              <span>
                {progress && progress.pending_review > 0
                  ? `${progress.pending_review} ${progress.pending_review === 1 ? "questão para revisar" : "questões para revisar"}`
                  : "Nenhum erro para revisar por enquanto"}
              </span>
            </span>
            <ChevronRight size={26} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
