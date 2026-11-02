import * as React from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import {
  AI_MAX_CHARS, AI_MIN_CHARS, AI_PILOT_EXERCISE, CATEGORY_LABEL,
  type AiClient, type AiFailure, type AiFinding, type AiRound,
} from "../data/aiFeedback";
import { addAiRound, flagAiFinding } from "../practiceStore";

const CERT_LABEL: Record<AiFinding["certainty"], string | null> = {
  alta: null,
  media: "A IA não teve certeza total deste ponto: confira no caso.",
  baixa: "A IA teve pouca certeza deste ponto: ele pode estar errado.",
};

function FindingCard({ f, flagged, onFlag }: { f: AiFinding; flagged: boolean; onFlag: () => void }) {
  return (
    <li className={`fsl-ai-card is-${f.category}`}>
      <p className="fsl-ai-tag">{CATEGORY_LABEL[f.category]}</p>
      <p className="fsl-ai-title">{f.title}</p>
      <dl className="fsl-ai-dl">
        <dt>Seu trecho</dt>
        <dd>
          {f.quote ? <q className="fsl-ai-quote">{f.quote}</q> : <span className="fsl-note">Nada no seu texto: é uma omissão.</span>}
        </dd>
        <dt>{f.category === "clareza" ? "Critério" : "No caso"}</dt>
        <dd>
          {f.evidence}
          {f.source ? <span className="fsl-note fsl-ai-src"> Fonte: {f.source}.</span> : null}
        </dd>
        <dt>Explicação</dt>
        <dd>{f.explanation}</dd>
      </dl>
      {CERT_LABEL[f.certainty] ? <p className="fsl-ai-cert">{CERT_LABEL[f.certainty]}</p> : null}
      {f.origin === "regra" ? <p className="fsl-note">Conferência automática por regra (sem IA): compara horários e valores com o caso.</p> : null}
      {flagged ? (
        <p className="fsl-ai-flagged" role="status">Marcado como incorreto neste navegador. Obrigado.</p>
      ) : (
        <button type="button" className="fsl-link-btn fsl-ai-flag" onClick={onFlag}>
          Este apontamento está incorreto
        </button>
      )}
    </li>
  );
}

