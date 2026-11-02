import * as React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useP } from "../base";
import { ArrowLeft, ArrowRight, BookOpen, Info } from "lucide-react";
import { BarChart3, FilePenLine } from "../components/icons";
import { Illustration } from "../components/Illustration";
import { LocalNote, PracticeTopbar, SourcesBlock } from "../components/PracticeParts";
import { EXERCISES, MODALITIES, NOT_REAL_DATA } from "../data/practice";
import { hasAnyPracticeText, isDirty, usePracticeData, usePracticeStore, type ExerciseProgress } from "../practiceStore";
import { usePracticeSync } from "../practiceSyncContext";
import PracticeExercise from "./PracticeExercise";
import LibraryScreen from "./LibraryScreen";
import LibraryModelScreen from "./LibraryModelScreen";

function statusOf(pr: ExerciseProgress | undefined, account: boolean): string {
  if (!pr) return "Não iniciado";
  if (account && pr.sync?.conflict) return "Conflito entre aparelhos: precisa de sua escolha";
  if (account && isDirty(pr)) return "Alterações não salvas na conta";
  if (account && pr.sync && pr.sync.rev > 0) return "Salvo na sua conta";
  if (pr.revision !== null) return "Revisão em andamento";
  if (pr.compared) return "Exemplo visto";
  if (pr.draft.trim()) return "Rascunho salvo neste navegador";
  return "Não iniciado";
}

