import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { useP } from "../base";
import { PracticeTopbar, Rich } from "../components/PracticeParts";
import { useLibrary } from "../library/source";
import { KIND_LABEL } from "../library/types";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Página de um modelo: contexto de uso, exemplo (negrito seletivo), o que precisa ser adaptado, orientações curtas, fonte e data de revisão.
 * Não há formulário de paciente nem preenchimento automático: o exemplo é só leitura.
 */
export default function LibraryModelScreen({ avatarInitial }: { avatarInitial?: string }) {
  const p = useP();
  const { slug } = useParams();
  const { status, library } = useLibrary();
  const model = library?.models.find((m) => m.slug === slug) ?? null;
  const category = library?.categories.find((c) => c.id === model?.category)?.label ?? "";

  return (
    <div className="fsl-screen">
      <PracticeTopbar avatarInitial={avatarInitial} />

      <div className="fsl-title-row">
        <Link to={p("/pratica/modelos")} className="fsl-icon-btn fsl-back" aria-label="Voltar à lista de modelos">
          <ArrowLeft size={30} aria-hidden="true" />
        </Link>
        <div>
          <p className="fsl-px-kicker">Modelos de registros</p>
          <h1 className="fsl-display fsl-display-l fsl-px-h1">{model ? model.title : "Modelo não encontrado"}</h1>
          {model ? (
            <p className="fsl-lib-badges">
              <span className={`fsl-lib-badge is-${model.kind}`}>{KIND_LABEL[model.kind]}</span>
              <span className="fsl-lib-badge">{category}</span>
              {model.demo ? <span className="fsl-lib-badge is-demo">Demonstrativo</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      {status === "loading" ? <p className="fsl-loading" role="status">Carregando o modelo…</p> : null}

      {status === "ready" && !model ? (
        <section className="fsl-card fsl-lib-empty">
          <h2 className="fsl-h3">Não encontramos este modelo</h2>
          <p>O endereço pode estar incorreto ou o modelo não está mais disponível.</p>
          <Link to={p("/pratica/modelos")} className="fsl-btn fsl-btn-navy">Ver todos os modelos</Link>
        </section>
      ) : null}

      {model ? (
        <>
          {model.demo ? (
            <p className="fsl-modebar is-demo fsl-px-banner" role="note">
              <Info size={18} aria-hidden="true" />
              <span>Modelo demonstrativo: exemplo fictício, sujeito à revisão editorial. Não use dados de pessoas reais.</span>
            </p>
          ) : null}

          <section className="fsl-card fsl-lib-section" aria-labelledby="m-contexto">
            <h2 id="m-contexto" className="fsl-h3">Contexto de uso</h2>
            {model.context.map((c, i) => (
              <p key={i}>{c}</p>
            ))}
          </section>

          <section className="fsl-card fsl-lib-section" aria-labelledby="m-exemplo">
            <h2 id="m-exemplo" className="fsl-h3">Exemplo</h2>
            <p className="fsl-note">{model.exampleNote}</p>
            <article className="fsl-compare-box is-model">
              <div className="fsl-pre fsl-model-concise">
                {model.example.map((line, i) => (
                  <React.Fragment key={i}>
                    <Rich text={line} />
                    {i < model.example.length - 1 ? "\n" : null}
                  </React.Fragment>
                ))}
              </div>
            </article>
          </section>

          <section className="fsl-card fsl-lib-section" aria-labelledby="m-adaptar">
            <h2 id="m-adaptar" className="fsl-h3">O que precisa ser adaptado</h2>
            <p className="fsl-note">Troque pelos dados da sua situação real. Não copie valores, horários nem cuidados do exemplo.</p>
            <ul className="fsl-lib-list">
              {model.adapt.map((a, i) => (
                <li key={i}><Rich text={a} /></li>
              ))}
            </ul>
          </section>

          <section className="fsl-card fsl-lib-section" aria-labelledby="m-orientacoes">
            <h2 id="m-orientacoes" className="fsl-h3">Orientações curtas</h2>
            <ul className="fsl-lib-list">
              {model.guidance.map((g, i) => (
                <li key={i}><Rich text={g} /></li>
              ))}
            </ul>
          </section>

          <section className="fsl-card fsl-lib-section" aria-labelledby="m-fonte">
            <h2 id="m-fonte" className="fsl-h3">Fonte e revisão</h2>
            <ul className="fsl-source-list">
              {model.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="fsl-inline-link">{s.title}</a>
                  <span className="fsl-note">{s.detail}</span>
                  <span className="fsl-note">Fonte conferida em {fmtDate(s.checked)}.</span>
                </li>
              ))}
            </ul>
            <p className="fsl-lib-review">
              <strong>Revisão editorial:</strong>{" "}
              {model.reviewedAt ? `revisado em ${fmtDate(model.reviewedAt)}.` : "ainda não revisado (conteúdo demonstrativo)."}
            </p>
          </section>

          {model.exerciseId ? (
            <Link to={p(`/pratica/${model.exerciseId}`)} className="fsl-btn fsl-btn-teal fsl-btn-block">
              Praticar com um caso parecido <ArrowRight size={22} aria-hidden="true" />
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
