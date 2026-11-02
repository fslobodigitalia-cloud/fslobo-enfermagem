import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { useP } from "../base";
import { Avatar, Brand } from "./Brand";
import { SOURCES } from "../data/practice";

/**
 * Texto fixo com negrito seletivo. Os trechos entre ** ** viram <strong> (elementos React; nenhum HTML é inserido).
 * SÓ para o conteúdo fixo do app: o texto digitado pela pessoa nunca passa por aqui.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

export function PracticeTopbar({ avatarInitial }: { avatarInitial?: string }) {
  const p = useP();
  return (
    <header className="fsl-topbar">
      <Brand />
      <Link to={p("/perfil")} className="fsl-avatar-link" aria-label="Abrir meu perfil">
        <Avatar size={56} initial={avatarInitial} />
      </Link>
    </header>
  );
}

/** Aviso fixo sobre onde ficam os textos. Aparece na lista e em cada exercício. */
export function LocalNote({ storageOk }: { storageOk: boolean }) {
  return (
    <p className="fsl-demo-note">
      <Info size={16} aria-hidden="true" />
      <span>
        {storageOk
          ? "O rascunho fica salvo só neste navegador, neste aparelho: não vai para a sua conta nem para um servidor, e quem usar este navegador pode vê-lo. Você pode apagá-lo quando quiser."
          : "Este navegador não permite salvar: o que você escrever fica só enquanto esta página estiver aberta. Nada é enviado a um servidor."}
      </span>
    </p>
  );
}

/** Lista de referências (usada na página inicial e, recolhida, dentro de "Entenda este exemplo"). */
export function SourcesList() {
  return (
    <ul className="fsl-source-list">
      {SOURCES.map((s) => (
        <li key={s.id}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="fsl-inline-link">{s.title}</a>
          <span className="fsl-note">{s.detail}</span>
          <span className="fsl-note">Conferida em {s.checked}. {s.limit}</span>
        </li>
      ))}
    </ul>
  );
}

export function SourcesBlock() {
  return (
    <section className="fsl-sources" aria-labelledby="fontes-titulo">
      <h2 id="fontes-titulo" className="fsl-h3">Fontes</h2>
      <p className="fsl-note">
        Os casos e os exemplos são fictícios e demonstrativos, sujeitos à revisão editorial. Foram redigidos para esta
        simulação a partir das regras destas fontes; não são texto oficial.
      </p>
      <SourcesList />
    </section>
  );
}
