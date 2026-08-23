import * as React from "react";
import { useLocation } from "react-router-dom";

/**
 * Reseta o scroll para o topo a cada troca de ROTA — sem isso, o React
 * Router preserva a posição de scroll da página anterior ao navegar (ex.:
 * usuário rola a home, clica num produto, ProductPage abre no meio da
 * tela em vez de no topo). Roda em `useLayoutEffect` (antes do paint) para
 * nunca mostrar um "flash" da posição antiga antes de saltar pro topo.
 *
 * Se a navegação tiver um HASH (ex.: um link para "/#catalogo", usado por
 * src/components/tools/ToolsCta.tsx para levar de volta ao catálogo a
 * partir de outra rota), NUNCA força o topo — em vez disso tenta rolar até
 * o elemento com esse id. Troca de rota via History API (o que o React
 * Router usa) não dispara o scroll-to-anchor nativo do navegador de forma
 * confiável entre navegadores, por isso o `scrollIntoView` explícito
 * abaixo — sem ele, um link "/#catalogo" vindo de /ferramentas/... só
 * trocaria de rota sem rolar até a seção.
 *
 * Só reage a mudança de `pathname`/`hash` — trocar só a query string (ex.:
 * utm_* via withCampaignQuery, usada em quase todo Link do site) na MESMA
 * página nunca deveria re-rolar a tela.
 *
 * Sem scroll suave de propósito: `window.scrollTo(0, 0)` (assinatura de
 * dois argumentos) é sempre instantâneo, sem depender do valor
 * (não-padronizado em todos os browsers) "instant" em `ScrollToOptions`;
 * o `scrollIntoView` do hash usa `behavior: "auto"` pelo mesmo motivo.
 *
 * Montado uma única vez, direto dentro do <BrowserRouter> (ver App.tsx) —
 * não renderiza nada.
 */
export function ScrollToTop(): null {
  const { pathname, hash } = useLocation();

  React.useLayoutEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      const scrollToHash = () => {
        document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
      };
      scrollToHash();
      // Um frame de folga: numa troca de ROTA (não só de hash na mesma
      // página), o elemento alvo pode ainda não existir no DOM no exato
      // instante deste efeito — tenta de novo no próximo frame.
      const raf = requestAnimationFrame(scrollToHash);
      return () => cancelAnimationFrame(raf);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
