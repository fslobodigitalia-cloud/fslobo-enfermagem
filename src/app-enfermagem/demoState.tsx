import * as React from "react";
import { DEMO_QUESTIONS } from "./data/questions";
import { clearAllPractice } from "./practiceStore";

/**
 * Estado DEMONSTRATIVO do app. Persistido só neste navegador, em chave própria
 * (não toca no carrinho, nos pedidos nem nas chaves de campanha da loja).
 */
export const DEMO_STORAGE_KEY = "fslobo_app_demo_v1";

export type Answer = { choice: string; confirmed: boolean };

export type DemoState = {
  index: number;
  answers: Record<string, Answer>;
  completed: boolean;
  bookmarks: string[];
};

export const INITIAL_STATE: DemoState = {
  index: 0,
  answers: {},
  completed: false,
  bookmarks: [],
};

function load(): DemoState {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    // Campos antigos da Prática (mode, drafts, compared, checks), se existirem, são ignorados:
    // a Prática agora guarda os textos em chave própria (practiceStore) e não conta pontos.
    return {
      index: parsed.index ?? INITIAL_STATE.index,
      answers: parsed.answers ?? INITIAL_STATE.answers,
      completed: parsed.completed ?? INITIAL_STATE.completed,
      bookmarks: parsed.bookmarks ?? INITIAL_STATE.bookmarks,
    };
  } catch {
    return INITIAL_STATE;
  }
}

function save(state: DemoState) {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* armazenamento indisponível: a demonstração segue só em memória */
  }
}

type Ctx = {
  state: DemoState;
  update: (patch: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) => void;
  reset: () => void;
};

const DemoContext = React.createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DemoState>(load);

  const update: Ctx["update"] = React.useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      save(next);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* ignora */
    }
    clearAllPractice();
    setState(INITIAL_STATE);
  }, []);

  const value = React.useMemo(() => ({ state, update, reset }), [state, update, reset]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): Ctx {
  const ctx = React.useContext(DemoContext);
  if (!ctx) throw new Error("useDemo fora do DemoProvider");
  return ctx;
}

/** Valores derivados (pontos, treinos, semana) a partir do estado. */
export function useDerived() {
  const { state } = useDemo();
  return React.useMemo(() => {
    const confirmed = DEMO_QUESTIONS.filter((q) => state.answers[q.id]?.confirmed);
    const correct = confirmed.filter((q) => state.answers[q.id].choice === q.correct);
    const wrong = confirmed.filter((q) => state.answers[q.id].choice !== q.correct);
    // A aba Prática (anotação e evolução) NÃO conta pontos nem altera o ranking.
    const points = 320 + correct.length * 10 + (state.completed ? 20 : 0);
    return {
      confirmed,
      correct,
      wrong,
      points,
      treinos: 12 + (state.completed ? 1 : 0),
      studyDays: 4 + (state.completed ? 1 : 0),
      weekDone: 3 + (state.completed ? 1 : 0),
    };
  }, [state]);
}
