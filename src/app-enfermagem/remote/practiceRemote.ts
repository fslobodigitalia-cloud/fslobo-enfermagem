/**
 * Chamadas às RPCs da Prática na conta (migration 0009). A identidade vem SEMPRE da sessão validada no servidor (auth.uid()):
 * nada aqui envia user_id. Os textos nunca são escritos em console, URL ou rastreamento.
 */
import { getAppSupabase } from "./appSupabase";
import { normChecks, type Content } from "../practiceStore";

export type RemoteRow = Content & { exerciseId: string; exerciseVersion: number; rev: number; updatedAt: string };

export type SaveResult =
  | { status: "saved"; row: RemoteRow }
  | { status: "conflict"; row: RemoteRow | null };

export type PracticeFailure = "network" | "session" | "invalid" | "unknown";

export class PracticeRemoteError extends Error {
  constructor(readonly kind: PracticeFailure) {
    super(kind);
  }
}

function toError(e: unknown): PracticeRemoteError {
  const err = e as { message?: string; code?: string; status?: number } | null;
  const msg = String(err?.message ?? "");
  if (/not_authenticated|JWT|jwt expired|Invalid Refresh Token|invalid claim|permission denied/i.test(msg) || err?.status === 401 || err?.code === "28000") {
    return new PracticeRemoteError("session");
  }
  if (/invalid_exercise|text_too_long|invalid_checks|invalid_revision/.test(msg)) return new PracticeRemoteError("invalid");
  if (/fetch|network|failed to|timeout|load failed|abort/i.test(msg) || err?.status === 0) return new PracticeRemoteError("network");
  return new PracticeRemoteError("unknown");
}

function parseRow(v: unknown): RemoteRow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.exercise_id !== "string" || typeof o.exercise_version !== "number" || typeof o.draft !== "string" || typeof o.rev !== "number") return null;
  return {
    exerciseId: o.exercise_id,
    exerciseVersion: o.exercise_version,
    draft: o.draft,
    revision: typeof o.revision === "string" ? o.revision : null,
    checks: normChecks(Array.isArray(o.checks) ? (o.checks as boolean[]) : []),
    rev: o.rev,
    updatedAt: typeof o.updated_at === "string" ? o.updated_at : "",
  };
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await getAppSupabase().rpc(fn, args);
    if (error) throw error;
    return data as T;
  } catch (e) {
    throw toError(e);
  }
}

export const practiceApi = {
  async list(): Promise<RemoteRow[]> {
    const data = await call<unknown>("study_practice_list_my_progress", {});
    if (!Array.isArray(data)) throw new PracticeRemoteError("unknown");
    return data.map(parseRow).filter((r): r is RemoteRow => r !== null);
  },

  async save(exerciseId: string, version: number, c: Content, expectedRev: number): Promise<SaveResult> {
    const data = await call<unknown>("study_practice_save_progress", {
      p_exercise_id: exerciseId,
      p_exercise_version: version,
      p_draft: c.draft,
      p_revision: c.revision,
      p_checks: normChecks(c.checks),
      p_expected_rev: expectedRev,
    });
    const o = data as { status?: unknown; row?: unknown } | null;
    if (o?.status === "saved") {
      const row = parseRow(o.row);
      if (row) return { status: "saved", row };
    }
    if (o?.status === "conflict") return { status: "conflict", row: parseRow(o.row) };
    throw new PracticeRemoteError("unknown");
  },

  async remove(exerciseId: string): Promise<void> {
    await call<number>("study_practice_delete_progress", { p_exercise_id: exerciseId });
  },
};

/** Mensagem em português, sem repetir texto bruto do servidor. */
export function practiceMessage(kind: PracticeFailure): string {
  switch (kind) {
    case "network":
      return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
    case "session":
      return "Sua sessão terminou. Entre de novo para salvar.";
    case "invalid":
      return "O servidor não aceitou este conteúdo (confira o tamanho dos textos).";
    default:
      return "Não foi possível concluir agora. Tente de novo em instantes.";
  }
}
