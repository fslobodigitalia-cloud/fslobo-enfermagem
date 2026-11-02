import { Link } from "react-router-dom";
import { useBase } from "../base";

/** Marca do app (livro aberto + nome). Desenhada em SVG inline, sem arquivo extra. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 12c-4-3-10-4-17-3v26c7-1 13 0 17 3z" fill="#12B58F" />
      <path d="M24 12c4-3 10-4 17-3v26c-7-1-13 0-17 3z" fill="#0A9578" />
      <path d="M24 12v26" stroke="#FBFBF8" strokeWidth="2" />
      <path d="M12 6l3 5M18 3l1.5 5" stroke="#12B58F" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Brand() {
  const base = useBase();
  return (
    <Link to={base} className="fsl-brand" aria-label="FSLOBO Enfermagem — ir para o início">
      <BrandMark />
      <span className="fsl-brand-text">
        <span className="fsl-brand-name">FSLOBO</span>
        <span className="fsl-brand-sub">Enfermagem</span>
      </span>
    </Link>
  );
}

/**
 * Avatar provisório: inicial do nome (sem foto). Na demonstração é a inicial fixa "F";
 * na conta real vem do nome do perfil do próprio usuário.
 */
export function Avatar({ size = 52, initial = "F" }: { size?: number; initial?: string }) {
  const letter = (initial.trim()[0] ?? "?").toLocaleUpperCase("pt-BR");
  return (
    <span
      className="fsl-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
