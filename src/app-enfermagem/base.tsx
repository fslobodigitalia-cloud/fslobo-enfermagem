import * as React from "react";

/**
 * Caminho-base das telas: "/app" na conta real e "/app/demo" na demonstração.
 * Assim as mesmas telas e links valem nos dois modos sem misturar os dados.
 */
const BaseContext = React.createContext("/app");
export const BaseProvider = BaseContext.Provider;
export const useBase = () => React.useContext(BaseContext);

/** p("/questoes") -> "/app/questoes" (real) ou "/app/demo/questoes" (demonstração). */
export function useP() {
  const base = useBase();
  return React.useCallback((path = "") => base + path, [base]);
}
