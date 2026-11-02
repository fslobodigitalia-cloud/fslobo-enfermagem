import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useP } from "../base";
import { api, rpcMessage, type ReviewItem } from "./rpc";

/** Revisão dos erros da conta real. O gabarito aparece aqui porque o aluno já o viu ao errar. */
export default function RemoteReview() {
  const p = useP();
  const [items, setItems] = React.useState<ReviewItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setItems(await api.reviewItems(50));
    } catch (e) {
      setError(rpcMessage(e));
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

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
      <p className="fsl-subtitle">Aprenda com as questões que você errou.</p>

      {error ? (
        <div className="fsl-empty" role="alert">
          <p>{error}</p>
          <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => void load()}>Tentar de novo</button>
        </div>
      ) : items === null ? (
        <p className="fsl-muted" role="status">Carregando…</p>
      ) : items.length === 0 ? (
        <div className="fsl-empty">
          <p>Nenhum erro para revisar por enquanto. As questões que você errar aparecerão aqui.</p>
          <Link to={p("/questoes")} className="fsl-btn fsl-btn-green">Ir para os treinos <ArrowRight size={22} aria-hidden="true" /></Link>
        </div>
      ) : (
        <section className="fsl-review-section" aria-labelledby="erros-titulo">
          <h2 id="erros-titulo" className="fsl-h3">Questões para revisar ({items.length})</h2>
          <Link to={`${p("/questoes")}?modo=revisao`} className="fsl-btn fsl-btn-green">
            Refazer meus erros <ArrowRight size={22} aria-hidden="true" />
          </Link>
          <ul className="fsl-review-list">
            {items.map((it, i) => {
              const right = it.options.find((o) => o.is_correct);
              return (
                <li key={i} className="fsl-review-item">
                  <p className="fsl-review-q">{it.stem}</p>
                  <p className="fsl-note">{it.subject} · errada {it.miss_count} {it.miss_count === 1 ? "vez" : "vezes"}</p>
                  {right ? (
                    <p className="fsl-review-line is-ok"><Check size={18} strokeWidth={3} aria-hidden="true" /> <span><strong>Correta:</strong> {right.label}. {right.body}</span></p>
                  ) : null}
                  {it.explanation ? <p className="fsl-review-exp">{it.explanation}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
