import * as React from "react";
import { EXERCISES } from "./data/practice";
import { AI_MAX_ROUNDS, parseAiRounds, type AiRound } from "./data/aiFeedback";

/**
 * Rascunhos da aba Prática: ficam SOMENTE neste navegador (localStorage), em chave própria.
 * Não vão para a conta, não vão para o servidor, não geram pontos e não tocam em nada da loja.
 */
export const PRACTICE_STORAGE_KEY = "fslobo_app_pratica_v1";
export const MAX_TEXT = 3000;

export type ExerciseProgress = {
  /** Primeira versão escrita pela pessoa. */
  draft: string;
  /** Já abriu a comparação com o exemplo. */
  compared: boolean;
  /** Autoavaliação: itens marcados (por posição no checklist). */
  checks: boolean[];
  /** Versão revisada; null enquanto a pessoa não começou a revisar. */
  revision: string | null;
  /** Rodadas de correção assistida por IA (piloto). A primeira guarda a primeira versão enviada. Só neste navegador. */
  aiRounds: AiRound[];
  updatedAt: number;
};

type Data = { v: 1; items: Record<string, ExerciseProgress> };

const EMPTY: Data = { v: 1, items: {} };
const BLANK: ExerciseProgress = { draft: "", compared: false, checks: [], revision: null, aiRounds: [], updatedAt: 0 };

let current: Data = EMPTY;
let storageOk = true;
let loaded = false;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): Data {
  if (!raw || typeof raw !== "object") return EMPTY;
  const items = (raw as { items?: unknown }).items;
  if (!items || typeof items !== "object") return EMPTY;
  const out: Record<string, ExerciseProgress> = {};
  for (const ex of EXERCISES) {
    const v = (items as Record<string, unknown>)[ex.id];
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const draft = typeof o.draft === "string" ? o.draft.slice(0, MAX_TEXT) : "";
    const revision = typeof o.revision === "string" ? o.revision.slice(0, MAX_TEXT) : null;
    // Marcações de uma versão antiga da autoavaliação (outro número de itens) não valem para as perguntas atuais: descarta.
    // Os textos digitados (draft, revision) nunca são descartados.
    const checks =
      Array.isArray(o.checks) && o.checks.length === ex.checklist.length ? ex.checklist.map((_, i) => (o.checks as unknown[])[i] === true) : [];
    out[ex.id] = {
      draft,
      compared: o.compared === true,
      checks,
      revision,
      aiRounds: parseAiRounds(o.aiRounds),
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
    };
  }
  return { v: 1, items: out };
}

function read(): Data {
  try {
    const raw = window.localStorage.getItem(PRACTICE_STORAGE_KEY);
    storageOk = true;
    return raw ? sanitize(JSON.parse(raw)) : EMPTY;
  } catch {
    // Sem armazenamento (modo privado, bloqueado) ou JSON inválido: segue só em memória.
    try {
      window.localStorage.getItem(PRACTICE_STORAGE_KEY);
    } catch {
      storageOk = false;
    }
    return EMPTY;
  }
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  current = read();
  window.addEventListener("storage", (e) => {
    if (e.key === PRACTICE_STORAGE_KEY || e.key === null) {
      current = read();
      listeners.forEach((l) => l());
    }
  });
}

function persist() {
  try {
    if (Object.keys(current.items).length === 0) window.localStorage.removeItem(PRACTICE_STORAGE_KEY);
    else window.localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(current));
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

function commit(next: Data) {
  current = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  ensureLoaded();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot(): Data {
  ensureLoaded();
  return current;
}

export function patchExercise(id: string, patch: Partial<ExerciseProgress> | ((p: ExerciseProgress) => Partial<ExerciseProgress>)) {
  ensureLoaded();
  const prev = current.items[id] ?? BLANK;
  const delta = typeof patch === "function" ? patch(prev) : patch;
  commit({ v: 1, items: { ...current.items, [id]: { ...prev, ...delta, updatedAt: Date.now() } } });
}

/** Acrescenta uma rodada de correção. Guarda sempre a primeira (primeira versão) e as últimas, até o limite. */
export function addAiRound(id: string, text: string, result: AiRound["result"]) {
  patchExercise(id, (p) => {
    const n = (p.aiRounds.length ? Math.max(...p.aiRounds.map((r) => r.n)) : 0) + 1;
    const next = [...p.aiRounds, { n, at: Date.now(), text, result, flagged: [] }];
    const kept = next.length > AI_MAX_ROUNDS ? [next[0], ...next.slice(next.length - (AI_MAX_ROUNDS - 1))] : next;
    return { aiRounds: kept };
  });
}

export function flagAiFinding(id: string, roundN: number, findingId: string) {
  patchExercise(id, (p) => ({
    aiRounds: p.aiRounds.map((r) => (r.n === roundN && !r.flagged.includes(findingId) ? { ...r, flagged: [...r.flagged, findingId] } : r)),
  }));
}

export function clearExercise(id: string) {
  ensureLoaded();
  const { [id]: _removed, ...rest } = current.items;
  void _removed;
  commit({ v: 1, items: rest });
}

/** Apaga TODOS os textos e marcações da Prática deste navegador. */
export function clearAllPractice() {
  ensureLoaded();
  current = EMPTY;
  try {
    window.localStorage.removeItem(PRACTICE_STORAGE_KEY);
  } catch {
    /* ignora */
  }
  listeners.forEach((l) => l());
}

export function usePracticeData() {
  const data = React.useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return { data, storageOk };
}

export function useExerciseProgress(id: string): ExerciseProgress {
  const { data } = usePracticeData();
  return data.items[id] ?? BLANK;
}

export function hasAnyPracticeText(data: Data) {
  return Object.values(data.items).some((p) => p.draft.trim() || (p.revision ?? "").trim());
}
