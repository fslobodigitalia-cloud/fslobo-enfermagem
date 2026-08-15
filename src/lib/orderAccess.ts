/**
 * Persistência local de acesso a um pedido de produto digital já criado —
 * public_id + checkout_access_token, isolados por productSlug em
 * localStorage (sobrevive ao fechamento do navegador, diferente da
 * tentativa de checkout em si — ver src/lib/checkoutAttempt.ts, que usa
 * sessionStorage e existe só ANTES do pedido ser criado).
 *
 * checkout_access_token nunca vai para a URL, nunca é logado — mesma
 * disciplina do resto do projeto. localStorage é o único lugar onde este
 * valor persiste no cliente, e só para permitir que a cliente feche a aba
 * enquanto aguarda o Pix e volte depois (mesmo dispositivo) sem perder o
 * acesso aos downloads.
 */

const STORAGE_PREFIX = "entre-nos-taro:order-access:";

export interface OrderAccess {
  publicId: string;
  checkoutAccessToken: string;
}

function storageKey(productSlug: string): string {
  return `${STORAGE_PREFIX}${productSlug}`;
}

export function saveOrderAccess(productSlug: string, access: OrderAccess): void {
  try {
    localStorage.setItem(storageKey(productSlug), JSON.stringify(access));
  } catch {
    // localStorage indisponível (ex.: modo privado restritivo) — o acesso
    // segue funcionando em memória durante esta sessão da página, só não
    // sobrevive a um recarregamento.
  }
}

export function readOrderAccess(productSlug: string): OrderAccess | null {
  try {
    const raw = localStorage.getItem(storageKey(productSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrderAccess>;
    if (typeof parsed.publicId !== "string" || typeof parsed.checkoutAccessToken !== "string") {
      return null;
    }
    return { publicId: parsed.publicId, checkoutAccessToken: parsed.checkoutAccessToken };
  } catch {
    return null;
  }
}

export function clearOrderAccess(productSlug: string): void {
  try {
    localStorage.removeItem(storageKey(productSlug));
  } catch {
    // ver nota acima.
  }
}
