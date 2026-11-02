import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, Search, SearchX, X } from "lucide-react";
import { useP } from "../base";
import { PracticeTopbar } from "../components/PracticeParts";
import { useLibrary } from "../library/source";
import { searchModels } from "../library/search";
import { KIND_LABEL, type RecordKind } from "../library/types";

const KINDS: { id: RecordKind | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "anotacao", label: "Anotação" },
  { id: "evolucao", label: "Evolução" },
];

/**
 * Biblioteca "Modelos de registros": busca por palavras-chave (sem diferenciar maiúsculas e acentos), sinônimos cadastrados e filtros por
 * tipo e categoria. O estado da busca fica na URL (compartilhável; o botão Voltar do navegador funciona). Nada é enviado a servidor.
 */
export default function LibraryScreen({ avatarInitial }: { avatarInitial?: string }) {
  const p = useP();
  const { status, library } = useLibrary();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const kindParam = params.get("tipo");
  const kind: RecordKind | "todos" = kindParam === "anotacao" || kindParam === "evolucao" ? kindParam : "todos";
  const catParam = params.get("categoria") ?? "";
  const category = library?.categories.some((c) => c.id === catParam) ? catParam : "todas";

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  const filtered = q.trim() !== "" || kind !== "todos" || category !== "todas";

  const result = library ? searchModels(library, { q, kind, category }) : null;
  const total = library?.models.length ?? 0;
  const catLabel = (id: string) => library?.categories.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="fsl-screen">
      <PracticeTopbar avatarInitial={avatarInitial} />

      <div className="fsl-title-row">
        <Link to={p("/pratica")} className="fsl-icon-btn fsl-back" aria-label="Voltar à Prática">
          <ArrowLeft size={30} aria-hidden="true" />
        </Link>
        <div>
          <p className="fsl-px-kicker">Prática · biblioteca</p>
          <h1 className="fsl-display fsl-display-l fsl-px-h1">Modelos de registros</h1>
          <p className="fsl-subtitle">Exemplos para consultar e adaptar.</p>
        </div>
      </div>

      <p className="fsl-modebar is-demo fsl-px-banner" role="note">
        <Info size={18} aria-hidden="true" />
        <span>
          Conteúdo demonstrativo: os {total || 3} modelos desta tela são exemplos fictícios dos exercícios da Prática, sujeitos à revisão editorial. O acervo
          real será carregado depois.
        </span>
      </p>

      <section className="fsl-card fsl-lib-filters" aria-label="Buscar e filtrar modelos">
        <div role="search" className="fsl-field">
          <label htmlFor="lib-q" className="fsl-label">Buscar</label>
          <div className="fsl-lib-searchbox">
            <Search size={20} aria-hidden="true" />
            <input
              id="lib-q"
              type="search"
              className="fsl-input"
              value={q}
              placeholder="Ex.: falta de ar"
              onChange={(e) => update({ q: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
            />
            {q ? (
              <button type="button" className="fsl-lib-clear" aria-label="Limpar a busca" onClick={() => update({ q: null })}>
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <fieldset className="fsl-lib-kinds">
          <legend className="fsl-label">Tipo de registro</legend>
          <div className="fsl-lib-chips">
            {KINDS.map((k) => (
              <label key={k.id} className={`fsl-lib-chip${kind === k.id ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="lib-tipo"
                  value={k.id}
                  checked={kind === k.id}
                  onChange={() => update({ tipo: k.id === "todos" ? null : k.id })}
                />
                <span>{k.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="fsl-field">
          <label htmlFor="lib-cat" className="fsl-label">Categoria</label>
          <select id="lib-cat" className="fsl-input" value={category} onChange={(e) => update({ categoria: e.target.value === "todas" ? null : e.target.value })}>
            <option value="todas">Todas as categorias</option>
            {library?.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        {filtered ? (
          <button type="button" className="fsl-btn fsl-btn-outline" onClick={clearAll}>Limpar busca e filtros</button>
        ) : null}
      </section>

      {status === "loading" ? <p className="fsl-loading" role="status">Carregando os modelos…</p> : null}
      {status === "error" ? (
        <p className="fsl-alert is-error" role="alert">Não foi possível carregar os modelos agora. Tente de novo em instantes.</p>
      ) : null}

      {result ? (
        <>
          <p className="fsl-lib-count" role="status" aria-live="polite">
            {result.hits.length === 0
              ? "Nenhum modelo encontrado."
              : filtered
                ? `${result.hits.length} de ${total} modelos encontrados.`
                : `${total} modelos (demonstrativos).`}
          </p>
          {result.alsoSearched.length > 0 && result.hits.length > 0 ? (
            <p className="fsl-note">Também procuramos por: {result.alsoSearched.join(", ")}.</p>
          ) : null}

          {result.hits.length > 0 ? (
            <ul className="fsl-lib-results" aria-label="Modelos encontrados">
              {result.hits.map(({ model: m }) => (
                <li key={m.slug}>
                  <Link to={p(`/pratica/modelos/${m.slug}`)} className="fsl-lib-card">
                    <span className="fsl-lib-badges">
                      <span className={`fsl-lib-badge is-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
                      <span className="fsl-lib-badge">{catLabel(m.category)}</span>
                      {m.demo ? <span className="fsl-lib-badge is-demo">Demonstrativo</span> : null}
                    </span>
                    <strong className="fsl-lib-title">{m.title}</strong>
                    <span className="fsl-lib-summary">{m.summary}</span>
                    <span className="fsl-lib-open">Abrir modelo <ArrowRight size={18} aria-hidden="true" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <section className="fsl-card fsl-lib-empty" aria-labelledby="lib-vazio">
              <SearchX size={36} aria-hidden="true" />
              <h2 id="lib-vazio" className="fsl-h3">Nenhum modelo encontrado</h2>
              <p>
                {q.trim() ? (
                  <>Não achamos modelos para “<strong>{q.trim()}</strong>”{kind !== "todos" || category !== "todas" ? " com os filtros escolhidos" : ""}.</>
                ) : (
                  <>Não há modelos com os filtros escolhidos.</>
                )}
              </p>
              <ul className="fsl-lib-tips">
                <li>Confira a escrita ou tente uma palavra mais curta (por exemplo, “curativo”).</li>
                <li>Tente um sinônimo: “falta de ar” e “dispneia” encontram os mesmos modelos.</li>
                <li>Tire os filtros de tipo ou de categoria.</li>
              </ul>
              <button type="button" className="fsl-btn fsl-btn-navy" onClick={clearAll}>Limpar busca e filtros</button>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
