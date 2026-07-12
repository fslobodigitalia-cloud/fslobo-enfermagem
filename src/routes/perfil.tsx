import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ShieldCheck, Newspaper, Bell, LogIn, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Perfil — FSlobo" }] }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").is("deleted_at", null).maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 pt-16 animate-fade-in text-center">
        <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-primary/10 grid place-items-center">
          <LogIn className="h-9 w-9 text-primary" />
        </div>
        <h1 className="text-xl font-extrabold text-foreground">Entre na sua conta</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Acesse pedidos, favoritos e materiais.
        </p>
        <Link
          to="/bem-vindo"
          className="mt-6 inline-flex rounded-2xl bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground shadow-md tap-scale"
        >
          Entrar ou cadastrar
        </Link>
      </div>
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Você saiu.");
    navigate({ to: "/" });
  }

  return (
    <div className="p-5 animate-fade-in">
      <h1 className="pt-4 text-[22px] font-extrabold text-foreground">Perfil</h1>
      <div className="mt-6 space-y-2">
        <Link to="/notificacoes" className="flex items-center gap-3 w-full rounded-2xl bg-card px-5 py-4 text-left text-[14px] font-semibold text-foreground shadow-[var(--shadow-card)] tap-scale">
          <Bell className="h-4 w-4 text-primary" /> Notificações
        </Link>
        <Link to="/blog" className="flex items-center gap-3 w-full rounded-2xl bg-card px-5 py-4 text-left text-[14px] font-semibold text-foreground shadow-[var(--shadow-card)] tap-scale">
          <Newspaper className="h-4 w-4 text-primary" /> Blog
        </Link>
        {isAdmin && (
          <Link to="/admin" className="flex items-center gap-3 w-full rounded-2xl bg-primary/10 text-primary px-5 py-4 text-left text-[14px] font-semibold tap-scale">
            <ShieldCheck className="h-4 w-4" /> Painel do administrador
          </Link>
        )}
        <a
          href="https://wa.me/5521979199008?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20FSlobo"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 w-full rounded-2xl bg-card px-5 py-4 text-left text-[14px] font-semibold text-foreground shadow-[var(--shadow-card)] tap-scale"
        >
          <MessageCircle className="h-4 w-4 text-primary" /> Ajuda e suporte (WhatsApp)
        </a>
        <button
          onClick={handleSignOut}
          className="w-full rounded-2xl bg-destructive/10 text-destructive px-5 py-4 text-left text-[14px] font-semibold tap-scale"
        >
          Sair
        </button>
      </div>
    </div>
  );
}