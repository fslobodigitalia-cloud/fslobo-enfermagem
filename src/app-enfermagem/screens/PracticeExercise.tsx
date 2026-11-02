import * as React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useP } from "../base";
import { ArrowLeft, ArrowRight, ChevronDown, FileText, Info, RotateCcw } from "lucide-react";
import { AlertCircle } from "../components/icons";
import { exerciseById, GUIDES, NOT_REAL_DATA } from "../data/practice";
import { MAX_TEXT, useExerciseProgress, usePracticeData, usePracticeStore } from "../practiceStore";
import { usePracticeSync } from "../practiceSyncContext";
import PracticeSyncPanel from "../components/PracticeSyncPanel";
import { LocalNote, PracticeTopbar, Rich, SourcesList } from "../components/PracticeParts";

const smooth = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/**
 * Exercício da Prática: caso resumido (detalhes recolhidos), roteiro curto junto do campo, "Ver exemplo" conciso,
 * "Entenda este exemplo" recolhido (comentários e referências) e 3 perguntas de autoavaliação. Sem nota e sem correção
 * automática. (A correção por IA foi pausada: nenhuma chamada de IA parte desta tela.)
 */
export default function PracticeExercise({ avatarInitial }: { avatarInitial?: string }) {
  const { id } = useParams();
  const p = useP();
  const ex = exerciseById(id);
  if (!ex) return <Navigate to={p("/pratica")} replace />;
  return <ExerciseBody key={ex.id} exId={ex.id} avatarInitial={avatarInitial} />;
}

