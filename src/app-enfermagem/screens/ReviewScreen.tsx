import { Link, useNavigate } from "react-router-dom";
import { useP } from "../base";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Bookmark } from "../components/icons";
import { DEMO_QUESTIONS } from "../data/questions";
import { useDemo, useDerived } from "../demoState";

export default function ReviewScreen() {
  const p = useP();
  const { state, update } = useDemo();
  const { wrong } = useDerived();
  const navigate = useNavigate();
  const saved = DEMO_QUESTIONS.filter((q) => state.bookmarks.includes(q.id));

  const open = (id: string, redo: boolean) => {
    const idx = DEMO_QUESTIONS.findIndex((q) => q.id === id);
    update((s) => {
      if (!redo) return { index: idx, completed: false };
      const { [id]: _removed, ...rest } = s.answers;
      void _removed;
      return { index: idx, answers: rest, completed: false };
    });
    navigate(p("/questoes"));
  };

  return (
    <div className="fsl-screen">
      <header className="fsl-qbar">
        <Link to={p()} className="fsl-icon-btn" aria-label="Voltar ao início">
          <ArrowLeft size={28} aria-hidden="true" />
        </Link>
        <p className="fsl-qbar-title">Revisão</p>
        <span className="fsl-icon-btn-spacer" />
      </header>

      <h1 className="fsl-display fsl-display-l">Revisar meus erros</h1>
      <p className="fsl-subtitle">Aprenda com as últimas respostas do treino demonstrativo.</p>

      <section className="fsl-review-section" aria-labelledby="erros-titulo">
        <h2 id="erros-titulo" className="fsl-h3">Questões para revisar ({wrong.length})</h2>
        {wrong.length === 0 ? (
          <div className="fsl-empty">
            <p>Nenhum erro por enquanto. Responda ao treino de hoje e as questões que errar aparecerão aqui.</p>
            <Link to={p("/questoes")} className="fsl-btn fsl-btn-green">
              Ir para o treino <ArrowRight size={22} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ul className="fsl-review-list">
            {wrong.map((q) => {
              const mine = q.options.find((o) => o.id === state.answers[q.id].choice);
              const right = q.options.find((o) => o.id === q.correct);
              return (
                <li key={q.id} className="fsl-review-item">
                  <p className="fsl-review-q">{q.statement}</p>
                  <p className="fsl-review-line is-bad"><X size={18} strokeWidth={3} aria-hidden="true" /> <span><strong>Sua resposta:</strong> {mine?.id}. {mine?.text}</span></p>
                  <p className="fsl-review-line is-ok"><Check size={18} strokeWidth={3} aria-hidden="true" /> <span><strong>Correta:</strong> {right?.id}. {right?.text}</span></p>
                  <p className="fsl-review-exp">{q.explanation}</p>
                  <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => open(q.id, true)}>
                    Refazer esta questão
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="fsl-review-section" aria-labelledby="salvas-titulo">
        <h2 id="salvas-titulo" className="fsl-h3">Questões salvas ({saved.length})</h2>
        {saved.length === 0 ? (
          <p className="fsl-muted">
            Use o ícone <Bookmark size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> na tela de questões para salvar uma questão aqui.
          </p>
        ) : (
          <ul className="fsl-review-list">
            {saved.map((q) => (
              <li key={q.id} className="fsl-review-item">
                <p className="fsl-review-q">{q.statement}</p>
                <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => open(q.id, false)}>
                  Ir para a questão
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="fsl-demo-note">Questões demonstrativas, sujeitas a revisão editorial antes do lançamento.</p>
    </div>
  );
}
