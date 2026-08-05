import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { AdminStatusScreen } from "./AdminStatusScreen";

/**
 * Protege qualquer conteúdo administrativo: só renderiza os `children`
 * quando há um usuário autenticado E confirmado como administrador via
 * `is_admin()`. Nos demais casos, redireciona para /admin/login, guardando
 * a URL original em `location.state.from` para retomar depois do login.
 */
export function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return <AdminStatusScreen message="Verificando sessão…" />;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
