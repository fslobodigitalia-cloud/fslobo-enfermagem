import * as React from "react";

/**
 * Carrinho multiproduto — Etapa 2 (frontend). Estado 100% de UX/apresentação:
 * cada CartItem guarda só o necessário para desenhar a lista (nome, preço,
 * capa, categoria). O preço aqui NUNCA é enviado como fonte de cobrança —
 * na criação do pedido (src/lib/productCheckout.ts, não alterado por este
 * arquivo) só os slugs são enviados; quem calcula o valor real é sempre o
 * backend (RPC create_or_get_product_order_with_items_efi), que já aceita
 * 1 ou mais produtos kind='primary' desde a Etapa 1.
 *
 * Este contexto também guarda o estado aberto/fechado do drawer do
 * carrinho (isOpen/openCart/closeCart) — evita um segundo Context só para
 * isso, já que SiteHeader, ProductPage, ProductCard e o próprio drawer
 * precisam ler/escrever esse único booleano.
 *
 * Persistência: localStorage, mesma disciplina defensiva de
 * src/lib/orderAccess.ts (try/catch em toda leitura/escrita — nunca quebra
 * a UI se o storage estiver indisponível, ex.: modo privado restritivo).
 * Nada disto toca checkoutAttempt.ts/orderAccess.ts — o carrinho é só a
 * ETAPA de montar a lista de slugs; a chave usada por eles no checkout do
 * carrinho é a string constante "cart" (ver src/pages/CartPage.tsx),
 * completamente distinta da chave do Guia (guiaEvolucaoProduct.slug) — as
 * duas nunca colidem.
 */

const STORAGE_KEY = "fslobo:cart:v1";

export interface CartItem {
  slug: string;
  name: string;
  /** Só para exibição (lista do carrinho, drawer, resumo). Nunca é a fonte
   * de verdade da cobrança — ver nota de topo deste arquivo. */
  priceCents: number;
  coverUrl: string | null;
  category: string | null;
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  addItem: (item: CartItem) => void;
  removeItem: (slug: string) => void;
  hasItem: (slug: string) => boolean;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = React.createContext<CartContextValue | null>(null);

function isCartItem(value: unknown): value is CartItem {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.slug === "string" &&
    record.slug.length > 0 &&
    typeof record.name === "string" &&
    typeof record.priceCents === "number" &&
    (record.coverUrl === null || typeof record.coverUrl === "string") &&
    (record.category === null || typeof record.category === "string")
  );
}

function readStoredItems(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem);
  } catch {
    // localStorage indisponível/corrompido — carrinho começa vazio, nunca quebra a UI.
    return [];
  }
}

function writeStoredItems(items: CartItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Sem persistência disponível — o carrinho segue funcionando em
    // memória durante esta sessão da página, só não sobrevive a um reload.
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartItem[]>(() => readStoredItems());
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    writeStoredItems(items);
  }, [items]);

  const addItem = React.useCallback((item: CartItem) => {
    setItems((prev) => {
      // Impede duplicado: um slug já presente nunca é adicionado de novo
      // (o backend também rejeitaria produto repetido, mas isso já evita a
      // chamada precisar existir).
      if (prev.some((existing) => existing.slug === item.slug)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = React.useCallback((slug: string) => {
    setItems((prev) => prev.filter((item) => item.slug !== slug));
  }, []);

  const hasItem = React.useCallback((slug: string) => items.some((item) => item.slug === slug), [items]);

  const clearCart = React.useCallback(() => {
    setItems([]);
  }, []);

  const openCart = React.useCallback(() => setIsOpen(true), []);
  const closeCart = React.useCallback(() => setIsOpen(false), []);

  const itemCount = items.length;
  const subtotalCents = React.useMemo(() => items.reduce((sum, item) => sum + item.priceCents, 0), [items]);

  const value = React.useMemo<CartContextValue>(
    () => ({ items, itemCount, subtotalCents, addItem, removeItem, hasItem, clearCart, isOpen, openCart, closeCart }),
    [items, itemCount, subtotalCents, addItem, removeItem, hasItem, clearCart, isOpen, openCart, closeCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart() precisa estar dentro de <CartProvider>.");
  return ctx;
}
