import * as React from "react";
import PracticeRoutes from "../screens/PracticeScreen";
import { useAuth } from "./auth";
import { EXERCISES, exerciseById } from "../data/practice";
import {
  PracticeStore,
  PracticeStoreProvider,
  accountStorageKey,
  contentOf,
  dismissLegacy as storeDismissLegacy,
  hasContent,
  isDirty,
  legacyContent,
  legacyDismissedAt,
  normChecks,
  sameContent,
  MAX_TEXT,
  type Content,
  type ExerciseProgress,
} from "../practiceStore";
import { PracticeSyncContext, type ConflictChoice, type ExerciseSync, type LegacyInfo, type PracticeSync } from "../practiceSyncContext";
import { PracticeRemoteError, practiceApi, practiceMessage, type PracticeFailure, type RemoteRow } from "./practiceRemote";

/**
 * Prática de anotação e evolução na conta (migration 0009). O que o aluno digita fica num cache deste navegador, SEPARADO POR USUÁRIO;
 * só vai para a conta quando ele toca em "Salvar na minha conta". Rascunhos antigos nunca são enviados sozinhos (importação consentida).
 * Não gera pontos nem ranking. A correção por IA está PAUSADA: nenhuma chamada de IA parte daqui.
 */
export default function RemotePractice() {
  const { user, profile } = useAuth();
  if (!user) return null; // RequireAuth garante a sessão; por segurança, nada é renderizado sem usuário
  // key = usuário: ao trocar de conta, o repositório, o estado e as requisições em curso são descartados por inteiro
  return <AccountPractice key={user.id} userId={user.id} avatarInitial={profile?.display_name ?? "?"} />;
}

type Err = { kind: PracticeFailure; message: string };

const rowContent = (r: RemoteRow): Content => ({ draft: r.draft, revision: r.revision, checks: normChecks(r.checks) });
const EMPTY: Content = { draft: "", revision: null, checks: normChecks([]) };

