import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Info, Star } from "lucide-react";
import { BarChart3, CalendarDays, GraduationCap, LogOut } from "../components/icons";
import { Avatar, Brand } from "../components/Brand";
import { Illustration } from "../components/Illustration";
import { useP } from "../base";
import { useAuth } from "./auth";
import { api, rpcMessage, type Progress } from "./rpc";

/** Perfil da conta real. Pontos e estatísticas vêm do servidor; ranking não é inventado. */
export default function RemoteProfile() {
  const p = useP();
  const navigate = useNavigate();
  const { profile, email, signOut, saveProfile } = useAuth();
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState(profile?.display_name ?? "");
  const [focus, setFocus] = React.useState(profile?.exam_focus ?? "");
  const [goal, setGoal] = React.useState(profile?.weekly_goal ?? 5);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    api.progress().then(setProgress).catch((e) => setError(rpcMessage(e)));
  }, []);
  React.useEffect(() => {
    if (profile) {
      setName(profile.display_name);
      setFocus(profile.exam_focus ?? "");
      setGoal(profile.weekly_goal);
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(null);
    setSaveError(null);
    const r = await saveProfile(name, focus, goal);
    setSaving(false);
    if (r.ok) setSaved("Perfil salvo.");
    else setSaveError(r.message);
  }

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    await signOut();
    navigate("/app/entrar", { replace: true });
  }

  const accuracy = progress && progress.answered > 0 ? Math.round((progress.correct / progress.answered) * 100) : null;

  return (
    <div className="fsl-screen">
      <header className="fsl-topbar">
        <Brand />
        <button type="button" className="fsl-icon-btn" onClick={() => void leave()} aria-label="Sair da conta" disabled={leaving}>
          <LogOut size={30} aria-hidden="true" />
        </button>
      </header>

      <div className="fsl-profile-grid">
        <div className="fsl-profile-left">
          <div className="fsl-profile-head">
            <h1 className="fsl-display fsl-display-l">
              Sua evolução <span className="fsl-underline">aparece aqui.</span>
            </h1>
            <div className="fsl-profile-id">
              <Avatar size={112} initial={profile?.display_name ?? "?"} />
              <p className="fsl-profile-name">{profile?.display_name ?? "…"}</p>
              <p className="fsl-note">{email}</p>
              <span className="fsl-pill-mint fsl-pill-sm">
                <GraduationCap size={18} aria-hidden="true" /> Meu perfil de estudo
              </span>
            </div>
          </div>

          {error ? <p className="fsl-alert is-error" role="alert">{error}</p> : null}
          <ul className="fsl-stats" aria-label="Resumo do seu progresso">
            <li className="fsl-stat is-green">
              <span className="fsl-stat-icon"><Star size={26} fill="currentColor" aria-hidden="true" /></span>
              <span><strong>{progress ? progress.points : "–"}</strong><small>pontos</small></span>
            </li>
            <li className="fsl-stat is-blue">
              <span className="fsl-stat-icon"><CalendarDays size={26} aria-hidden="true" /></span>
              <span><strong>{progress ? progress.study_days : "–"}</strong><small>dias de estudo</small></span>
            </li>
            <li className="fsl-stat is-orange">
              <span className="fsl-stat-icon"><BarChart3 size={26} aria-hidden="true" /></span>
              <span><strong>{progress ? progress.attempts_completed : "–"}</strong><small>treinos</small></span>
            </li>
          </ul>
          {progress ? (
            <p className="fsl-note">
              {progress.answered} respostas{accuracy !== null ? ` · ${accuracy}% de acerto` : ""} · {progress.scored_questions} questões já pontuadas.
            </p>
          ) : null}

          <section className="fsl-trophy" aria-label="Constância">
            <Illustration name="conquistas" sizes="(min-width: 1024px) 520px, calc(100vw - 72px)" className="fsl-trophy-img" />
            <div className="fsl-trophy-text">
              <h2>Constância que vira conquista.</h2>
              <p>Mais um passo no seu aprendizado.</p>
            </div>
          </section>
        </div>

        <div className="fsl-profile-right">
          <section className="fsl-card" aria-labelledby="perfil-titulo">
            <h2 id="perfil-titulo" className="fsl-h3">Seu perfil de estudo</h2>
            <form onSubmit={save} className="fsl-auth-form">
              <div className="fsl-field">
                <label htmlFor="perfil-nome" className="fsl-label">Como quer ser chamado(a)</label>
                <input id="perfil-nome" className="fsl-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" />
              </div>
              <div className="fsl-field">
                <label htmlFor="perfil-foco" className="fsl-label">Foco de estudo (opcional)</label>
                <input id="perfil-foco" className="fsl-input" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={80} autoComplete="off" />
              </div>
              <div className="fsl-field">
                <label htmlFor="perfil-meta" className="fsl-label">Meta de treinos por semana</label>
                <input id="perfil-meta" className="fsl-input" type="number" min={1} max={21} value={goal} onChange={(e) => setGoal(Number(e.target.value))} required />
              </div>
              {saved ? <p className="fsl-alert is-ok" role="status">{saved}</p> : null}
              {saveError ? <p className="fsl-alert is-error" role="alert">{saveError}</p> : null}
              <button type="submit" className="fsl-btn fsl-btn-navy fsl-btn-block" disabled={saving}>{saving ? "Salvando…" : "Salvar perfil"}</button>
            </form>
          </section>

          <section className="fsl-card" aria-labelledby="ranking-titulo">
            <h2 id="ranking-titulo" className="fsl-h3">Ranking de estudo</h2>
            <p className="fsl-muted">Indisponível por enquanto.</p>
            <p className="fsl-demo-note">
              <Info size={16} aria-hidden="true" /> O ranking só aparecerá quando houver participantes reais. Nesta versão não mostramos posições nem nomes de outras pessoas.
            </p>
          </section>

          <Link to={p("/questoes")} className="fsl-btn fsl-btn-teal fsl-btn-block">
            Continuar meu treino <ArrowRight size={22} aria-hidden="true" />
          </Link>
          <button type="button" className="fsl-btn fsl-btn-outline fsl-btn-block" onClick={() => void leave()} disabled={leaving}>
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
