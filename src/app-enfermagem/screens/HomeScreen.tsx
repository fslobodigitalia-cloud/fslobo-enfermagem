import { Link } from "react-router-dom";
import { useP } from "../base";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { Bookmark, Stethoscope } from "../components/icons";
import { Avatar, Brand } from "../components/Brand";
import { Illustration } from "../components/Illustration";
import { TRAINING_AREA, DEMO_QUESTIONS } from "../data/questions";
import { useDemo, useDerived } from "../demoState";

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const TODAY_INDEX = 3; // demonstração: "hoje" é quinta

export default function HomeScreen() {
  const p = useP();
  const { state } = useDemo();
  const { weekDone, wrong } = useDerived();
  const answered = Object.values(state.answers).filter((a) => a.confirmed).length;
  const cta = state.completed ? "Rever resultado" : answered > 0 ? "Continuar treino" : "Começar treino";

  return (
    <div className="fsl-screen">
      <header className="fsl-topbar">
        <Brand />
        <Link to={p("/perfil")} className="fsl-avatar-link" aria-label="Abrir meu perfil">
          <Avatar size={56} />
        </Link>
      </header>

      <div className="fsl-home-grid">
        <div className="fsl-home-main">
          <p className="fsl-hello">Olá, Flávio!</p>
          <h1 className="fsl-display">
            Um pouco melhor
            <br />
            <span className="fsl-underline">a cada plantão.</span>
          </h1>

          <section className="fsl-hero" aria-labelledby="treino-titulo">
            <Illustration
              name="estudo"
              priority
              sizes="(min-width: 1024px) 560px, (min-width: 520px) 480px, calc(100vw - 72px)"
              className="fsl-hero-img"
            />
            <h2 id="treino-titulo" className="fsl-hero-title">
              Seu treino de hoje
            </h2>
            <p className="fsl-hero-sub">{DEMO_QUESTIONS.length} questões. A prática de registros fica à parte.</p>
            <span className="fsl-pill-white">
              <Stethoscope size={22} aria-hidden="true" /> {TRAINING_AREA}
            </span>
            <Link to={p("/questoes")} className="fsl-btn fsl-btn-navy fsl-btn-block">
              {cta} <ArrowRight size={22} aria-hidden="true" />
            </Link>
            <Link to={p("/pratica")} className="fsl-hero-link">
              Praticar anotação e evolução (casos fictícios)
            </Link>
          </section>
        </div>

        <div className="fsl-home-side">
          <section className="fsl-card fsl-week" aria-labelledby="semana-titulo">
            <div className="fsl-week-head">
              <h2 id="semana-titulo" className="fsl-h3">
                Sua semana
              </h2>
              <p className="fsl-week-count">
                <strong>{weekDone} de 5</strong> treinos
              </p>
            </div>
            <ul className="fsl-week-days">
              {WEEK.map((d, i) => {
                const done = i < weekDone;
                const today = i === TODAY_INDEX;
                return (
                  <li key={d} className={`fsl-day${done ? " is-done" : ""}${today ? " is-today" : ""}`}>
                    <span className="fsl-day-dot">
                      {done ? <Check size={22} strokeWidth={3} aria-hidden="true" /> : null}
                    </span>
                    <span className="fsl-day-name">{d}</span>
                    <span className="fsl-sr">
                      {done ? "treino concluído" : today ? "hoje, treino pendente" : "sem treino"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="fsl-note">Semana ilustrativa para demonstração.</p>
          </section>

          <Link to={p("/revisao")} className="fsl-review-link">
            <span className="fsl-review-icon">
              <Bookmark size={26} fill="currentColor" aria-hidden="true" />
            </span>
            <span className="fsl-review-text">
              <strong>Revisar meus erros</strong>
              <span>
                {wrong.length > 0
                  ? `${wrong.length} ${wrong.length === 1 ? "questão para revisar" : "questões para revisar"}`
                  : "Aprenda com as últimas respostas"}
              </span>
            </span>
            <ChevronRight size={26} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
