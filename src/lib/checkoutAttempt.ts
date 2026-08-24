/**
 * IDs seguros de uma tentativa de checkout Pix.
 *
 * checkout_request_id (UUID) e checkout_access_token (64 caracteres hex,
 * 32 bytes aleatórios) são gerados uma única vez por tentativa de compra e
 * reaproveitados em todo retry da MESMA tentativa (mesmo pacote, mesmos
 * dados) — é o que permite a Edge Function create-product-order recuperar
 * o mesmo pedido em vez de criar um novo a cada nova chamada.
 *
 * "Mesma tentativa" é decidido por um FINGERPRINT do conteúdo exato do
 * pedido (nome normalizado + e-mail normalizado + product_slugs únicos e
 * ordenados) — nunca só pelo slug do produto principal. Isso é o que
 * garante que marcar/desmarcar um order bump, ou corrigir nome/e-mail
 * DEPOIS de já ter enviado uma tentativa, gera um checkout_request_id (e
 * checkout_access_token) NOVO antes do próximo envio — a RPC
 * create_or_get_product_order_with_items_efi rejeita com "checkout
 * conflict" (409) um checkout_request_id reaproveitado com product_slugs,
 * nome, e-mail ou access_token diferentes do que foi usado da primeira
 * vez; corrigido em 2026-08. Um retry idêntico (ex.: erro de rede, sem
 * nenhum campo alterado) mantém o mesmo fingerprint e por isso reaproveita
 * os mesmos IDs, preservando a idempotência.
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

/** Dados que definem o CONTEÚDO de uma tentativa de checkout — tudo que a
 *  RPC do backend exige que permaneça idêntico para reaproveitar um
 *  checkout_request_id já usado. */
export interface CheckoutAttemptInput {
  name: string;
  email: string;
  /** Slugs marcados nesta tentativa (produto principal + bumps). Duplicados
   *  e ordem não importam — normalizados internamente. */
  productSlugs: string[];
}

interface StoredAttempt extends CheckoutAttempt {
  fingerprint: string;
}

function generateCheckoutAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function createAttempt(fingerprint: string): StoredAttempt {
  return {
    checkoutRequestId: crypto.randomUUID(),
    checkoutAccessToken: generateCheckoutAccessToken(),
    fingerprint,
  };
}

function storageKey(packageSlug: string): string {
  return `${STORAGE_PREFIX}${packageSlug}`;
}

/**
 * Deve equivaler EXATAMENTE à normalização feita pela RPC no backend
 * (lower(btrim(customer_name))) — btrim só remove espaços das extremidades,
 * nunca colapsa espaços internos. Por isso "Maria  Silva" (dois espaços) e
 * "Maria Silva" (um espaço) são fingerprints DIFERENTES aqui, assim como
 * seriam nomes diferentes para a RPC.
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeProductSlugs(slugs: string[]): string[] {
  // Únicos + ordenados: a ORDEM em que os bumps foram marcados nunca deve
  // importar para a identidade da tentativa, só o CONJUNTO final de slugs.
  return Array.from(new Set(slugs.map((s) => s.trim()).filter((s) => s.length > 0))).sort();
}

/**
 * Fingerprint estável do conteúdo exato de uma tentativa de checkout: nome
 * normalizado + e-mail normalizado + product_slugs únicos e ordenados.
 * Duas chamadas com o mesmo fingerprint são a MESMA tentativa (mesmo
 * checkout_request_id); qualquer diferença é uma tentativa NOVA.
 */
export function computeCheckoutFingerprint(input: CheckoutAttemptInput): string {
  return JSON.stringify([normalizeName(input.name), normalizeEmail(input.email), normalizeProductSlugs(input.productSlugs)]);
}

function readStoredAttempt(packageSlug: string): StoredAttempt | null {
  try {
    const raw = sessionStorage.getItem(storageKey(packageSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAttempt>;
    if (
      typeof parsed.checkoutRequestId !== "string" ||
      typeof parsed.checkoutAccessToken !== "string" ||
      typeof parsed.fingerprint !== "string"
    ) {
      // Estado antigo (de antes do fingerprint existir, sem esse campo) ou
      // corrompido — descartado com segurança: ensureAttempt() gera uma
      // tentativa nova na próxima chamada, como se não houvesse nada salvo.
      return null;
    }
    return {
      checkoutRequestId: parsed.checkoutRequestId,
      checkoutAccessToken: parsed.checkoutAccessToken,
      fingerprint: parsed.fingerprint,
    };
  } catch {
    return null;
  }
}

function writeStoredAttempt(packageSlug: string, attempt: StoredAttempt): void {
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
 * Gerencia a identidade da tentativa de checkout ATUAL para este pacote.
 *
 * ensureAttempt(input) é chamado só no momento do envio (não a cada
 * keystroke) e devolve os IDs a usar:
 *   - existe uma tentativa salva com o MESMO fingerprint (mesmo nome
 *     normalizado + e-mail normalizado + product_slugs) → reaproveita
 *     checkout_request_id/checkout_access_token — cobre tanto um retry
 *     idêntico (ex.: erro de rede) quanto o reenvio automático de
 *     verificação, sem nunca gerar um ID novo para o MESMO payload;
 *   - fingerprint diferente (nome/e-mail corrigidos, bump marcado ou
 *     desmarcado depois de uma tentativa já enviada) ou nenhuma tentativa
 *     salva ainda → gera e persiste um par novo antes do próximo envio.
 *
 * resetAttempt() descarta a tentativa salva (ex.: cliente inicia
 * explicitamente uma nova compra) — a próxima chamada de ensureAttempt()
 * sempre gera valores novos, independentemente do fingerprint.
 */
export function useCheckoutAttempt(packageSlug: string): {
  ensureAttempt: (input: CheckoutAttemptInput) => CheckoutAttempt;
  resetAttempt: () => void;
} {
  const ensureAttempt = React.useCallback(
    (input: CheckoutAttemptInput): CheckoutAttempt => {
      const fingerprint = computeCheckoutFingerprint(input);
      const stored = readStoredAttempt(packageSlug);
      if (stored && stored.fingerprint === fingerprint) {
        return { checkoutRequestId: stored.checkoutRequestId, checkoutAccessToken: stored.checkoutAccessToken };
      }
      const created = createAttempt(fingerprint);
      writeStoredAttempt(packageSlug, created);
      return { checkoutRequestId: created.checkoutRequestId, checkoutAccessToken: created.checkoutAccessToken };
    },
    [packageSlug],
  );

  const resetAttempt = React.useCallback(() => {
    clearStoredAttempt(packageSlug);
  }, [packageSlug]);

  return { ensureAttempt, resetAttempt };
}
