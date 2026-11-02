import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useP } from "../base";
import { ArrowLeft, ArrowRight, Check, FileText, Info, X } from "lucide-react";
import { Bookmark, Sprout } from "../components/icons";
import { Illustration } from "../components/Illustration";
import { DEMO_QUESTIONS, TRAINING_AREA } from "../data/questions";
import { useDemo, useDerived } from "../demoState";

const TOTAL = DEMO_QUESTIONS.length;

export default function QuestionsScreen() {
  const p = useP();
  const { state, update } = useDemo();
  const { correct, wrong, points } = useDerived();
  const navigate = useNavigate();
  const [showSummary, setShowSummary] = React.useState(state.completed);
  const [announce, setAnnounce] = React.useState("");
  const feedbackRef = React.useRef<HTMLDivElement>(null);

  const index = Math.min(Math.max(state.index, 0), TOTAL - 1);
  const q = DEMO_QUESTIONS[index];
  const answer = state.answers[q.id];
  const confirmed = !!answer?.confirmed;
  const saved = state.bookmarks.includes(q.id);
  const isLast = index === TOTAL - 1;
  const percent = Math.round(((index + 1) / TOTAL) * 100);

  React.useEffect(() => {
    if (confirmed) feedbackRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [confirmed, q.id]);

  const choose = (id: string) => {
    if (confirmed) return;
    update((s) => ({ answers: { ...s.answers, [q.id]: { choice: id, confirmed: false } } }));
  };

  const confirm = () => {
    if (!answer?.choice || confirmed) return;
    update((s) => ({ answers: { ...s.answers, [q.id]: { choice: answer.choice, confirmed: true } } }));
  };

  const go = (delta: number) => update({ index: Math.min(Math.max(index + delta, 0), TOTAL - 1) });

  const finish = () => {
    update({ completed: true });
    setShowSummary(true);
    window.scrollTo(0, 0);
  };

  const toggleSave = () => {
    update((s) => ({
      bookmarks: s.bookmarks.includes(q.id) ? s.bookmarks.filter((b) => b !== q.id) : [...s.bookmarks, q.id],
    }));
    setAnnounce(saved ? "Questão removida das salvas." : "Questão salva para revisar.");
  };

  const restart = () => {
    update({ index: 0, answers: {}, completed: false });
    setShowSummary(false);
    window.scrollTo(0, 0);
  };

  if (showSummary && state.completed) {
    return (
      <div className="fsl-screen">
        <header className="fsl-qbar">
          <Link to={p()} className="fsl-icon-btn" aria-label="Voltar ao início">
            <ArrowLeft size={28} aria-hidden="true" />
          </Link>
          <p className="fsl-qbar-title">{TRAINING_AREA}</p>
          <span className="fsl-icon-btn-spacer" />
        </header>
        <div className="fsl-summary">
          <h1 className="fsl-display">Treino concluído!</h1>
          <p className="fsl-summary-lead">
            Você acertou <strong>{correct.length} de {TOTAL}</strong> questões demonstrativas e somou{" "}
            <strong>{points} pontos</strong> na demonstração.
          </p>
          <ul className="fsl-summary-list">
            {DEMO_QUESTIONS.map((item, i) => {
              const a = state.answers[item.id];
              const ok = a?.confirmed && a.choice === item.correct;
              return (
                <li key={item.id} className={ok ? "is-ok" : "is-bad"}>
                  <span className="fsl-summary-mark">
                    {ok ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <X size={18} strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span>
                    Questão {i + 1}: {ok ? "correta" : a?.confirmed ? "incorreta" : "não respondida"}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="fsl-summary-actions">
            {wrong.length > 0 ? (
              <Link to={p("/revisao")} className="fsl-btn fsl-btn-green fsl-btn-block">
                Revisar meus erros <ArrowRight size={22} aria-hidden="true" />
              </Link>
            ) : null}
            <Link to={p("/pratica")} className="fsl-btn fsl-btn-navy fsl-btn-block">
              Praticar anotação e evolução <ArrowRight size={22} aria-hidden="true" />
            </Link>
            <button type="button" className="fsl-btn fsl-btn-outline fsl-btn-block" onClick={() => { setShowSummary(false); update({ index: 0 }); window.scrollTo(0, 0); }}>
              Rever as questões
            </button>
            <button type="button" className="fsl-btn fsl-btn-outline fsl-btn-block" onClick={restart}>
              Refazer o treino
            </button>
            <button type="button" className="fsl-link-btn fsl-center" onClick={() => navigate(p())}>
              Voltar ao início
            </button>
          </div>
          <p className="fsl-demo-note">
            <Info size={16} aria-hidden="true" /> Questões demonstrativas, sujeitas a revisão editorial antes do lançamento.
          </p>
        </div>
      </div>
    );
  }

  const canConfirm = !!answer?.choice && !confirmed;
  const isCorrect = confirmed && answer.choice === q.correct;

  return (
    <div className="fsl-screen">
      <header className="fsl-qbar">
        <Link to={p()} className="fsl-icon-btn" aria-label="Voltar ao início">
          <ArrowLeft size={28} aria-hidden="true" />
        </Link>
        <p className="fsl-qbar-title">{TRAINING_AREA}</p>
        <button
          type="button"
          className={`fsl-icon-btn${saved ? " is-on" : ""}`}
          aria-pressed={saved}
          aria-label={saved ? "Remover questão das salvas" : "Salvar questão para revisar"}
          onClick={toggleSave}
        >
          <Bookmark size={28} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </header>
      <p className="fsl-sr" role="status" aria-live="polite">{announce}</p>

      <div className="fsl-q-grid">
        <div className="fsl-q-left">
          <div className="fsl-progress-row">
            <div
              className="fsl-progress"
              role="progressbar"
              aria-label="Progresso do treino"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`Questão ${index + 1} de ${TOTAL}`}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="fsl-progress-pct">{percent}%</span>
          </div>
          <p className="fsl-progress-label">Questão {index + 1} de {TOTAL}</p>

          <div className="fsl-qhero">
            <div className="fsl-qhero-text">
              <h1 className="fsl-display fsl-display-xl">Vamos praticar?</h1>
              <span className="fsl-pill-mint">
                <FileText size={22} aria-hidden="true" /> {q.topic}
              </span>
            </div>
            <div className="fsl-qhero-art" aria-hidden="true">
              <Illustration name="pratica" sizes="(min-width: 1024px) 420px, 60vw" className="fsl-qhero-img" />
            </div>
          </div>
        </div>

        <div className="fsl-q-right">
          {/* key por questão: remonta os rádios; reaproveitá-los trocando só o `name` confunde o grupo do navegador. */}
          <fieldset key={q.id} className="fsl-fieldset">
            <legend className="fsl-question">{q.statement}</legend>
            <div className="fsl-options">
              {q.options.map((opt) => {
                const chosen = answer?.choice === opt.id;
                const isRight = confirmed && opt.id === q.correct;
                const isWrong = confirmed && chosen && opt.id !== q.correct;
                return (
                  <label
                    key={opt.id}
                    className={`fsl-option${chosen ? " is-chosen" : ""}${isRight ? " is-right" : ""}${isWrong ? " is-wrong" : ""}${confirmed ? " is-locked" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`opcao-${q.id}`}
                      value={opt.id}
                      checked={chosen}
                      disabled={confirmed}
                      onChange={() => choose(opt.id)}
                    />
                    <span className="fsl-option-body">
                      <span className="fsl-option-letter" aria-hidden="true">{opt.id}</span>
                      <span className="fsl-option-text">
                        <span className="fsl-sr">Alternativa {opt.id}: </span>
                        {opt.text}
                        {isRight ? <span className="fsl-sr"> (resposta correta)</span> : null}
                        {isWrong ? <span className="fsl-sr"> (sua resposta, incorreta)</span> : null}
                      </span>
                      {isRight ? <Check className="fsl-option-state" size={26} strokeWidth={3} aria-hidden="true" /> : null}
                      {isWrong ? <X className="fsl-option-state" size={26} strokeWidth={3} aria-hidden="true" /> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div ref={feedbackRef} className="fsl-feedback-wrap" role="status" aria-live="polite">
            {confirmed ? (
              <div className={`fsl-feedback ${isCorrect ? "is-ok" : "is-bad"}`}>
                <p className="fsl-feedback-title">
                  {isCorrect ? "Resposta correta!" : `Não foi dessa vez. A resposta correta é a alternativa ${q.correct}.`}
                </p>
                <p>{q.explanation}</p>
              </div>
            ) : null}
          </div>

          <div className="fsl-q-actions">
            <button
              type="button"
              className="fsl-btn fsl-btn-outline fsl-btn-prev"
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label="Questão anterior"
            >
              <ArrowLeft size={22} aria-hidden="true" /> <span className="fsl-prev-text">Anterior</span>
            </button>
            {!confirmed ? (
              <button type="button" className="fsl-btn fsl-btn-green fsl-btn-grow" onClick={confirm} disabled={!canConfirm}>
                Confirmar resposta <ArrowRight size={22} aria-hidden="true" />
              </button>
            ) : isLast ? (
              <button type="button" className="fsl-btn fsl-btn-green fsl-btn-grow" onClick={finish}>
                Concluir treino <Check size={22} strokeWidth={3} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="fsl-btn fsl-btn-green fsl-btn-grow" onClick={() => go(1)}>
                Próxima questão <ArrowRight size={22} aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="fsl-q-hint">
            <Sprout size={22} aria-hidden="true" />
            {canConfirm || confirmed ? "Você pode aprender no seu ritmo" : "Escolha uma alternativa para confirmar"}
          </p>
          <p className="fsl-demo-note">
            <Info size={16} aria-hidden="true" /> Questões demonstrativas, sujeitas a revisão editorial antes do lançamento.
          </p>
        </div>
      </div>
    </div>
  );
}
