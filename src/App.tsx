import * as React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SelectionProvider } from "@/context/SelectionContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { ProtectedAdminRoute } from "@/components/admin/ProtectedAdminRoute";
import { captureCampaignParams } from "@/lib/utmTracking";
import { pendingConfigFields } from "@/config/site";

import Index from "@/pages/Index";
import ThemeReading from "@/pages/ThemeReading";
import QuickProductReading from "@/pages/QuickProductReading";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Delivery from "@/pages/Delivery";
import Refund from "@/pages/Refund";
import NotFound from "@/pages/NotFound";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";

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
          "[Entre Nós Tarô] Campos pendentes em src/config/site.ts:\n  - " + pending.join("\n  - "),
        );
      }
    }

    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <BrowserRouter>
      <SelectionProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/leituras/:slug" element={<ThemeReading />} />
          <Route path="/experiencias/:slug" element={<QuickProductReading />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/termos" element={<Terms />} />
          <Route path="/entrega" element={<Delivery />} />
          <Route path="/reembolso" element={<Refund />} />

          {/*
            Área administrativa: um único AdminAuthProvider para todo o
            subtree /admin/* — login e painel compartilham a mesma sessão
            em memória, sem remontar o contexto (e sem refazer a verificação
            de is_admin) ao navegar entre /admin/login e /admin.
          */}
          <Route
            path="/admin/*"
            element={
              <AdminAuthProvider>
                <Routes>
                  <Route path="login" element={<AdminLoginPage />} />
                  <Route
                    index
                    element={
                      <ProtectedAdminRoute>
                        <AdminDashboardPage />
                      </ProtectedAdminRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </AdminAuthProvider>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </SelectionProvider>
    </BrowserRouter>
  );
}
