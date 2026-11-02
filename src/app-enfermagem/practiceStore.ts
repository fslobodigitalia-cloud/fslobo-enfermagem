import * as React from "react";
import { EXERCISES } from "./data/practice";
import { AI_MAX_ROUNDS, parseAiRounds, type AiRound } from "./data/aiFeedback";

/**
 * Rascunhos da aba Prática, em localStorage deste navegador. Há DOIS repositórios com a mesma forma:
 *  - demonstração (e rascunhos antigos): chave PRACTICE_STORAGE_KEY, só local, nunca vai a servidor;
 *  - conta do aluno: uma chave POR USUÁRIO (accountStorageKey), que é só um cache para não perder texto. O que vale na conta é o que o
 *    aluno grava com "Salvar na minha conta" (RPCs study_practice_*); o cache guarda também o estado de sincronização (SyncMeta).
 * Nunca geram pontos e não tocam em nada da loja.
 */
export const PRACTICE_STORAGE_KEY = "fslobo_app_pratica_v1";
export const ACCOUNT_KEY_PREFIX = "fslobo_app_pratica_acct_v1:";
export const MAX_TEXT = 3000;
export const CHECKS_PER_EXERCISE = 3;

export const accountStorageKey = (userId: string) => `${ACCOUNT_KEY_PREFIX}${userId}`;
const dismissedKey = (userId: string) => `${ACCOUNT_KEY_PREFIX}${userId}:legacy-dismissed`;

/** Conteúdo sincronizável de um exercício (o que vai para a conta). */
export type Content = { draft: string; revision: string | null; checks: boolean[] };

/** Versão do servidor que entrou em conflito com a deste aparelho. rev = null quando foi apagada em outro aparelho. */
export type ConflictInfo = Content & { rev: number | null; updatedAt: string | null; missing: boolean };

/** Estado de sincronização com a conta (só nos repositórios de conta). */
export type SyncMeta = {
  /** Número da versão gravada na conta que ESTE aparelho conhece (0 = nunca gravou). */
  rev: number;
  /** Último conteúdo que o servidor confirmou (para saber o que está "não salvo"). */
  saved: Content | null;
  lastSavedAt: number;
  conflict: ConflictInfo | null;
  /** Meu texto de antes de eu escolher a versão da conta (para poder recuperar). */
  backup: (Content & { at: number }) | null;
};

export type ExerciseProgress = {
  /** Primeira versão escrita pela pessoa. */
  draft: string;
  /** Já abriu o exemplo. */
  compared: boolean;
  /** Autoavaliação: itens marcados (por posição nas perguntas). */
  checks: boolean[];
  /** Versão revisada; null enquanto a pessoa não começou a revisar. */
  revision: string | null;
  /** Rodadas de correção assistida por IA (piloto PAUSADO; sempre vazio hoje). Só neste navegador. */
  aiRounds: AiRound[];
  updatedAt: number;
  /** Só nos repositórios de conta. */
  sync?: SyncMeta;
};

type Data = { v: 1; items: Record<string, ExerciseProgress> };

const EMPTY: Data = { v: 1, items: {} };
const BLANK: ExerciseProgress = { draft: "", compared: false, checks: [], revision: null, aiRounds: [], updatedAt: 0 };

// ─────────────────────────────── helpers de conteúdo ───────────────────────────────
export const normChecks = (c: boolean[] | undefined): boolean[] =>
  Array.from({ length: CHECKS_PER_EXERCISE }, (_, i) => (c ?? [])[i] === true);

export const contentOf = (p: ExerciseProgress): Content => ({ draft: p.draft, revision: p.revision, checks: normChecks(p.checks) });

export const sameContent = (a: Content, b: Content) =>
  a.draft === b.draft && (a.revision ?? null) === (b.revision ?? null) && normChecks(a.checks).join() === normChecks(b.checks).join();

export const hasContent = (c: Content) => c.draft.trim() !== "" || (c.revision ?? "").trim() !== "" || normChecks(c.checks).some(Boolean);

const EMPTY_CONTENT: Content = { draft: "", revision: null, checks: normChecks([]) };

/** Há alterações que ainda não foram confirmadas pela conta? (só faz sentido em repositório de conta) */
export function isDirty(p: ExerciseProgress): boolean {
  return !sameContent(contentOf(p), p.sync?.saved ?? EMPTY_CONTENT);
}

