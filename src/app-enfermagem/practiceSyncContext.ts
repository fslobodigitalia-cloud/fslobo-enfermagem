import * as React from "react";
import type { Content } from "./practiceStore";

/**
 * Contrato entre a tela da Prática e a sincronização com a conta. Este arquivo NÃO importa o Supabase: a demonstração usa a tela da
 * Prática sem carregar nada da conta (o contexto fica nulo e nenhum controle de conta aparece).
 */
export type SyncStatus = "loading" | "idle" | "dirty" | "saving" | "saved" | "error" | "session" | "conflict";

export type ExerciseSync = { status: SyncStatus; message: string | null; lastSavedAt: number };

export type LegacyInfo = {
  content: Content;
  updatedAt: number;
  /** Só dá para importar quando a conta ainda não tem nada neste exercício (nada é misturado nem sobrescrito). */
  canImport: boolean;
};

export type ConflictChoice = "account" | "mine" | "merge";

export type PracticeSync = {
  loadState: "loading" | "ready" | "error";
  loadMessage: string | null;
  statusOf: (exerciseId: string) => ExerciseSync;
  save: (exerciseId: string) => Promise<void>;
  remove: (exerciseId: string) => Promise<boolean>;
  removeAll: () => Promise<boolean>;
  resolve: (exerciseId: string, choice: ConflictChoice) => Promise<void>;
  restoreBackup: (exerciseId: string) => void;
  legacyOf: (exerciseId: string) => LegacyInfo | null;
  importLegacy: (exerciseId: string) => Promise<void>;
  dismissLegacy: (exerciseId: string) => void;
  reload: () => Promise<void>;
};

export const PracticeSyncContext = React.createContext<PracticeSync | null>(null);
/** Nulo na demonstração (tudo só neste navegador). */
export const usePracticeSync = () => React.useContext(PracticeSyncContext);