function RoundView({ round, exId, ai }: { round: AiRound; exId: string; ai: AiClient | null }) {
  const r = round.result;
  const factual = r.findings.filter((f) => f.severity === "factual");
  const optional = r.findings.filter((f) => f.severity === "opcional");
  const flag = (f: AiFinding) => {
    flagAiFinding(exId, round.n, f.id);
    void ai?.flag({ rubric_id: f.rubric_id, category: f.category, origin: f.origin });
  };
  return (
    <div className="fsl-ai-result" aria-live="polite">
      <p className="fsl-ai-banner" role="note">
        <Info size={18} aria-hidden="true" />
        <span>{r.notice}</span>
      </p>
      <p className="fsl-note">
        Rodada {round.n} · {new Date(round.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        {r.model ? ` · modelo ${r.model}` : ""}
      </p>

      {!r.assessable ? (
        <p className="fsl-ai-unsure" role="status">
          <strong>A IA não conseguiu avaliar este texto com segurança.</strong> {r.limitation}
        </p>
      ) : null}

      {r.assessable && r.hits.length > 0 ? (
        <section aria-labelledby={`hits-${round.n}`}>
          <h3 id={`hits-${round.n}`} className="fsl-ai-h">O que está bem registrado</h3>
          <ul className="fsl-ai-hits">
            {r.hits.map((h) => (
              <li key={h.rubric_id}>
                <q className="fsl-ai-quote">{h.quote}</q>
                <span className="fsl-note"> {h.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {factual.length > 0 ? (
        <section aria-labelledby={`fact-${round.n}`}>
          <h3 id={`fact-${round.n}`} className="fsl-ai-h">Pontos para rever em relação ao caso</h3>
          <ul className="fsl-ai-list">
            {factual.map((f) => (
              <FindingCard key={f.id} f={f} flagged={round.flagged.includes(f.id)} onFlag={() => flag(f)} />
            ))}
          </ul>
        </section>
      ) : null}

      {optional.length > 0 ? (
        <section aria-labelledby={`opt-${round.n}`}>
          <h3 id={`opt-${round.n}`} className="fsl-ai-h">Sugestões opcionais de redação</h3>
          <p className="fsl-note">São sugestões de clareza e de norma de registro, não falhas sobre os fatos do caso.</p>
          <ul className="fsl-ai-list">
            {optional.map((f) => (
              <FindingCard key={f.id} f={f} flagged={round.flagged.includes(f.id)} onFlag={() => flag(f)} />
            ))}
          </ul>
        </section>
      ) : null}

      {r.assessable && r.findings.length === 0 ? (
        <p className="fsl-ai-none" role="status">
          A IA não apontou problemas nesta rodada. Isso não garante que o registro esteja correto: releia o caso e confira com o exemplo comentado.
        </p>
      ) : null}
      {r.discarded > 0 ? <p className="fsl-note">Alguns apontamentos inconsistentes foram descartados automaticamente antes de chegar até você.</p> : null}
    </div>
  );
}

type Props = {
  exId: string;
  text: string;
  rounds: AiRound[];
  /** null na demonstração pública: a IA só é oferecida a quem entrou na conta. */
  ai: AiClient | null;
  onEdit: () => void;
};

export default function AiFeedbackPanel({ exId, text, rounds, ai, onEdit }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<AiFailure | null>(null);
  const [cool, setCool] = React.useState(0);
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);
  React.useEffect(() => {
    if (cool <= 0) return;
    const t = window.setTimeout(() => setCool((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cool]);

  const trimmed = text.trim();
  const last = rounds.length ? rounds[rounds.length - 1] : null;
  const same = !!last && last.text.trim() === trimmed;
  const tooShort = trimmed.length < AI_MIN_CHARS;
  const tooLong = Array.from(trimmed).length > AI_MAX_CHARS;
  const blockedReason = tooShort
    ? `Escreva ao menos ${AI_MIN_CHARS} caracteres para corrigir.`
    : tooLong
      ? `A correção aceita até ${AI_MAX_CHARS} caracteres.`
      : same
        ? "Edite o texto para avaliar de novo."
        : cool > 0
          ? `Aguarde ${cool}s para tentar de novo.`
          : null;

  const run = async () => {
    if (!ai || busy || blockedReason) return;
    setBusy(true);
    setErr(null);
    const sent = trimmed;
    const out = await ai.evaluate(sent);
    if (!alive.current) return;
    setBusy(false);
    if (out.ok) addAiRound(exId, sent, out.result);
    else {
      setErr(out);
      if (out.retryAfter) setCool(Math.min(120, out.retryAfter));
    }
  };

  const visible = last;
  return (
    <section className="fsl-card fsl-ai" aria-labelledby="ia-titulo">
      <h2 id="ia-titulo" className="fsl-h3">Correção assistida por IA <span className="fsl-ai-pilot">piloto</span></h2>
      <p className="fsl-note">
        Opcional. A IA compara o seu texto com os fatos do caso e aponta o que falta, o que contradiz e o que não consta
        do caso. É um feedback educativo: pode errar, não é avaliação clínica e não gera nota, pontos nem conquistas.
      </p>
      <p className="fsl-note">
        Ao corrigir, o seu texto é enviado ao servidor do app e ao provedor de IA (Anthropic) só para gerar este feedback.
        O app não guarda esse texto no servidor; o provedor o processa segundo os termos dele. Não escreva dados de pessoas reais.
      </p>

      {!ai ? (
        <div className="fsl-ai-off" role="note">
          <p>
            <strong>Disponível só na sua conta.</strong> A demonstração pública não usa IA. Entre na sua conta para corrigir este exercício; o que você escreveu aqui continua salvo neste navegador.
          </p>
          <Link to={`/app/pratica/${AI_PILOT_EXERCISE}`} className="fsl-btn fsl-btn-outline">Ir para a minha conta</Link>
          <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" disabled>
            Corrigir meu registro
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={run} disabled={busy || !!blockedReason}>
            {busy ? "Corrigindo…" : rounds.length ? "Avaliar novamente" : "Corrigir meu registro"}
          </button>
          <p className="fsl-q-hint fsl-center" role="status">
            {busy ? "Analisando o seu texto. Ele continua salvo e você pode esperar aqui." : blockedReason ?? "O texto enviado é o que está no campo acima."}
          </p>
        </>
      )}

      {err ? (
        <div className="fsl-ai-error" role="alert">
          <p><strong>Não foi possível corrigir agora.</strong> {err.message}</p>
          <p className="fsl-note">Nada foi perdido: o seu rascunho continua no campo acima e salvo neste navegador.</p>
        </div>
      ) : null}

      {visible ? <RoundView round={visible} exId={exId} ai={ai} /> : null}

      {rounds.length > 0 ? (
        <div className="fsl-ai-versions">
          <button type="button" className="fsl-link-strong" onClick={onEdit}>Editar o meu texto e avaliar de novo</button>
          <details className="fsl-ai-first">
            <summary>Ver a minha primeira versão (rodada 1)</summary>
            <p className="fsl-pre">{rounds[0].text}</p>
          </details>
          {rounds.length > 1 ? (
            <details className="fsl-ai-first">
              <summary>Rodadas anteriores ({rounds.length - 1})</summary>
              <ol className="fsl-ai-prev">
                {rounds.slice(0, -1).map((r) => (
                  <li key={r.n}>
                    <strong>Rodada {r.n}</strong> — {r.result.findings.filter((f) => f.severity === "factual").length} ponto(s) para rever,{" "}
                    {r.result.findings.filter((f) => f.severity === "opcional").length} sugestão(ões) opcional(is).
                    <p className="fsl-pre">{r.text}</p>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