// ─────────────────────────────── validação do que vem do localStorage ───────────────────────────────
function parseContent(v: unknown): Content | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.draft !== "string") return null;
  const revision = typeof o.revision === "string" ? o.revision.slice(0, MAX_TEXT) : null;
  const checks = Array.isArray(o.checks) ? normChecks(o.checks as boolean[]) : normChecks([]);
  return { draft: o.draft.slice(0, MAX_TEXT), revision, checks };
}

function parseSync(v: unknown): SyncMeta | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const rev = typeof o.rev === "number" && Number.isInteger(o.rev) && o.rev >= 0 ? o.rev : 0;
  const saved = parseContent(o.saved);
  let conflict: ConflictInfo | null = null;
  const c = parseContent(o.conflict);
  if (c && o.conflict && typeof o.conflict === "object") {
    const co = o.conflict as Record<string, unknown>;
    conflict = {
      ...c,
      rev: typeof co.rev === "number" ? co.rev : null,
      updatedAt: typeof co.updatedAt === "string" ? co.updatedAt : null,
      missing: co.missing === true,
    };
  }
  const b = parseContent(o.backup);
  const backup = b && o.backup && typeof (o.backup as Record<string, unknown>).at === "number" ? { ...b, at: (o.backup as { at: number }).at } : null;
  return { rev, saved, lastSavedAt: typeof o.lastSavedAt === "number" ? o.lastSavedAt : 0, conflict, backup };
}

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
    const sync = parseSync(o.sync);
    out[ex.id] = {
      draft,
      compared: o.compared === true,
      checks,
      revision,
      aiRounds: parseAiRounds(o.aiRounds),
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
      ...(sync ? { sync } : {}),
    };
  }
  return { v: 1, items: out };
}

// ─────────────────────────────── repositório ───────────────────────────────
export class PracticeStore {
  storageOk = true;
  private current: Data = EMPTY;
  private loaded = false;
  private readonly listeners = new Set<() => void>();

  constructor(readonly storageKey: string, readonly isAccount = false) {}

  private read(): Data {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      this.storageOk = true;
      return raw ? sanitize(JSON.parse(raw)) : EMPTY;
    } catch {
      // Sem armazenamento (modo privado, bloqueado) ou JSON inválido: segue só em memória.
      try {
        window.localStorage.getItem(this.storageKey);
      } catch {
        this.storageOk = false;
      }
      return EMPTY;
    }
  }

  private ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    this.current = this.read();
    window.addEventListener("storage", (e) => {
      if (e.key === this.storageKey || e.key === null) {
        this.current = this.read();
        this.listeners.forEach((l) => l());
      }
    });
  }

  private persist() {
    try {
      if (Object.keys(this.current.items).length === 0) window.localStorage.removeItem(this.storageKey);
      else window.localStorage.setItem(this.storageKey, JSON.stringify(this.current));
      this.storageOk = true;
    } catch {
      this.storageOk = false;
    }
  }

  private commit(next: Data) {
    this.current = next;
    this.persist();
    this.listeners.forEach((l) => l());
  }

  subscribe = (cb: () => void) => {
    this.ensureLoaded();
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): Data => {
    this.ensureLoaded();
    return this.current;
  };

  get(id: string): ExerciseProgress {
    return this.getSnapshot().items[id] ?? BLANK;
  }

  patch(id: string, patch: Partial<ExerciseProgress> | ((p: ExerciseProgress) => Partial<ExerciseProgress>)) {
    this.ensureLoaded();
    const prev = this.current.items[id] ?? BLANK;
    const delta = typeof patch === "function" ? patch(prev) : patch;
    this.commit({ v: 1, items: { ...this.current.items, [id]: { ...prev, ...delta, updatedAt: Date.now() } } });
  }

  /** Atualiza só os metadados de sincronização (sem mexer em updatedAt do texto). */
  patchSync(id: string, fn: (s: SyncMeta | undefined, p: ExerciseProgress) => SyncMeta | undefined) {
    this.ensureLoaded();
    const prev = this.current.items[id] ?? BLANK;
    const sync = fn(prev.sync, prev);
    const next: ExerciseProgress = { ...prev };
    if (sync) next.sync = sync;
    else delete next.sync;
    this.commit({ v: 1, items: { ...this.current.items, [id]: next } });
  }

  clearExercise(id: string) {
    this.ensureLoaded();
    const { [id]: _removed, ...rest } = this.current.items;
    void _removed;
    this.commit({ v: 1, items: rest });
  }

  /** Apaga TODOS os textos e marcações deste repositório (neste navegador). */
  clearAll() {
    this.ensureLoaded();
    this.current = EMPTY;
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch {
      /* ignora */
    }
    this.listeners.forEach((l) => l());
  }

  /** Alguma alteração ainda não confirmada pela conta? */
  hasUnsaved(): boolean {
    return Object.values(this.getSnapshot().items).some((p) => isDirty(p) || p.sync?.conflict);
  }
}

