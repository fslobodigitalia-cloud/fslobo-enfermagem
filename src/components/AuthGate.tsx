import { Link } from "@tanstack/react-router";
import { Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  title?: string;
  description?: string;
  children: React.ReactNode;
};

export function AuthGate({
  title = "Recurso exclusivo para cadastrados",
  description = "Crie sua conta grátis em segundos para desbloquear este recurso.",
  children,
}: Props) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  }

  if (isAuthenticated) return <>{children}</>;

  return (
    <div className="p-6 pt-16 animate-fade-in text-center">
      <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-primary/10">
        <Lock className="h-9 w-9 text-primary" />
      </div>
      <h1 className="text-[20px] font-extrabold text-foreground">{title}</h1>
      <p className="mx-auto mt-2 max-w-[320px] text-[13px] text-muted-foreground">
        {description}
      </p>
      <Link
        to="/bem-vindo"
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-[14px] font-semibold text-primary-foreground shadow-md tap-scale"
      >
        Entrar ou cadastrar <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}