function ExerciseBody({ exId, avatarInitial }: { exId: string; avatarInitial?: string }) {
  const p = useP();
  const ex = exerciseById(exId)!;
  const guide = GUIDES[ex.mode];
  const store = usePracticeStore();
  const sync = usePracticeSync(); // nulo na demonstração: tudo só neste navegador
  const pr = useExerciseProgress(exId);
  const { storageOk } = usePracticeData();
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [showExample, setShowExample] = React.useState(pr.compared);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const exampleHeadRef = React.useRef<HTMLHeadingElement>(null);
  const revisionRef = React.useRef<HTMLTextAreaElement>(null);

  const checked = ex.checklist.filter((_, i) => pr.checks[i]).length;
  const missing = ex.checklist.filter((_, i) => !pr.checks[i]);
  const revising = pr.revision !== null;

  const openExample = () => {
    setShowExample(true);
    store.patch(exId, { compared: true });
    requestAnimationFrame(() => {
      exampleHeadRef.current?.focus({ preventScroll: true });
      exampleHeadRef.current?.scrollIntoView({ block: "start", behavior: smooth() });
    });
  };

  const startRevision = () => {
    // Começa a revisão com a primeira versão, para a pessoa editar em vez de reescrever do zero.
    if (pr.revision === null) store.patch(exId, { revision: pr.draft });
    requestAnimationFrame(() => {
      revisionRef.current?.focus({ preventScroll: true });
      revisionRef.current?.scrollIntoView({ block: "center", behavior: smooth() });
    });
  };

  const toggle = (i: number) =>
    store.patch(exId, (s) => ({ checks: ex.checklist.map((_, idx) => (idx === i ? !s.checks[idx] : !!s.checks[idx])) }));

  return (
    <div className="fsl-screen">
      <PracticeTopbar avatarInitial={avatarInitial} />

      <div className="fsl-title-row">
        <Link to={p("/pratica")} className="fsl-icon-btn fsl-back" aria-label="Voltar à lista de exercícios">
          <ArrowLeft size={30} aria-hidden="true" />
        </Link>
        <div>
          <p className="fsl-px-kicker">{ex.mode === "anotacao" ? "Treinar anotação" : "Treinar evolução"} · simulação educativa</p>
          <h1 className="fsl-display fsl-display-l fsl-px-h1">{ex.title}</h1>
          <p className="fsl-subtitle">{ex.setting}</p>
        </div>
      </div>

      <p className="fsl-modebar is-demo fsl-px-banner" role="note">
        <Info size={18} aria-hidden="true" />
        <span>Simulação educativa. Conteúdo demonstrativo e fictício, sujeito à revisão editorial.</span>
      </p>

      <div className="fsl-px-grid">
        <div className="fsl-px-left">
          <section className="fsl-case" aria-labelledby="caso-titulo">
            <span className="fsl-case-icon"><FileText size={30} aria-hidden="true" /></span>
            <div className="fsl-case-body">
              <h2 id="caso-titulo" className="fsl-case-title">1. O caso</h2>
              <p><Rich text={ex.glance} /></p>
              <p className="fsl-px-task"><strong>Sua tarefa:</strong> <Rich text={ex.task} /></p>
              <button
                type="button"
                className="fsl-link-strong"
                aria-expanded={detailsOpen}
                aria-controls="caso-completo"
                onClick={() => setDetailsOpen((o) => !o)}
              >
                {detailsOpen ? "Recolher os detalhes" : "Ver os detalhes do caso"}{" "}
                <ChevronDown size={20} aria-hidden="true" className={detailsOpen ? "fsl-rot-up" : ""} />
              </button>
              {detailsOpen ? (
                <div id="caso-completo" className="fsl-case-full">
                  {ex.facts.map((f, i) => (
                    <p key={i}><Rich text={f} /></p>
                  ))}
                  {ex.table ? (
                    <div className="fsl-px-table-wrap">
                      <table className="fsl-px-table">
                        <caption>{ex.table.caption}</caption>
                        <thead>
                          <tr>
                            {ex.table.head.map((h, i) => (
                              <th key={i} scope="col">{h || <span className="fsl-sr">Dado</span>}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ex.table.rows.map((r) => (
                            <tr key={r.label}>
                              <th scope="row">{r.label}</th>
                              {r.cells.map((c, i) => (
                                <td key={i} data-label={ex.table!.head[i + 1]}>{c}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {ex.after?.map((f, i) => (
                    <p key={`a${i}`}><Rich text={f} /></p>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="fsl-px-right">
          <section className="fsl-card fsl-editor" aria-labelledby="registro-titulo">
            <h2 id="registro-titulo" className="fsl-h3">2. Escreva o seu registro</h2>

            <aside className="fsl-px-guide" aria-labelledby="roteiro-titulo">
              <h3 id="roteiro-titulo" className="fsl-px-guide-title">{guide.title}</h3>
              <ol>
                {guide.steps.map((s) => (
                  <li key={s.label}>
                    <strong>{s.label}</strong>
                    <span><Rich text={s.hint} /></span>
                  </li>
                ))}
              </ol>
              <p className="fsl-note"><Rich text={guide.note} /></p>
            </aside>

            <label htmlFor="campo-registro" className="fsl-sr">Escreva o seu registro de {ex.mode === "anotacao" ? "anotação" : "evolução"} de enfermagem</label>
            <textarea
              id="campo-registro"
              className="fsl-textarea"
              rows={9}
              maxLength={MAX_TEXT}
              value={pr.draft}
              placeholder={ex.placeholder}
              onChange={(e) => store.patch(exId, { draft: e.target.value })}
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck
            />
            <div className="fsl-editor-foot">
              <p className="fsl-editor-hint">
                <AlertCircle size={22} aria-hidden="true" /> Use somente as informações do caso.
              </p>
              <span className="fsl-count" aria-hidden="true">{pr.draft.length}/{MAX_TEXT}</span>
            </div>
            <p className="fsl-note">{NOT_REAL_DATA}</p>
          </section>

          {/* só na conta: salvar, estados, conflito entre aparelhos e rascunho antigo (na demonstração o contexto é nulo) */}
          <PracticeSyncPanel exId={exId} />

          {!showExample ? (
            <>
              <button type="button" className="fsl-btn fsl-btn-teal fsl-btn-block" onClick={openExample}>
                Ver exemplo <ArrowRight size={22} aria-hidden="true" />
              </button>
              <p className="fsl-q-hint fsl-center">Seu texto fica salvo enquanto você escreve. Tente escrever antes de ver o exemplo.</p>
            </>
          ) : (
            <section className="fsl-compare" aria-labelledby="exemplo-titulo">
              <h2 id="exemplo-titulo" ref={exampleHeadRef} tabIndex={-1} className="fsl-h3">3. Exemplo de redação</h2>
              <p className="fsl-note">{ex.modelIntro}</p>

              <article className="fsl-compare-box is-model">
                <h3>Uma possibilidade</h3>
                <div className="fsl-pre fsl-model-concise">
                  {ex.model.map((m, i) => (
                    <React.Fragment key={i}>
                      <Rich text={m.text} />
                      {i < ex.model.length - 1 ? "\n" : null}
                    </React.Fragment>
                  ))}
                </div>
              </article>

              <details className="fsl-px-more">
                <summary>Entenda este exemplo</summary>
                <div className="fsl-px-more-body">
                  <ol className="fsl-model">
                    {ex.model.map((m, i) => (
                      <li key={i}>
                        <p className="fsl-pre fsl-model-text"><Rich text={m.text} /></p>
                        <p className="fsl-model-comment"><strong>Por que assim:</strong> <Rich text={m.comment} /></p>
                      </li>
                    ))}
                  </ol>
                  <h3 className="fsl-px-refs-title">Referências</h3>
                  <p className="fsl-note">
                    Os casos e os exemplos são fictícios e demonstrativos, sujeitos à revisão editorial. Foram redigidos para
                    esta simulação a partir das regras destas fontes; não são texto oficial.
                  </p>
                  <SourcesList />
                </div>
              </details>

              <p className="fsl-demo-note">
                <Info size={16} aria-hidden="true" />
                <span>
                  O app não avalia o seu texto: não há nota nem correção automática. Escrever diferente do exemplo não
                  significa errar, e escrever parecido não prova que está certo. A conferência é sua.
                </span>
              </p>

              <fieldset className="fsl-checklist">
                <legend>4. Autoavaliação ({checked} de {ex.checklist.length})</legend>
                <p className="fsl-note">Marque o que o seu texto já faz. O que ficar sem marcar é um ponto para rever. Não há nota.</p>
                {ex.checklist.map((item, i) => (
                  <label key={item} className="fsl-check">
                    <input type="checkbox" checked={!!pr.checks[i]} onChange={() => toggle(i)} />
                    <span>{item}</span>
                  </label>
                ))}
              </fieldset>

              {!revising ? (
                <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={startRevision}>
                  Revisar o meu texto <ArrowRight size={22} aria-hidden="true" />
                </button>
              ) : null}

              <button type="button" className="fsl-link-strong" onClick={() => setShowExample(false)}>
                Ocultar o exemplo
              </button>
            </section>
          )}

          {revising ? (
            <section className="fsl-card fsl-editor" aria-labelledby="revisao-titulo">
              <h2 id="revisao-titulo" className="fsl-h3">5. Revise o seu texto</h2>
              {missing.length > 0 && pr.checks.some(Boolean) ? (
                <div className="fsl-px-missing">
                  <p><strong>Perguntas que você deixou sem marcar:</strong></p>
                  <ul>
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="fsl-note">Releia o exemplo e as perguntas da autoavaliação e melhore o que quiser. Mantenha só informações do caso.</p>
              )}
              <label htmlFor="campo-revisao" className="fsl-sr">Versão revisada do seu registro</label>
              <textarea
                id="campo-revisao"
                ref={revisionRef}
                className="fsl-textarea"
                rows={9}
                maxLength={MAX_TEXT}
                value={pr.revision ?? ""}
                onChange={(e) => store.patch(exId, { revision: e.target.value })}
                autoComplete="off"
                spellCheck
              />
              <div className="fsl-editor-foot">
                <p className="fsl-note">A sua primeira versão continua salva acima.</p>
                <span className="fsl-count" aria-hidden="true">{(pr.revision ?? "").length}/{MAX_TEXT}</span>
              </div>
              <div className="fsl-compare-actions">
                <Link to={p("/pratica")} className="fsl-btn fsl-btn-navy">Concluir e voltar aos exercícios</Link>
              </div>
              <p className="fsl-note">Concluir não gera pontos nem conquistas: é só a sua prática.</p>
            </section>
          ) : null}

          <section className="fsl-px-local-ex" aria-label="Seus textos deste exercício">
            {sync ? <PracticeSyncPanel exId={exId} compact /> : <LocalNote storageOk={storageOk} />}
            {confirmClear ? (
              <div className="fsl-px-confirm" role="alert">
                <p>
                  {sync
                    ? "Apagar o texto, a autoavaliação e a revisão deste exercício, na sua conta e neste navegador? Isto não pode ser desfeito."
                    : "Apagar o texto, a autoavaliação e a revisão deste exercício?"}
                </p>
                <div className="fsl-compare-actions">
                  <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => setConfirmClear(false)}>Cancelar</button>
                  <button
                    type="button"
                    className="fsl-btn fsl-btn-navy"
                    onClick={async () => {
                      // na conta: apaga primeiro no servidor; se falhar, o texto continua aqui e dá para tentar de novo
                      const done = sync ? await sync.remove(exId) : (store.clearExercise(exId), true);
                      setConfirmClear(false);
                      if (!done) return;
                      setShowExample(false);
                      setDetailsOpen(false);
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    Sim, apagar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="fsl-btn fsl-btn-outline"
                disabled={!pr.draft && !pr.compared && pr.revision === null && !pr.checks.some(Boolean) && pr.aiRounds.length === 0 && !((pr.sync?.rev ?? 0) > 0)}
                onClick={() => setConfirmClear(true)}
              >
                <RotateCcw size={20} aria-hidden="true" /> Apagar este exercício
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