/** Repositório da demonstração e dos rascunhos antigos (só local). */
export const demoStore = new PracticeStore(PRACTICE_STORAGE_KEY);

const StoreContext = React.createContext<PracticeStore>(demoStore);
export const PracticeStoreProvider = StoreContext.Provider;
export const usePracticeStore = () => React.useContext(StoreContext);

export function usePracticeData() {
  const store = usePracticeStore();
  const data = React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  return { data, storageOk: store.storageOk };
}

export function useExerciseProgress(id: string): ExerciseProgress {
  const { data } = usePracticeData();
  return data.items[id] ?? BLANK;
}

export function hasAnyPracticeText(data: Data) {
  return Object.values(data.items).some((p) => p.draft.trim() || (p.revision ?? "").trim());
}

// ─────────────────────────────── funções da demonstração (compatibilidade) ───────────────────────────────
export const patchExercise = (id: string, patch: Parameters<PracticeStore["patch"]>[1]) => demoStore.patch(id, patch);
export const clearExercise = (id: string) => demoStore.clearExercise(id);
/** Apaga TODOS os textos da demonstração/rascunhos antigos neste navegador. */
export const clearAllPractice = () => demoStore.clearAll();

/** Acrescenta uma rodada de correção por IA (piloto PAUSADO; sem uso na interface). */
export function addAiRound(id: string, text: string, result: AiRound["result"]) {
  demoStore.patch(id, (p) => {
    const n = (p.aiRounds.length ? Math.max(...p.aiRounds.map((r) => r.n)) : 0) + 1;
    const next = [...p.aiRounds, { n, at: Date.now(), text, result, flagged: [] }];
    const kept = next.length > AI_MAX_ROUNDS ? [next[0], ...next.slice(next.length - (AI_MAX_ROUNDS - 1))] : next;
    return { aiRounds: kept };
  });
}

export function flagAiFinding(id: string, roundN: number, findingId: string) {
  demoStore.patch(id, (p) => ({
    aiRounds: p.aiRounds.map((r) => (r.n === roundN && !r.flagged.includes(findingId) ? { ...r, flagged: [...r.flagged, findingId] } : r)),
  }));
}

// ─────────────────────────────── rascunhos antigos: importação consentida ───────────────────────────────
/** Conteúdo antigo (só neste navegador) de um exercício, se houver. Nunca é enviado sozinho. */
export function legacyContent(id: string): (Content & { updatedAt: number }) | null {
  const p = demoStore.get(id);
  const c = contentOf(p);
  return hasContent(c) ? { ...c, updatedAt: p.updatedAt } : null;
}

export function legacyDismissedAt(userId: string, id: string): number {
  try {
    const raw = window.localStorage.getItem(dismissedKey(userId));
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return typeof o[id] === "number" ? (o[id] as number) : 0;
  } catch {
    return 0;
  }
}

export function dismissLegacy(userId: string, id: string, updatedAt: number) {
  try {
    const raw = window.localStorage.getItem(dismissedKey(userId));
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(dismissedKey(userId), JSON.stringify({ ...o, [id]: updatedAt }));
  } catch {
    /* sem armazenamento: o aviso volta na próxima visita */
  }
}

// ─────────────────────────────── troca/saída de conta ───────────────────────────────
/**
 * Ao sair da conta: apaga deste navegador o cache do usuário SE tudo já está salvo na conta. Se houver alteração não salva (ou conflito),
 * o cache fica — só abre para o mesmo usuário (a chave leva o id) — para o texto não ser perdido. Nunca mexe no cache de outro usuário.
 */
export function purgeCleanAccountCache(userId: string) {
  try {
    const key = accountStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const data = sanitize(JSON.parse(raw));
    const unsaved = Object.values(data.items).some((p) => isDirty(p) || p.sync?.conflict);
    if (!unsaved) window.localStorage.removeItem(key);
  } catch {
    /* ignora */
  }
}

/** Há texto deste usuário ainda não salvo na conta, guardado neste navegador? */
export function accountCacheHasUnsaved(userId: string): boolean {
  try {
    const raw = window.localStorage.getItem(accountStorageKey(userId));
    if (!raw) return false;
    return Object.values(sanitize(JSON.parse(raw)).items).some((p) => isDirty(p) || p.sync?.conflict);
  } catch {
    return false;
  }
}
