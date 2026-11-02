import * as React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Info } from "lucide-react";
import { ENV_LABEL } from "../config";
import { AuthProvider, useAuth } from "./auth";
import AuthScreen, { AuthLayout } from "./AuthScreen";
import ResetPasswordScreen from "./ResetPasswordScreen";
import RemoteHome from "./RemoteHome";
import RemoteQuestions from "./RemoteQuestions";
import RemotePractice from "./RemotePractice";
import RemoteProfile from "./RemoteProfile";
import RemoteReview from "./RemoteReview";

/** Entra só com sessão válida; senão manda para /app/entrar (o destino fica em memória, não na URL). */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const loc = useLocation();
  if (auth.status === "loading") {
    return (
      <div className="fsl-app" data-mode="real">
        <p className="fsl-loading" role="status">Carregando…</p>
      </div>
    );
  }
  if (auth.status === "signed_out") return <Navigate to="/app/entrar" replace state={{ from: loc.pathname }} />;
  if (auth.profileError) {
    return (
      <AuthLayout>
        <section className="fsl-auth-card">
          <h1 className="fsl-display fsl-display-l">Não foi possível abrir seu perfil</h1>
          <p className="fsl-auth-text">Houve um problema ao carregar sua conta. Recarregue a página e tente de novo.</p>
          <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={() => window.location.reload()}>Recarregar</button>
        </section>
      </AuthLayout>
    );
  }
  if (!auth.profile) {
    return (
      <div className="fsl-app" data-mode="real">
        <p className="fsl-loading" role="status">Preparando sua conta…</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Rotas da conta real: acesso, recuperação de senha e as telas protegidas. */
export default function RemoteApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="entrar" element={<AuthLayout><AuthScreen /></AuthLayout>} />
        <Route path="redefinir-senha" element={<AuthLayout><ResetPasswordScreen /></AuthLayout>} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <AppShell
                demo={false}
                sideNote="Sua conta. Pontos e histórico calculados e guardados no servidor."
                banner={
                  ENV_LABEL ? (
                    <p className="fsl-modebar is-env" role="note">
                      <Info size={18} aria-hidden="true" /> Ambiente de {ENV_LABEL.toLocaleLowerCase("pt-BR")}: use somente dados fictícios.
                    </p>
                  ) : null
                }
              >
                <Routes>
                  <Route index element={<RemoteHome />} />
                  <Route path="questoes" element={<RemoteQuestions />} />
                  <Route path="pratica/*" element={<RemotePractice />} />
                  <Route path="perfil" element={<RemoteProfile />} />
                  <Route path="revisao" element={<RemoteReview />} />
                  <Route path="*" element={<Navigate to="/app" replace />} />
                </Routes>
              </AppShell>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
