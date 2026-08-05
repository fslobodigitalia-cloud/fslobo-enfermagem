import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { brand } from "@/config/site";
import { useDocumentMeta } from "@/lib/seo";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { AdminStatusScreen } from "@/components/admin/AdminStatusScreen";
import { Logo } from "@/components/common/Logo";
import { CosmicBackdrop } from "@/components/common/CosmicBackdrop";
import { StarField } from "@/components/common/StarField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface AdminLoginLocationState {
  from?: { pathname?: string };
}

/**
 * Login exclusivo da equipe interna. Não há cadastro, convite, login
 * social, recuperação de senha ou magic link aqui — apenas e-mail + senha
 * contra o Supabase Auth, seguido da confirmação de administrador feita
 * inteiramente dentro de AdminAuthContext.
 */
export default function AdminLoginPage() {
  useDocumentMeta({
    title: `Acesso administrativo | ${brand.name}`,
    description: "Área restrita à equipe autorizada da Entre Nós Tarô.",
    path: "/admin/login",
    noindex: true,
  });

  const { user, isAdmin, loading, signIn } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const redirectTo =
    (location.state as AdminLoginLocationState | null)?.from?.pathname || "/admin";

  // Verificação inicial da sessão ainda em curso: evita mostrar o formulário
  // por um instante para quem já está autenticado e autorizado.
  if (loading) {
    return <AdminStatusScreen message="Verificando sessão…" />;
  }

  // Já autenticado e autorizado: não faz sentido ver o login de novo.
  if (user && isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setErrorMessage(null);
    setSubmitting(true);

    const { error } = await signIn(email.trim(), password);

    setSubmitting(false);

    if (error) {
      setErrorMessage(error);
      return;
    }

    navigate(redirectTo, { replace: true });
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-[22px] py-16">
      <CosmicBackdrop variant="hero" />
      <StarField count={30} mobileCount={12} seed={19} />

      <div className="glass-strong relative z-10 w-full max-w-[420px] rounded-3xl px-7 py-10 sm:px-9">
        <div className="flex flex-col items-center text-center">
          <Logo size={52} />
          <h1 className="mt-7 font-display text-[1.75rem] leading-tight text-cream">
            Acesso administrativo
          </h1>
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-gold/80">
            Área restrita à equipe autorizada
          </p>
        </div>

        <form className="mt-9 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-email">E-mail</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(errorMessage)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-password">Senha</Label>
            <div className="relative">
              <Input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(errorMessage)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-dim transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div aria-live="assertive" className="min-h-[18px] text-[13px] text-red-300">
            {errorMessage}
          </div>

          <Button type="submit" full disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                Entrando…
              </>
            ) : (
              "Entrar no painel"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
