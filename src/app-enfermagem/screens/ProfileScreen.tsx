import * as React from "react";
import { Link } from "react-router-dom";
import { useP } from "../base";
import { ArrowRight, Info, Star } from "lucide-react";
import { BarChart3, BookOpen, CalendarDays, Flame, GraduationCap, Pencil, Settings } from "../components/icons";
import { Avatar, Brand } from "../components/Brand";
import { Illustration } from "../components/Illustration";
import { ILLUSTRATIVE_SCORES, rankFor } from "../data/ranking";
import { useDerived } from "../demoState";
import { useShell } from "../components/AppShell";

export default function ProfileScreen() {
  const p = useP();
  const { points, treinos, studyDays } = useDerived();
  const { openSettings } = useShell();
  const [badge, setBadge] = React.useState<string | null>(null);
  const [rankOpen, setRankOpen] = React.useState(false);
  const rank = rankFor(points);

  const badges = [
    { id: "treino", label: "Primeiro treino", text: "Concedida ao concluir o primeiro treino. Conquista ilustrativa da demonstração.", Icon: BookOpen, tone: "green" },
    { id: "registro", label: "Primeiro registro", text: "Conquista ilustrativa e fixa da demonstração. A aba Prática (anotação e evolução) não concede pontos nem conquistas.", Icon: Pencil, tone: "blue" },
    { id: "dias", label: `${studyDays} dias de estudo`, text: "Contagem ilustrativa de dias de estudo da demonstração.", Icon: Flame, tone: "orange" },
  ] as const;
  const active = badges.find((b) => b.id === badge);

  // Ranking ilustrativo: lista fixa sem nomes, com a posição de "Você" encaixada pela pontuação.
  const rows = [...ILLUSTRATIVE_SCORES.map((s) => ({ score: s, me: false })), { score: points, me: true }].sort(
    (a, b) => b.score - a.score || Number(b.me) - Number(a.me),
  );

  return (
    <div className="fsl-screen">
      <header className="fsl-topbar">
        <Brand />
        <button type="button" className="fsl-icon-btn" onClick={openSettings} aria-label="Abrir configurações da demonstração">
          <Settings size={30} aria-hidden="true" />
        </button>
      </header>

      <div className="fsl-profile-grid">
        <div className="fsl-profile-left">
          <div className="fsl-profile-head">
            <h1 className="fsl-display fsl-display-l">
              Sua evolução <span className="fsl-underline">aparece aqui.</span>
            </h1>
            <div className="fsl-profile-id">
              <Avatar size={112} />
              <p className="fsl-profile-name">Flávio</p>
              <span className="fsl-pill-mint fsl-pill-sm">
                <GraduationCap size={18} aria-hidden="true" /> Meu perfil de estudo
              </span>
            </div>
          </div>

          <ul className="fsl-stats" aria-label="Resumo do seu progresso">
            <li className="fsl-stat is-green">
              <span className="fsl-stat-icon"><Star size={26} fill="currentColor" aria-hidden="true" /></span>
              <span><strong>{points}</strong><small>pontos</small></span>
            </li>
            <li className="fsl-stat is-blue">
              <span className="fsl-stat-icon"><CalendarDays size={26} aria-hidden="true" /></span>
              <span><strong>{studyDays}</strong><small>dias de estudo</small></span>
            </li>
            <li className="fsl-stat is-orange">
              <span className="fsl-stat-icon"><BarChart3 size={26} aria-hidden="true" /></span>
              <span><strong>{treinos}</strong><small>treinos</small></span>
            </li>
          </ul>

          <section className="fsl-trophy" aria-label="Conquistas">
            <Illustration name="conquistas" sizes="(min-width: 1024px) 520px, calc(100vw - 72px)" className="fsl-trophy-img" />
            <div className="fsl-trophy-text">
              <h2>Constância que vira conquista.</h2>
              <p>Mais um passo no seu aprendizado.</p>
            </div>
          </section>
        </div>

        <div className="fsl-profile-right">
          <section className="fsl-card" aria-labelledby="conquistas-titulo">
            <h2 id="conquistas-titulo" className="fsl-h3">Suas conquistas</h2>
            <ul className="fsl-badges">
              {badges.map(({ id, label, Icon, tone }) => (
                <li key={id}>
                  <button
                    type="button"
                    className={`fsl-badge is-${tone}${badge === id ? " is-selected" : ""}`}
                    aria-pressed={badge === id}
                    onClick={() => setBadge(badge === id ? null : id)}
                  >
                    <span className="fsl-badge-circle"><Icon size={46} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="fsl-badge-label">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fsl-badge-detail" role="status" aria-live="polite">
              {active ? active.text : "Toque em uma conquista para ver os detalhes."}
            </p>
          </section>

          <section className="fsl-card" aria-labelledby="desafio-titulo">
            <div className="fsl-challenge-head">
              <div>
                <h2 id="desafio-titulo" className="fsl-h3">Desafio da semana</h2>
                <p className="fsl-muted">Ranking de estudo</p>
              </div>
              <button
                type="button"
                className="fsl-link-strong"
                aria-expanded={rankOpen}
                aria-controls="ranking-lista"
                onClick={() => setRankOpen((o) => !o)}
              >
                {rankOpen ? "Ocultar" : "Ver desafio"} <ArrowRight size={20} aria-hidden="true" className={rankOpen ? "fsl-rot" : ""} />
              </button>
            </div>
            <div className="fsl-me-row">
              <Avatar size={52} />
              <span className="fsl-me-text"><strong>Você</strong><span>{points} pontos</span></span>
              <span className="fsl-rank-chip" aria-label={`Posição ${rank}`}>{rank}º</span>
            </div>
            {rankOpen ? (
              <ol id="ranking-lista" className="fsl-rank-list">
                {rows.map((r, i) => (
                  <li key={i} className={r.me ? "is-me" : ""}>
                    <span className="fsl-rank-pos">{i + 1}º</span>
                    <span className="fsl-rank-name">{r.me ? "Você" : "Participante ilustrativo"}</span>
                    <span className="fsl-rank-score">{r.score} pts</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="fsl-note fsl-center">Pontos representam participação nos estudos.</p>
            <p className="fsl-demo-note">
              <Info size={16} aria-hidden="true" /> Ranking ilustrativo: as demais posições são exemplos fixos, sem usuários reais nem dados da plataforma.
            </p>
          </section>

          <Link to={p("/questoes")} className="fsl-btn fsl-btn-teal fsl-btn-block">
            Continuar meu treino <ArrowRight size={22} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
