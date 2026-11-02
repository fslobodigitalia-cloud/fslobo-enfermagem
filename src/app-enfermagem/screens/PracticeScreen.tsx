import * as React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useP } from "../base";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BarChart3, FilePenLine } from "../components/icons";
import { Illustration } from "../components/Illustration";
import { LocalNote, PracticeTopbar, SourcesBlock } from "../components/PracticeParts";
import { EXERCISES, MODALITIES, NOT_REAL_DATA } from "../data/practice";
import { clearAllPractice, hasAnyPracticeText, usePracticeData, type ExerciseProgress } from "../practiceStore";
import PracticeExercise from "./PracticeExercise";

function statusOf(pr: ExerciseProgress | undefined): string {
  if (!pr) return "Não iniciado";
  if (pr.revision !== null) return "Revisão em andamento";
  if (pr.compared) return "Exemplo visto";
  if (pr.draft.trim()) return "Rascunho salvo neste navegador";
  return "Não iniciado";
}

function PracticeHome({ avatarInitial }: { avatarInitial?: string }) {
  const p = useP();
  const { data, storageOk } = usePracticeData();
  const [confirmClear, setConfirmClear] = React.useState(false);
  const any = hasAnyPracticeText(data);

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
                      <span className="fsl-px-status">{statusOf(data.items[e.id])}</span>
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
        <h2 id="local-titulo" className="fsl-h3">Seus textos neste navegador</h2>
        <LocalNote storageOk={storageOk} />
        {confirmClear ? (
          <div className="fsl-px-confirm" role="alert">
            <p>Apagar todos os textos, conferências e revisões da Prática salvos neste navegador?</p>
            <div className="fsl-compare-actions">
              <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => setConfirmClear(false)}>Cancelar</button>
              <button
                type="button"
                className="fsl-btn fsl-btn-navy"
                onClick={() => {
                  clearAllPractice();
                  setConfirmClear(false);
                }}
              >
                Sim, apagar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="fsl-btn fsl-btn-outline" disabled={!any} onClick={() => setConfirmClear(true)}>
            Apagar meus textos da Prática
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
      <Route path=":id" element={<PracticeExercise avatarInitial={avatarInitial} />} />
      <Route path="*" element={<Navigate to={p("/pratica")} replace />} />
    </Routes>
  );
}
