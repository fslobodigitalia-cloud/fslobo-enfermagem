/**
 * Chamadas às RPCs do backend do app. O navegador NÃO calcula pontos, não escolhe questões e
 * não conhece o gabarito: tudo vem pronto do servidor (ver supabase/migrations).
 */
import { getAppSupabase } from "./appSupabase";

export type AttemptMode = "practice" | "free" | "review";
export type AttemptStatus = "in_progress" | "completed" | "abandoned" | "expired";

export type Attempt = {
  id: string;
  mode: AttemptMode;
  status: AttemptStatus;
  question_count: number;
  correct_count: number | null;
  points_awarded: number | null;
  awards_points: boolean;
  scored_questions: number;
  started_at: string;
  last_activity_at: string;
  resumable: boolean;
  expires_at: string | null;
  completed_at: string | null;
};

export type ItemAnswer = {
  option_id: string;
  is_correct: boolean;
  correct_option_id: string;
  explanation: string | null;
};

export type AttemptItem = {
  item_id: string;
  position: number;
  stem: string;
  difficulty: number;
  options: { id: string; label: string; body: string }[];
  answer: ItemAnswer | null;
};

export type AttemptPayload = { attempt: Attempt; items: AttemptItem[] };

export type Progress = {
  points: number;
  scored_questions: number;
  attempts_completed: number;
  answered: number;
  correct: number;
  study_days: number;
  week_completed: number;
  weekly_goal: number | null;
  pending_review: number;
  attempts_left_today: number;
  questions_left_today: number;
};

export type Subject = { slug: string; name: string; description: string | null; question_count: number };

export type AttemptRow = {
  id: string;
  mode: AttemptMode;
  status: AttemptStatus;
  subject_name: string | null;
  question_count: number;
  correct_count: number | null;
  points_awarded: number | null;
  started_at: string;
  completed_at: string | null;
};

export type ReviewItem = {
  stem: string;
  subject: string;
  miss_count: number;
  last_missed_at: string;
  options: { label: string; body: string; is_correct: boolean }[];
  explanation: string | null;
};

export type Profile = { display_name: string; exam_focus: string | null; weekly_goal: number };

/** Códigos estáveis das mensagens que o servidor levanta. */
export type RpcCode =
  | "not_authenticated"
  | "not_found"
  | "already_answered"
  | "attempt_expired"
  | "attempt_not_open"
  | "attempt_incomplete"
  | "invalid_option"
  | "daily_limit_reached"
  | "profile_required"
  | "no_questions_available"
  | "subject_not_found"
  | "invalid_question_count"
  | "network"
  | "unknown";

export class RpcError extends Error {
  code: RpcCode;
  /** "attempts" ou "questions" em daily_limit_reached. */
  detail?: string;
  constructor(code: RpcCode, detail?: string) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

const KNOWN =
  /(not_authenticated|not_found|already_answered|attempt_expired|attempt_not_open|attempt_incomplete|invalid_option|daily_limit_reached|profile_required|no_questions_available|subject_not_found|invalid_question_count)/;

function toRpcError(error: { message?: string; details?: string | null } | unknown): RpcError {
  const e = error as { message?: string; details?: string | null };
  const msg = String(e?.message ?? "");
  const m = msg.match(KNOWN);
  if (m) return new RpcError(m[1] as RpcCode, e.details ? String(e.details) : undefined);
  if (/fetch|network|failed to|timeout/i.test(msg)) return new RpcError("network");
  return new RpcError("unknown");
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const { data, error } = await getAppSupabase().rpc(fn, args);
    if (error) throw toRpcError(error);
    return data as T;
  } catch (e) {
    if (e instanceof RpcError) throw e;
    throw toRpcError(e);
  }
}

export const api = {
  listSubjects: () => call<Subject[]>("study_list_subjects"),
  progress: () => call<Progress>("study_my_progress"),
  listAttempts: (limit = 10) => call<AttemptRow[]>("study_list_my_attempts", { p_limit: limit, p_offset: 0 }),
  getAttempt: (id: string) => call<AttemptPayload>("study_get_attempt", { p_attempt_id: id }),
  startAttempt: (slug: string | null, mode: AttemptMode, count: number) =>
    call<AttemptPayload>("study_start_attempt", { p_subject_slug: slug, p_mode: mode, p_question_count: count }),
  submitAnswer: (itemId: string, optionId: string) =>
    call<{ is_correct: boolean; correct_option_id: string; explanation: string | null }>("study_submit_answer", {
      p_item_id: itemId,
      p_option_id: optionId,
    }),
  completeAttempt: (id: string) => call<AttemptPayload>("study_complete_attempt", { p_attempt_id: id }),
  abandonAttempt: (id: string) => call<null>("study_abandon_attempt", { p_attempt_id: id }),
  reviewItems: (limit = 50) => call<ReviewItem[]>("study_list_my_review_items", { p_limit: limit }),
  upsertProfile: (name: string, focus: string | null, goal: number) =>
    call<Profile>("study_upsert_my_profile", { p_display_name: name, p_exam_focus: focus, p_weekly_goal: goal }),
};

/** Mensagem em português para o usuário. Nunca repete texto bruto do servidor. */
export function rpcMessage(e: unknown): string {
  const err = e instanceof RpcError ? e : new RpcError("unknown");
  switch (err.code) {
    case "daily_limit_reached":
      return /questions/.test(err.detail ?? "")
        ? "Você atingiu o limite de questões de hoje. Volte amanhã."
        : "Você atingiu o limite de treinos de hoje. Volte amanhã.";
    case "attempt_expired":
      return "Este treino ficou parado por muito tempo e expirou. Comece um novo treino.";
    case "attempt_not_open":
      return "Este treino já foi encerrado.";
    case "attempt_incomplete":
      return "Responda todas as questões do treino para concluí-lo, ou encerre sem concluir.";
    case "already_answered":
      return "Esta questão já foi respondida.";
    case "no_questions_available":
      return "Não há questões disponíveis para essa escolha agora.";
    case "subject_not_found":
      return "Esse assunto não está mais disponível.";
    case "not_authenticated":
      return "Sua sessão terminou. Entre novamente.";
    case "network":
      return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
    default:
      return "Não foi possível concluir agora. Tente de novo em instantes.";
  }
}
