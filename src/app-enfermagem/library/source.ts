import * as React from "react";
import { DEMO_LIBRARY } from "./demoModels";
import type { Library } from "./types";

/**
 * Origem do acervo. Hoje só existe a empacotada (DEMONSTRATIVA). A origem real virá do backend (RPCs de leitura que devolvem só modelos
 * publicados; ver supabase-app/docs/biblioteca-modelos-proposta.md) e terá a mesma forma: `load()` assíncrono que devolve uma Library.
 * NADA aqui chama o servidor, e nenhum texto de e-book entra no código.
 */
export interface LibrarySource {
  /** Acervo já disponível de forma síncrona (origem empacotada); a origem remota não terá. */
  initial?: Library;
  load(): Promise<Library>;
}

export const bundledDemoSource: LibrarySource = { initial: DEMO_LIBRARY, load: async () => DEMO_LIBRARY };

const activeSource: LibrarySource = bundledDemoSource;

export type LibraryState = { status: "loading" | "ready" | "error"; library: Library | null };

export function useLibrary(source: LibrarySource = activeSource): LibraryState {
  const [state, setState] = React.useState<LibraryState>(() =>
    source.initial ? { status: "ready", library: source.initial } : { status: "loading", library: null },
  );
  React.useEffect(() => {
    if (source.initial) return;
    let alive = true;
    source.load().then(
      (library) => alive && setState({ status: "ready", library }),
      () => alive && setState({ status: "error", library: null }),
    );
    return () => {
      alive = false;
    };
  }, [source]);
  return state;
}
