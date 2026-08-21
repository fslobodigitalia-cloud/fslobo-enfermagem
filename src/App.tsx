import * as React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { captureCampaignParams } from "@/lib/utmTracking";
import { pendingConfigFields } from "@/config/site";
import { CartProvider } from "@/context/CartContext";

import MaterialsPage from "@/pages/MaterialsPage";
import ProductPage from "@/pages/ProductPage";
import CartPage from "@/pages/CartPage";
import GuiaEvolucaoEnfermagemPage from "@/pages/GuiaEvolucaoEnfermagemPage";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Delivery from "@/pages/Delivery";
import Refund from "@/pages/Refund";
import NotFound from "@/pages/NotFound";

export default function App() {
  React.useEffect(() => {
    captureCampaignParams();

    // Pausa animações quando a aba fica inativa (ver regra em index.css).
    const onVisibility = () => {
      document.documentElement.dataset.pageHidden = document.hidden ? "true" : "false";
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    if (import.meta.env.DEV) {
      const pending = pendingConfigFields();
      if (pending.length > 0) {
        console.warn(
          "[FSLobo Enfermagem] Campos pendentes em src/config/site.ts:\n  - " + pending.join("\n  - "),
        );
      }
    }

    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <BrowserRouter>
      {/* CartProvider envolve todas as rotas: o carrinho (estado +
          localStorage, ver src/context/CartContext.tsx) precisa sobreviver
          à navegação entre "/", "/produto/:slug" e "/carrinho", e o
          SiteHeader (usado por essas páginas e também pelo Guia) lê o
          contador/drawer do carrinho independentemente da rota atual. */}
      <CartProvider>
        <Routes>
          {/* A Home institucional separada foi removida: "/" e "/materiais"
              servem o mesmo componente (MaterialsPage), o catálogo passou a
              ser a página principal do site. Ver canonical fixo em "/" dentro
              de MaterialsPage.tsx. */}
          <Route path="/" element={<MaterialsPage />} />
          <Route path="/materiais" element={<MaterialsPage />} />
          <Route path="/produto/:slug" element={<ProductPage />} />
          <Route path="/carrinho" element={<CartPage />} />
          <Route path="/guia-evolucao-enfermagem" element={<GuiaEvolucaoEnfermagemPage />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/termos" element={<Terms />} />
          <Route path="/entrega" element={<Delivery />} />
          <Route path="/reembolso" element={<Refund />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}