function PracticeHome({ avatarInitial }: { avatarInitial?: string }) {
  const p = useP();
  const { data, storageOk } = usePracticeData();
  const store = usePracticeStore();
  const sync = usePracticeSync(); // nulo na demonstração
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [clearFailed, setClearFailed] = React.useState(false);
  const any = hasAnyPracticeText(data) || Object.values(data.items).some((p) => (p.sync?.rev ?? 0) > 0);

  return (
    <div className="fsl-screen">
      <PracticeTopbar avatarInitial={avatarInitial} />

      <div className="fsl-title-row">
        <Link to={p()} className="fsl-icon-btn fsl-back" aria-label="Voltar ao início">
          <ArrowLeft size={30} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="fsl-display fsl-display-l">Pratique seu registro.</h1>
          <p className="fsl-subtitle">Casos fictícios. Seu raciocínio em prática.</p>
        </div>
      </div>

      <div className="fsl-phero">
        <Illustration name="pratica" priority sizes="(min-width: 1024px) 520px, calc(100vw - 48px)" className="fsl-phero-img" />
        <span className="fsl-sticker">Simulação educativa</span>
      </div>

      <section className="fsl-card fsl-px-intro" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="fsl-h3">Como funciona</h2>
        <ol className="fsl-px-flow">
          <li>Escolha um exercício e leia o caso resumido.</li>
          <li>Escreva o seu registro, com a ajuda de um roteiro curto.</li>
          <li>Veja um exemplo e responda a 3 perguntas de autoavaliação.</li>
          <li>Se quiser, revise o seu texto.</li>
        </ol>
        <p className="fsl-note">
          Simulação educativa com conteúdo demonstrativo, sujeito à revisão editorial. O app não corrige nem avalia o seu
          texto: a conferência é sua. Esta atividade não vale pontos e não muda o ranking.
        </p>
        <p className="fsl-note"><strong>{NOT_REAL_DATA}</strong></p>
      </section>

      <Link to={p("/pratica/modelos")} className="fsl-card fsl-lib-entry">
        <span className="fsl-px-mod-icon"><BookOpen size={28} aria-hidden="true" /></span>
        <span className="fsl-lib-entry-body">
          <strong>Modelos de registros</strong>
          <span className="fsl-note">Biblioteca pesquisável de exemplos para consultar e adaptar. Conteúdo demonstrativo.</span>
        </span>
        <ArrowRight size={24} aria-hidden="true" />
      </Link>

      {MODALITIES.map((m) => {
        const list = EXERCISES.filter((e) => e.mode === m.mode);
        const Icon = m.mode === "anotacao" ? FilePenLine : BarChart3;
        return (
          <section key={m.mode} className="fsl-card fsl-px-mod" aria-labelledby={`mod-${m.mode}`}>
            <h2 id={`mod-${m.mode}`} className="fsl-px-mod-title">
              <span className="fsl-px-mod-icon"><Icon size={28} aria-hidden="true" /></span>
              {m.title}
            </h2>
            <p>{m.purpose}</p>
            <p className="fsl-note">{m.who}</p>
            <p className="fsl-note">{m.limits}</p>
            <ul className="fsl-px-list" aria-label={`Exercícios de ${m.title.toLowerCase()}`}>
              {list.map((e) => (
                <li key={e.id}>
                  <Link to={p(`/pratica/${e.id}`)} className="fsl-px-ex">
                    <span className="fsl-px-ex-body">
                      <strong>{e.title}</strong>
                      <span className="fsl-note">{e.setting}</span>
                      <span className="fsl-px-status">{statusOf(data.items[e.id], !!sync)}</span>
                    </span>
                    <ArrowRight size={24} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="fsl-card fsl-px-local" aria-labelledby="local-titulo">
        <h2 id="local-titulo" className="fsl-h3">{sync ? "Seus textos da Prática" : "Seus textos neste navegador"}</h2>
        {sync ? (
          <p className="fsl-demo-note">
            <Info size={16} aria-hidden="true" />
            <span>
              O texto fica guardado neste navegador (cópia para não perder) e vai para a sua conta quando você toca em “Salvar na minha conta”, dentro de cada exercício.
              Só a sua conta acessa. Não vale pontos nem ranking.
            </span>
          </p>
        ) : (
          <LocalNote storageOk={storageOk} />
        )}
        {confirmClear ? (
          <div className="fsl-px-confirm" role="alert">
            <p>
              {sync
                ? "Apagar todos os textos, autoavaliações e revisões da Prática, na sua conta e neste navegador? Isto não pode ser desfeito."
                : "Apagar todos os textos, conferências e revisões da Prática salvos neste navegador?"}
            </p>
            {clearFailed ? <p className="fsl-alert is-error" role="alert">Não foi possível apagar tudo agora. O que não foi apagado continua salvo; tente de novo.</p> : null}
            <div className="fsl-compare-actions">
              <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => setConfirmClear(false)}>Cancelar</button>
              <button
                type="button"
                className="fsl-btn fsl-btn-navy"
                onClick={async () => {
                  const done = sync ? await sync.removeAll() : (store.clearAll(), true);
                  setClearFailed(!done);
                  if (done) setConfirmClear(false);
                }}
              >
                Sim, apagar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="fsl-btn fsl-btn-outline" disabled={!any} onClick={() => setConfirmClear(true)}>
            {sync ? "Apagar meu progresso da Prática" : "Apagar meus textos da Prática"}
          </button>
        )}
      </section>

      <SourcesBlock />
    </div>
  );
}

/** Rotas da aba Prática: lista (/pratica) e exercício (/pratica/:id). Servem à demonstração e à conta. */
export default function PracticeRoutes({ avatarInitial }: { avatarInitial?: string }) {
  const p = useP();
  return (
    <Routes>
      <Route index element={<PracticeHome avatarInitial={avatarInitial} />} />
      {/* a biblioteca vem ANTES de :id (senão "modelos" seria lido como id de exercício) */}
      <Route path="modelos" element={<LibraryScreen avatarInitial={avatarInitial} />} />
      <Route path="modelos/:slug" element={<LibraryModelScreen avatarInitial={avatarInitial} />} />
      <Route path=":id" element={<PracticeExercise avatarInitial={avatarInitial} />} />
      <Route path="*" element={<Navigate to={p("/pratica")} replace />} />
    </Routes>
  );
}
