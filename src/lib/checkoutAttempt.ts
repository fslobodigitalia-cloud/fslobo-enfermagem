/**
 * IDs seguros de uma tentativa de checkout Pix.
 *
 * checkout_request_id (UUID) e checkout_access_token (64 caracteres hex,
 * 32 bytes aleatórios) são gerados uma única vez por tentativa de compra e
 * reaproveitados em todo retry da MESMA tentativa (mesmo pacote, mesmos
 * dados) — é o que permite a Edge Function create-pix-order recuperar o
 * mesmo pedido em vez de criar um novo a cada nova chamada. Uma nova
 * compra (explicitamente iniciada pela cliente, ex.: "Fazer um novo
 * pedido") sempre gera valores novos.
 *
 * checkout_access_token NUNCA é exibido na interface nem registrado em
 * log/analytics — existe só para acompanhar checkout_request_id nas
 * chamadas à Edge Function.
 */
import * as React from "react";

const STORAGE_PREFIX = "entre-nos-taro:checkout-attempt:";

export interface CheckoutAttempt {
  checkoutRequestId: string;
  checkoutAccessToken: string;
}

function generateCheckoutAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function createAttempt(): CheckoutAttempt {
  return {
    checkoutRequestId: crypto.randomUUID(),
    checkoutAccessToken: generateCheckoutAccessToken(),
  };
}

function storageKey(packageSlug: string): string {
  return `${STORAGE_PREFIX}${packageSlug}`;
}

function readStoredAttempt(packageSlug: string): CheckoutAttempt | null {
  try {
    const raw = sessionStorage.getItem(storageKey(packageSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutAttempt>;
    if (typeof parsed.checkoutRequestId !== "string" || typeof parsed.checkoutAccessToken !== "string") {
      return null;
    }
    return { checkoutRequestId: parsed.checkoutRequestId, checkoutAccessToken: parsed.checkoutAccessToken };
  } catch {
    return null;
  }
}

function writeStoredAttempt(packageSlug: string, attempt: CheckoutAttempt): void {
  try {
    sessionStorage.setItem(storageKey(packageSlug), JSON.stringify(attempt));
  } catch {
    // sessionStorage indisponível (ex.: modo privado restritivo) — a
    // tentativa segue funcionando em memória durante esta sessão do
    // componente, só não sobrevive a um recarregamento da página.
  }
}

function clearStoredAttempt(packageSlug: string): void {
  try {
    sessionStorage.removeItem(storageKey(packageSlug));
  } catch {
    // ver nota acima.
  }
}

/**
 * Devolve os IDs da tentativa de checkout ATUAL para este pacote — cria e
 * persiste na primeira chamada, reaproveita em toda renderização seguinte
 * (inclusive depois de um retry ou de um recarregamento de página).
 * resetAttempt() descarta a tentativa atual e gera uma nova, para quando a
 * cliente inicia explicitamente uma nova compra.
 */
export function useCheckoutAttempt(packageSlug: string): {
  attempt: CheckoutAttempt;
  resetAttempt: () => void;
} {
  const [attempt, setAttempt] = React.useState<CheckoutAttempt>(() => {
    const stored = readStoredAttempt(packageSlug);
    if (stored) return stored;
    const created = createAttempt();
    writeStoredAttempt(packageSlug, created);
    return created;
  });

  const resetAttempt = React.useCallback(() => {
    clearStoredAttempt(packageSlug);
    const created = createAttempt();
    writeStoredAttempt(packageSlug, created);
    setAttempt(created);
  }, [packageSlug]);

  return { attempt, resetAttempt };
}
