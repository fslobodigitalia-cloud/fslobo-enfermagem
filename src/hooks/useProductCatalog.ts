import * as React from "react";
import { fetchActiveProductCatalog, type PublicCatalogProduct } from "@/lib/catalogQueries";

export type ProductCatalogState =
  | { status: "loading"; products: null }
  | { status: "error"; products: null }
  | { status: "success"; products: PublicCatalogProduct[] };

/**
 * Carrega o catálogo público (ver src/lib/catalogQueries.ts) uma vez por
 * montagem, com `retry()` para o botão "Tentar novamente". Nunca lança —
 * qualquer falha de rede/RPC vira status "error", tratado pela página.
 */
export function useProductCatalog(): ProductCatalogState & { retry: () => void } {
  const [state, setState] = React.useState<ProductCatalogState>({ status: "loading", products: null });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", products: null });

    fetchActiveProductCatalog().then((result) => {
      if (cancelled) return;
      setState(
        result.kind === "success"
          ? { status: "success", products: result.products }
          : { status: "error", products: null },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
}