function AccountPractice({ userId, avatarInitial }: { userId: string; avatarInitial: string }) {
  const store = React.useMemo(() => new PracticeStore(accountStorageKey(userId), true), [userId]);
  const data = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
  void data; // a assinatura faz esta árvore reler o repositório a cada mudança

  const [load, setLoad] = React.useState<"loading" | "ready" | "error">("loading");
  const [loadMsg, setLoadMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [errs, setErrs] = React.useState<Record<string, Err | null>>({});
  const [, setTick] = React.useState(0);
  const alive = React.useRef(true);
  const busyRef = React.useRef<Record<string, boolean>>({});
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setBusyFor = (id: string, v: boolean) => {
    busyRef.current = { ...busyRef.current, [id]: v };
    if (alive.current) setBusy(busyRef.current);
  };
  const setErr = (id: string, e: Err | null) => {
    if (alive.current) setErrs((cur) => ({ ...cur, [id]: e }));
  };
  const fail = (id: string, e: unknown) => {
    const kind = e instanceof PracticeRemoteError ? e.kind : "unknown";
    setErr(id, { kind, message: practiceMessage(kind) });
  };

  // ── traz da conta o que já foi salvo e junta com o cache, sem sobrescrever nada que não esteja salvo ──
  function adopt(id: string, row: RemoteRow) {
    const c = rowContent(row);
    store.patch(id, { draft: c.draft, revision: c.revision, checks: c.checks });
    store.patchSync(id, (s) => ({ rev: row.rev, saved: c, lastSavedAt: Date.parse(row.updatedAt) || Date.now(), conflict: null, backup: s?.backup ?? null }));
  }

  function merge(id: string, row: RemoteRow | undefined) {
    const local = store.get(id);
    const dirty = isDirty(local);
    if (row) {
      const c = rowContent(row);
      if (local.sync && local.sync.rev === row.rev && !local.sync.conflict) {
        if (!local.sync.saved || !sameContent(local.sync.saved, c)) store.patchSync(id, (s) => (s ? { ...s, saved: c } : s));
        return;
      }
      if (local.sync?.conflict) {
        // já há conflito aberto: só atualiza a versão da conta mostrada
        store.patchSync(id, (s) => (s ? { ...s, conflict: { ...c, rev: row.rev, updatedAt: row.updatedAt, missing: false } } : s));
        return;
      }
      if (!dirty) return adopt(id, row);
      if (sameContent(contentOf(local), c)) return adopt(id, row); // mesmo texto nos dois lados: não há conflito
      store.patchSync(id, (s) => ({
        rev: s?.rev ?? 0,
        saved: s?.saved ?? null,
        lastSavedAt: s?.lastSavedAt ?? 0,
        backup: s?.backup ?? null,
        conflict: { ...c, rev: row.rev, updatedAt: row.updatedAt, missing: false },
      }));
      return;
    }
    // a conta não tem este exercício
    if (local.sync && local.sync.rev > 0) {
      if (!dirty && !local.sync.conflict) {
        store.clearExercise(id); // apagado em outro aparelho e aqui não há nada novo: acompanha
      } else if (!local.sync.conflict) {
        store.patchSync(id, (s) => (s ? { ...s, conflict: { ...EMPTY, rev: null, updatedAt: null, missing: true } } : s));
      }
    }
  }

  const reload = React.useCallback(async () => {
    setLoad("loading");
    setLoadMsg(null);
    try {
      const rows = await practiceApi.list();
      if (!alive.current) return;
      for (const ex of EXERCISES) merge(ex.id, rows.find((r) => r.exerciseId === ex.id && r.exerciseVersion === ex.version));
      setLoad("ready");
    } catch (e) {
      if (!alive.current) return;
      setLoad("error");
      setLoadMsg(practiceMessage(e instanceof PracticeRemoteError ? e.kind : "unknown"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // ao voltar para a aba, confere se outro aparelho gravou algo mais novo (nunca sobrescreve texto não salvo)
  React.useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 30_000 && !Object.values(busyRef.current).some(Boolean)) {
        last = Date.now();
        void reload();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  // ── salvar ──
  async function save(id: string) {
    const ex = exerciseById(id);
    if (!ex || busyRef.current[id]) return;
    const local = store.get(id);
    if (local.sync?.conflict) return; // primeiro é preciso resolver o conflito
    setBusyFor(id, true);
    setErr(id, null);
    try {
      const sent = contentOf(local);
      const res = await practiceApi.save(ex.id, ex.version, sent, local.sync?.rev ?? 0);
      if (!alive.current) return;
      if (res.status === "saved") {
        // marca como salvo SÓ o que foi enviado: se a pessoa digitou durante o envio, continua "não salvo"
        store.patchSync(id, (s) => ({ rev: res.row.rev, saved: rowContent(res.row), lastSavedAt: Date.now(), conflict: null, backup: s?.backup ?? null }));
      } else {
        store.patchSync(id, (s) => ({
          rev: s?.rev ?? 0,
          saved: s?.saved ?? null,
          lastSavedAt: s?.lastSavedAt ?? 0,
          backup: s?.backup ?? null,
          conflict: res.row
            ? { ...rowContent(res.row), rev: res.row.rev, updatedAt: res.row.updatedAt, missing: false }
            : { ...EMPTY, rev: null, updatedAt: null, missing: true },
        }));
      }
    } catch (e) {
      fail(id, e);
    } finally {
      setBusyFor(id, false);
    }
  }

  // ── apagar o próprio progresso (servidor e este navegador) ──
  async function remove(id: string): Promise<boolean> {
    if (busyRef.current[id]) return false;
    setBusyFor(id, true);
    setErr(id, null);
    try {
      await practiceApi.remove(id);
      if (!alive.current) return true;
      store.clearExercise(id);
      return true;
    } catch (e) {
      fail(id, e); // o texto continua aqui; a pessoa pode tentar de novo
      return false;
    } finally {
      setBusyFor(id, false);
    }
  }

  async function removeAll(): Promise<boolean> {
    for (const ex of EXERCISES) if (!(await remove(ex.id))) return false;
    return true;
  }

  // ── conflito entre aparelhos ──
  async function resolve(id: string, choice: ConflictChoice) {
    const local = store.get(id);
    const c = local.sync?.conflict;
    if (!c) return;
    const mine = contentOf(local);
    if (choice === "account") {
      const backup = hasContent(mine) ? { ...mine, at: Date.now() } : (local.sync?.backup ?? null);
      if (c.missing) {
        store.patch(id, { draft: "", revision: null, checks: [] });
        store.patchSync(id, () => ({ rev: 0, saved: null, lastSavedAt: 0, conflict: null, backup }));
      } else {
        store.patch(id, { draft: c.draft, revision: c.revision, checks: c.checks });
        store.patchSync(id, () => ({ rev: c.rev ?? 0, saved: { draft: c.draft, revision: c.revision, checks: c.checks }, lastSavedAt: Date.now(), conflict: null, backup }));
      }
      return;
    }
    if (choice === "merge" && !c.missing) {
      const join = (a: string, b: string) => (!b || a === b ? a : !a ? b : `${a}\n\n— Versão da conta (outro aparelho) —\n${b}`);
      const draft = join(mine.draft, c.draft);
      const revision = mine.revision === null && c.revision === null ? null : join(mine.revision ?? "", c.revision ?? "");
      if (draft.length > MAX_TEXT || (revision ?? "").length > MAX_TEXT) {
        setErr(id, { kind: "invalid", message: `Os dois textos juntos passam de ${MAX_TEXT} caracteres. Escolha uma das versões ou copie o que quiser antes.` });
        return;
      }
      setErr(id, null);
      const checks = mine.checks.map((v, i) => v || c.checks[i]);
      store.patch(id, { draft, revision, checks });
      store.patchSync(id, (s) => ({ rev: c.rev ?? 0, saved: { draft: c.draft, revision: c.revision, checks: c.checks }, lastSavedAt: s?.lastSavedAt ?? 0, conflict: null, backup: s?.backup ?? null }));
      return; // a pessoa confere o texto junto e toca em Salvar
    }
    // "mine" (ou "merge" quando a conta não tem mais o exercício): mantém o meu texto, alinha a rev conhecida e salva
    store.patchSync(id, (s) => ({
      rev: c.missing ? 0 : (c.rev ?? 0),
      saved: c.missing ? null : { draft: c.draft, revision: c.revision, checks: c.checks },
      lastSavedAt: s?.lastSavedAt ?? 0,
      conflict: null,
      backup: s?.backup ?? null,
    }));
    await save(id);
  }

  function restoreBackup(id: string) {
    const b = store.get(id).sync?.backup;
    if (!b) return;
    store.patch(id, { draft: b.draft, revision: b.revision, checks: b.checks });
    store.patchSync(id, (s) => (s ? { ...s, backup: null } : s));
  }

  // ── rascunhos antigos (só neste navegador): importação SÓ com o consentimento da pessoa ──
  function legacyOf(id: string): LegacyInfo | null {
    const lc = legacyContent(id);
    if (!lc) return null;
    if (legacyDismissedAt(userId, id) >= lc.updatedAt) return null;
    const local = store.get(id);
    if (sameContent(lc, contentOf(local))) return null;
    const accountHasContent = hasContent(contentOf(local)) || (local.sync?.rev ?? 0) > 0 || !!local.sync?.conflict;
    return { content: { draft: lc.draft, revision: lc.revision, checks: lc.checks }, updatedAt: lc.updatedAt, canImport: load === "ready" && !accountHasContent };
  }

  async function importLegacy(id: string) {
    const info = legacyOf(id);
    if (!info || !info.canImport) return;
    store.patch(id, { draft: info.content.draft, revision: info.content.revision, checks: info.content.checks });
    await save(id);
    if (alive.current && !store.get(id).sync?.conflict && store.get(id).sync && (store.get(id).sync?.rev ?? 0) > 0) {
      storeDismissLegacy(userId, id, info.updatedAt);
      setTick((t) => t + 1);
    }
  }

  function dismissLegacy(id: string) {
    const lc = legacyContent(id);
    if (lc) storeDismissLegacy(userId, id, lc.updatedAt);
    setTick((t) => t + 1);
  }

  function statusOf(id: string): ExerciseSync {
    const p: ExerciseProgress = store.get(id);
    const s = p.sync;
    const last = s?.lastSavedAt ?? 0;
    if (s?.conflict) return { status: "conflict", message: null, lastSavedAt: last };
    if (busy[id]) return { status: "saving", message: null, lastSavedAt: last };
    const e = errs[id];
    if (e) return { status: e.kind === "session" ? "session" : "error", message: e.message, lastSavedAt: last };
    if (isDirty(p)) return { status: "dirty", message: null, lastSavedAt: last };
    if ((s?.rev ?? 0) > 0) return { status: "saved", message: null, lastSavedAt: last };
    return { status: load === "loading" ? "loading" : "idle", message: null, lastSavedAt: last };
  }

  const sync: PracticeSync = {
    loadState: load,
    loadMessage: loadMsg,
    statusOf,
    save,
    remove,
    removeAll,
    resolve,
    restoreBackup,
    legacyOf,
    importLegacy,
    dismissLegacy,
    reload,
  };

  return (
    <PracticeStoreProvider value={store}>
      <PracticeSyncContext.Provider value={sync}>
        <PracticeRoutes avatarInitial={avatarInitial} />
      </PracticeSyncContext.Provider>
    </PracticeStoreProvider>
  );
}
