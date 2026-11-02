import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Cloud, Loader2, Save } from "lucide-react";
import { usePracticeSync } from "../practiceSyncContext";
import { normChecks, useExerciseProgress, type Content } from "../practiceStore";

const fmtTime = (ms: number) => (ms ? new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const fmtDate = (iso: string | number | null) => {
  if (iso === null || iso === "") return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function Version({ title, c, note }: { title: string; c: Content; note?: string }) {
  return (
    <article className="fsl-sync-ver">
      <h4>{title}</h4>
      {note ? <p className="fsl-note">{note}</p> : null}
      <p className="fsl-pre">{c.draft || <em>(vazio)</em>}</p>
      {c.revision !== null ? (
        <>
          <p className="fsl-sync-label">Versão revisada</p>
          <p className="fsl-pre">{c.revision || <em>(vazia)</em>}</p>
        </>
      ) : null}
      <p className="fsl-note">Autoavaliação: {normChecks(c.checks).filter(Boolean).length} de {normChecks(c.checks).length} marcadas.</p>
    </article>
  );
}

/**
 * Estado e comandos da conta para UM exercício: alterações não salvas / salvando / salvo / falha, conflito entre aparelhos e rascunho
 * antigo. Só aparece na conta (na demonstração o contexto é nulo e nada é renderizado).
 */
export default function PracticeSyncPanel({ exId, compact = false }: { exId: string; compact?: boolean }) {
  const sync = usePracticeSync();
  const pr = useExerciseProgress(exId);
  if (!sync) return null;
  const st = sync.statusOf(exId);
  const conflict = pr.sync?.conflict ?? null;
  const backup = pr.sync?.backup ?? null;
  const legacy = compact ? null : sync.legacyOf(exId);
  const canSave = st.status === "dirty" || st.status === "error" || st.status === "session";

  const label: Record<typeof st.status, string> = {
    loading: "Verificando o que já está salvo na sua conta…",
    idle: "Ainda não salvo na sua conta.",
    dirty: "Alterações não salvas na conta. Seu texto está guardado neste navegador.",
    saving: "Salvando na sua conta…",
    saved: `Salvo na sua conta${st.lastSavedAt ? ` às ${fmtTime(st.lastSavedAt)}` : ""}.`,
    error: "Falha ao salvar. Seu texto continua aqui.",
    session: "Sessão encerrada. Seu texto continua aqui.",
    conflict: "Este exercício mudou em outro aparelho.",
  };
  const Icon = st.status === "saved" ? CheckCircle2 : st.status === "saving" || st.status === "loading" ? Loader2 : st.status === "error" || st.status === "session" || st.status === "conflict" ? AlertTriangle : st.status === "dirty" ? Save : Cloud;

  return (
    <section className={`fsl-sync${compact ? " is-compact" : ""}`} aria-label="Salvar na conta">
      <p className={`fsl-sync-status is-${st.status}`} role="status" aria-live="polite" data-sync-status={st.status}>
        <Icon size={20} aria-hidden="true" className={st.status === "saving" || st.status === "loading" ? "fsl-spin" : ""} />
        <span>{label[st.status]}</span>
      </p>

      {st.message ? (
        <p className="fsl-alert is-error" role="alert">
          {st.message}{" "}
          {st.status === "session" ? <Link to="/app/entrar" className="fsl-inline-link">Entrar de novo</Link> : null}
        </p>
      ) : null}

      {sync.loadState === "error" && !compact ? (
        <p className="fsl-alert is-error" role="alert">
          Não foi possível verificar o que já está salvo na sua conta. {sync.loadMessage}{" "}
          <button type="button" className="fsl-link-strong" onClick={() => void sync.reload()}>Verificar de novo</button>
        </p>
      ) : null}

      {st.status !== "conflict" ? (
        <button
          type="button"
          className="fsl-btn fsl-btn-navy fsl-btn-block"
          disabled={!canSave}
          onClick={() => void sync.save(exId)}
        >
          {st.status === "saving" ? "Salvando…" : st.status === "error" || st.status === "session" ? "Tentar de novo" : "Salvar na minha conta"}
        </button>
      ) : null}

      {conflict && !compact ? (
        <div className="fsl-sync-conflict" role="group" aria-label="Conflito entre aparelhos">
          <h3>Este exercício mudou em outro aparelho</h3>
          {conflict.missing ? (
            <p>Ele foi apagado da sua conta em outro aparelho. O seu texto daqui não foi perdido.</p>
          ) : (
            <p>Nada foi apagado: os dois textos estão aqui embaixo. Escolha como continuar.</p>
          )}
          {conflict.missing ? null : (
            <Version title="Na sua conta (mais recente)" c={conflict} note={conflict.updatedAt ? `Salvo em ${fmtDate(conflict.updatedAt)}` : undefined} />
          )}
          <Version title="Neste aparelho (não salvo)" c={{ draft: pr.draft, revision: pr.revision, checks: pr.checks }} />
          <div className="fsl-sync-choices">
            <button type="button" className="fsl-btn fsl-btn-navy" onClick={() => void sync.resolve(exId, "mine")}>
              Manter o meu texto e salvar
            </button>
            {conflict.missing ? (
              <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => void sync.resolve(exId, "account")}>
                Aceitar a exclusão (guardo uma cópia do meu texto)
              </button>
            ) : (
              <>
                <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => void sync.resolve(exId, "account")}>
                  Usar o texto da conta (guardo uma cópia do meu)
                </button>
                <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => void sync.resolve(exId, "merge")}>
                  Juntar os dois textos
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {backup && !compact ? (
        <details className="fsl-px-more fsl-sync-backup">
          <summary>Seu texto de antes (guardado só neste aparelho)</summary>
          <div className="fsl-px-more-body">
            <Version title={`Cópia de ${fmtDate(backup.at)}`} c={backup} />
            <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => sync.restoreBackup(exId)}>
              Restaurar este texto (fica como alteração não salva)
            </button>
          </div>
        </details>
      ) : null}

      {legacy ? (
        <div className="fsl-sync-legacy" role="group" aria-label="Rascunho antigo neste navegador">
          <h3>Rascunho antigo neste navegador</h3>
          <p>
            Você tem um rascunho guardado só neste navegador, de antes da conta (ou da demonstração). Ele <strong>não foi enviado</strong> para a sua conta
            e só vai se você escolher importar.
          </p>
          <details className="fsl-px-more">
            <summary>Ver o rascunho antigo</summary>
            <div className="fsl-px-more-body">
              <Version title="Rascunho antigo" c={legacy.content} />
            </div>
          </details>
          {legacy.canImport ? null : (
            <p className="fsl-note">
              {sync.loadState === "ready"
                ? "Sua conta já tem texto neste exercício, então não vamos misturar. Copie daqui o que quiser."
                : "Aguarde a verificação da sua conta para poder importar."}
            </p>
          )}
          <div className="fsl-sync-choices">
            <button type="button" className="fsl-btn fsl-btn-navy" disabled={!legacy.canImport} onClick={() => void sync.importLegacy(exId)}>
              Importar para a minha conta
            </button>
            <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => sync.dismissLegacy(exId)}>
              Não importar
            </button>
          </div>
        </div>
      ) : null}

      {compact ? null : (
        <p className="fsl-demo-note">
          <Cloud size={16} aria-hidden="true" />
          <span>
            Seu texto fica guardado neste navegador (cópia para não perder) e, quando você toca em “Salvar na minha conta”, também na sua conta, para abrir em
            outro aparelho. Só a sua conta acessa: não há tela para a equipe ler os textos. Não vale pontos nem ranking.
          </span>
        </p>
      )}
    </section>
  );
}
