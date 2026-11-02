import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, FileText, Info, X } from "lucide-react";
import { useP } from "../base";
import {
  api,
  rpcMessage,
  RpcError,
  type AttemptMode,
  type AttemptPayload,
  type Progress,
  type Subject,
} from "./rpc";

const COUNTS = [5, 10, 15, 20];

/**
 * Treino real. O servidor sorteia as questões, confere cada resposta, revela o gabarito só depois
 * de respondida, conclui o treino e calcula os pontos. Este componente só mostra o que o servidor
 * devolve: ele não conhece o gabarito antes da resposta e não calcula pontuação.
 */
export default function RemoteQuestions() {
  const p = useP();
  const wantReview = new URLSearchParams(useLocation().search).get("modo") === "revisao";

  const [phase, setPhase] = React.useState<"loading" | "setup" | "running" | "error">("loading");
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [payload, setPayload] = React.useState<AttemptPayload | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [holdId, setHoldId] = React.useState<string | null>(null); // item cujo feedback ainda está na tela
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [confirmStop, setConfirmStop] = React.useState(false);

  const [mode, setMode] = React.useState<AttemptMode>(wantReview ? "review" : "practice");
  const [slug, setSlug] = React.useState("");
  const [count, setCount] = React.useState(5);

  const load = React.useCallback(async () => {
    setPhase("loading");
    try {
      const [subs, prog, attempts] = await Promise.all([api.listSubjects(), api.progress(), api.listAttempts(10)]);
      setSubjects(subs);
      setProgress(prog);
      setSlug((cur) => (subs.some((s) => s.slug === cur) ? cur : (subs[0]?.slug ?? "")));
      const open = attempts.filter((a) => a.status === "in_progress");
      const pick = open.find((a) => (wantReview ? a.mode === "review" : a.mode !== "review")) ?? open[0];
      if (pick) {
        const pl = await api.getAttempt(pick.id);
        if (pl.attempt.resumable) {
          setPayload(pl);
          setHoldId(null);
          setSelected(null);
          setPhase("running");
          return;
        }
        setMsg("Seu treino anterior ficou parado por muito tempo e expirou. Comece um novo.");
      }
      setPayload(null);
      setPhase("setup");
    } catch (e) {
      setMsg(rpcMessage(e));
      setPhase("error");
    }
  }, [wantReview]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const pl = await api.startAttempt(mode === "review" ? null : slug || null, mode, count);
      setPayload(pl);
      setHoldId(null);
      setSelected(null);
      setPhase("running");
    } catch (e) {
      setMsg(rpcMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!payload || busy) return;
    const shown = payload.items.find((i) => !i.answer);
    if (!shown || !selected) return;
    setBusy(true);
    setMsg(null);
    try {
      try {
        await api.submitAnswer(shown.item_id, selected);
      } catch (e) {
        if (!(e instanceof RpcError && e.code === "already_answered")) throw e;
      }
      let pl = await api.getAttempt(payload.attempt.id);
      if (pl.items.every((i) => i.answer) && pl.attempt.status === "in_progress") {
        // última questão: conclui já, para os pontos não dependerem de um segundo clique
        try {
          pl = await api.completeAttempt(payload.attempt.id);
        } catch (e) {
          setMsg(rpcMessage(e));
        }
      }
      setPayload(pl);
      setHoldId(shown.item_id);
      setSelected(null);
    } catch (e) {
      setMsg(rpcMessage(e));
      if (e instanceof RpcError && (e.code === "attempt_expired" || e.code === "attempt_not_open")) void load();
    } finally {
      setBusy(false);
    }
  }

  async function finishNow() {
    if (!payload || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      setPayload(await api.completeAttempt(payload.attempt.id));
    } catch (e) {
      setMsg(rpcMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!payload || busy) return;
    setBusy(true);
    try {
      await api.abandonAttempt(payload.attempt.id);
      setConfirmStop(false);
      setMsg(null);
      await load();
    } catch (e) {
      setMsg(rpcMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const header = (title: string) => (
    <header className="fsl-qbar">
      <Link to={p()} className="fsl-icon-btn" aria-label="Voltar ao início">
        <ArrowLeft size={28} aria-hidden="true" />
      </Link>
      <p className="fsl-qbar-title">{title}</p>
      <span className="fsl-icon-btn-spacer" />
    </header>
  );

  if (phase === "loading") {
    return (
      <div className="fsl-screen" aria-busy="true">
        {header("Questões")}
        <p className="fsl-muted" role="status">Carregando…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="fsl-screen">
        {header("Questões")}
        <p className="fsl-alert is-error" role="alert">{msg}</p>
        <button type="button" className="fsl-btn fsl-btn-navy" onClick={() => void load()}>Tentar de novo</button>
      </div>
    );
  }

  // ───────────── em andamento / concluído ─────────────
  if (phase === "running" && payload) {
    const { attempt, items } = payload;
    const answeredCount = items.filter((i) => i.answer).length;
    const total = attempt.question_count;
    const unanswered = items.find((i) => !i.answer);
    const held = holdId ? items.find((i) => i.item_id === holdId) : undefined;
    const current = held ?? unanswered;
    const modeLabel = attempt.mode === "free" ? "Treino livre" : attempt.mode === "review" ? "Revisão dos erros" : "Treino pontuado";

    // resumo
    if (attempt.status === "completed" && !held) {
      return (
        <div className="fsl-screen">
          {header(modeLabel)}
          <div className="fsl-summary">
            <h1 className="fsl-display">Treino concluído!</h1>
            <p className="fsl-summary-lead">
              Você acertou <strong>{attempt.correct_count ?? 0} de {total}</strong> questões.{" "}
              {attempt.awards_points ? (
                <>Pontos deste treino: <strong>{attempt.points_awarded ?? 0}</strong>.</>
              ) : (
                <>Treino livre: <strong>não vale pontos</strong>.</>
              )}
            </p>
            {attempt.awards_points && (attempt.points_awarded ?? 0) === 0 ? (
              <p className="fsl-note">
                Nenhuma questão pontuou: cada questão vale pontos só na primeira vez que você a acerta.
              </p>
            ) : attempt.awards_points ? (
              <p className="fsl-note">{attempt.scored_questions} {attempt.scored_questions === 1 ? "questão pontuada" : "questões pontuadas"} pela primeira vez.</p>
            ) : null}
            <ul className="fsl-summary-list">
              {items.map((it, i) => {
                const ok = it.answer?.is_correct;
                return (
                  <li key={it.item_id} className={ok ? "is-ok" : "is-bad"}>
                    <span className="fsl-summary-mark">
                      {ok ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <X size={18} strokeWidth={3} aria-hidden="true" />}
                    </span>
                    <span>Questão {i + 1}: {ok ? "correta" : it.answer ? "incorreta" : "não respondida"}</span>
                  </li>
                );
              })}
            </ul>
            <div className="fsl-summary-actions">
              {items.some((i) => i.answer && !i.answer.is_correct) ? (
                <Link to={p("/revisao")} className="fsl-btn fsl-btn-green fsl-btn-block">
                  Revisar meus erros <ArrowRight size={22} aria-hidden="true" />
                </Link>
              ) : null}
              <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={() => void load()}>
                Novo treino
              </button>
              <Link to={p()} className="fsl-link-btn fsl-center">Voltar ao início</Link>
            </div>
          </div>
        </div>
      );
    }

    // todas respondidas, mas a conclusão falhou: botão para tentar de novo
    if (!current) {
      return (
        <div className="fsl-screen">
          {header(modeLabel)}
          <h1 className="fsl-display">Todas respondidas</h1>
          {msg ? <p className="fsl-alert is-error" role="alert">{msg}</p> : null}
          <button type="button" className="fsl-btn fsl-btn-green" onClick={() => void finishNow()} disabled={busy}>
            Concluir treino <Check size={22} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>
      );
    }

    const answer = current.answer;
    const percent = Math.round((answeredCount / total) * 100);
    const lastDone = Boolean(answer) && attempt.status === "completed";
    const nextLabel = lastDone ? "Ver resultado" : "Próxima questão";

    return (
      <div className="fsl-screen">
        {header(modeLabel)}
        <div className="fsl-progress-row">
          <div className="fsl-progress" role="progressbar" aria-label="Progresso do treino" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={percent} aria-valuetext={`${answeredCount} de ${total} respondidas`}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="fsl-progress-pct">{percent}%</span>
        </div>
        <p className="fsl-progress-label">Questão {current.position} de {total}</p>
        {!attempt.awards_points ? (
          <p className="fsl-pill-mint fsl-pill-sm"><FileText size={18} aria-hidden="true" /> Treino livre: não vale pontos</p>
        ) : null}

        <fieldset key={current.item_id} className="fsl-fieldset">
          <legend className="fsl-question">{current.stem}</legend>
          <div className="fsl-options">
            {current.options.map((o) => {
              const chosen = answer ? answer.option_id === o.id : selected === o.id;
              const isRight = Boolean(answer) && o.id === answer?.correct_option_id;
              const isWrong = Boolean(answer) && chosen && o.id !== answer?.correct_option_id;
              return (
                <label key={o.id} className={`fsl-option${chosen ? " is-chosen" : ""}${isRight ? " is-right" : ""}${isWrong ? " is-wrong" : ""}${answer ? " is-locked" : ""}`}>
                  <input type="radio" name={`opcao-${current.item_id}`} value={o.id} checked={chosen} disabled={Boolean(answer) || busy}
                    onChange={() => setSelected(o.id)} />
                  <span className="fsl-option-body">
                    <span className="fsl-option-letter" aria-hidden="true">{o.label}</span>
                    <span className="fsl-option-text">
                      <span className="fsl-sr">Alternativa {o.label}: </span>
                      {o.body}
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

        <div className="fsl-feedback-wrap" role="status" aria-live="polite">
          {answer ? (
            <div className={`fsl-feedback ${answer.is_correct ? "is-ok" : "is-bad"}`}>
              <p className="fsl-feedback-title">{answer.is_correct ? "Resposta correta!" : "Não foi dessa vez."}</p>
              {answer.explanation ? <p>{answer.explanation}</p> : null}
            </div>
          ) : null}
        </div>

        {msg ? <p className="fsl-alert is-error" role="alert">{msg}</p> : null}

        <div className="fsl-q-actions">
          {!answer ? (
            <button type="button" className="fsl-btn fsl-btn-green fsl-btn-grow" onClick={() => void confirm()} disabled={!selected || busy}>
              {busy ? "Enviando…" : "Confirmar resposta"} <ArrowRight size={22} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="fsl-btn fsl-btn-green fsl-btn-grow" onClick={() => setHoldId(null)}>
              {nextLabel} <ArrowRight size={22} aria-hidden="true" />
            </button>
          )}
        </div>

        {attempt.status === "in_progress" ? (
          confirmStop ? (
            <div className="fsl-dialog-confirm" role="alert">
              <p>Encerrar este treino sem concluir? As respostas já dadas ficam no histórico, mas o treino não pontua.</p>
              <div className="fsl-dialog-actions">
                <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => setConfirmStop(false)}>Continuar treino</button>
                <button type="button" className="fsl-btn fsl-btn-navy" onClick={() => void stop()} disabled={busy}>Encerrar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="fsl-link-btn fsl-center" onClick={() => setConfirmStop(true)}>Encerrar sem concluir</button>
          )
        ) : null}
      </div>
    );
  }

  // ───────────── escolha do treino ─────────────
  const pending = progress?.pending_review ?? 0;
  const hasContent = subjects.length > 0;
  const modeOk = mode === "review" ? pending > 0 : hasContent;
  const noAttempts = (progress?.attempts_left_today ?? 1) <= 0;
  const noQuestions = (progress?.questions_left_today ?? 1) <= 0;

  return (
    <div className="fsl-screen">
      {header("Questões")}
      <h1 className="fsl-display fsl-display-xl">Vamos praticar?</h1>
      {msg ? <p className="fsl-alert is-error" role="alert">{msg}</p> : null}

      {!hasContent ? (
        <div className="fsl-empty" role="status">
          <p><strong>Ainda não há questões publicadas neste ambiente.</strong></p>
          <p>Quando o banco de questões for liberado, os assuntos aparecerão aqui. Enquanto isso, você pode ver como o app funciona na demonstração.</p>
          <Link to="/app/demo/questoes" className="fsl-btn fsl-btn-outline">Ver a demonstração <ArrowRight size={22} aria-hidden="true" /></Link>
        </div>
      ) : null}

      <form className="fsl-setup" onSubmit={(e) => { e.preventDefault(); void start(); }}>
        <fieldset className="fsl-fieldset">
          <legend className="fsl-label">Tipo de treino</legend>
          <div className="fsl-radio-cards">
            {([
              ["practice", "Treino pontuado", "Vale pontos na primeira vez que você acerta cada questão.", hasContent],
              ["free", "Treino livre", "Repita à vontade. Não vale pontos.", hasContent],
              ["review", "Revisão dos erros", pending > 0 ? `${pending} ${pending === 1 ? "questão" : "questões"} para revisar.` : "Nenhum erro para revisar por enquanto.", pending > 0],
            ] as [AttemptMode, string, string, boolean][]).map(([id, title, text, enabled]) => (
              <label key={id} className={`fsl-radio-card${mode === id ? " is-chosen" : ""}${enabled ? "" : " is-disabled"}`}>
                <input type="radio" name="tipo" value={id} checked={mode === id} disabled={!enabled} onChange={() => setMode(id)} />
                <span><strong>{title}</strong><span>{text}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode !== "review" && hasContent ? (
          <div className="fsl-field">
            <label htmlFor="assunto" className="fsl-label">Assunto</label>
            <select id="assunto" className="fsl-input" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name} ({s.question_count})</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="fsl-field">
          <label htmlFor="qtd" className="fsl-label">Quantidade de questões</label>
          <select id="qtd" className="fsl-input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNTS.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>

        {progress ? (
          <p className="fsl-note">
            Hoje você ainda pode fazer {progress.attempts_left_today} treino(s) novo(s) e {progress.questions_left_today} questões.
          </p>
        ) : null}
        {noAttempts || noQuestions ? (
          <p className="fsl-alert is-error" role="alert">
            {noQuestions ? "Você atingiu o limite de questões de hoje." : "Você atingiu o limite de treinos de hoje."} Volte amanhã.
          </p>
        ) : null}

        <button type="submit" className="fsl-btn fsl-btn-green fsl-btn-block" disabled={busy || !modeOk || noAttempts || noQuestions}>
          {busy ? "Preparando…" : "Começar treino"} <ArrowRight size={22} aria-hidden="true" />
        </button>
      </form>

      <p className="fsl-demo-note">
        <Info size={16} aria-hidden="true" /> Os pontos são calculados pelo servidor. Treino livre não pontua.
      </p>
    </div>
  );
}
