import * as React from "react";

/** Altura aproximada do cabeçalho fixo (SiteHeader, sticky top-0) + folga. */
const HEADER_OFFSET_PX = 76;

/**
 * Rola a página até o resultado do Pix UMA vez por pedido novo.
 *
 * `orderKey` é um identificador estável do resultado exibido (order.publicId) ou
 * null quando não há resultado. A rolagem só dispara quando a chave muda de
 * null/outro valor para uma chave ainda não rolada — polling, atualização de
 * estado, copiar o código e re-renders mantêm a mesma chave e não rolam de novo.
 * Quando o resultado some (null), a memória é zerada, de modo que um novo Pix
 * (inclusive após uma tentativa que falhou) rola novamente.
 *
 * Por que é necessário: ao gerar o Pix a página troca o conteúdo longo por um
 * painel curto, e o navegador só "prende" o scroll no fim do documento, deixando
 * o QR Code fora da área visível.
 *
 * Devolve a ref do contêiner do resultado. O foco vai para ele (tabIndex -1,
 * sem rolar) para leitores de tela, sem tirar o foco dos controles depois.
 */
export function useScrollToPixResult(orderKey: string | null) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const lastKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (orderKey === null) {
      lastKeyRef.current = null;
      return;
    }
    if (lastKeyRef.current === orderKey) return;
    lastKeyRef.current = orderKey;

    let outer = 0;
    let inner = 0;
    let done = false;
    // Dois quadros: espera o commit do DOM e o início da animação de entrada.
    outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        done = true;
        const element = containerRef.current;
        if (!element) return;

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const rect = element.getBoundingClientRect();
        const available = window.innerHeight - HEADER_OFFSET_PX;
        // Painel que cabe na tela: centraliza. Mais alto que a tela: alinha o topo
        // (o QR Code fica logo no início do painel).
        const offset = rect.height <= available ? (available - rect.height) / 2 : 8;
        const top = rect.top + window.scrollY - HEADER_OFFSET_PX - offset;

        window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
        element.focus({ preventScroll: true });
      });
    });

    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
      // Cancelado antes de rolar (ex.: StrictMode/desmontagem): libera a chave.
      if (!done) lastKeyRef.current = null;
    };
  }, [orderKey]);

  return containerRef;
}
