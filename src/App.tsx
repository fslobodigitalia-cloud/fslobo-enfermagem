import * as React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { captureCampaignParams } from "@/lib/utmTracking";
import { pendingConfigFields } from "@/config/site";

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
      <Routes>
        {/* Home pública = a mesma landing do Guia de Evolução de
            Enfermagem, servida também em /guia-evolucao-enfermagem (mesmo
            componente, duas rotas) — ver canonical fixo em "/" dentro de
            GuiaEvolucaoEnfermagemPage.tsx. */}
        <Route path="/" element={<GuiaEvolucaoEnfermagemPage />} />
        <Route path="/guia-evolucao-enfermagem" element={<GuiaEvolucaoEnfermagemPage />} />
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/termos" element={<Terms />} />
        <Route path="/entrega" element={<Delivery />} />
        <Route path="/reembolso" element={<Refund />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
