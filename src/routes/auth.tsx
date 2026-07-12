import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Loader2, Mail, Lock } from "lucide-react";
import { fbqTrack } from "@/lib/fbq";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — FSlobo Enfermagem" }] }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/perfil" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        fbqTrack("Lead", { method: "email" });
        navigate({ to: "/perfil" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Complete seu perfil em Configurações.");
        fbqTrack("CompleteRegistration", { method: "email" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Enviamos um link de recuperação para seu e-mail.");
        setMode("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (r.error) throw r.error;
      if (!r.redirected) {
        fbqTrack("Lead", { method: "google" });
        fbqTrack("CompleteRegistration", { method: "google" });
        navigate({ to: "/perfil" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no login com Google");
      setLoading(false);
    }
  }

  return (
    <div className="p-5 pt-10 animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold text-foreground">FSlobo Enfermagem</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Estudos que salvam plantões</p>
      </div>

      <div className="flex rounded-2xl bg-muted p-1 mb-6">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition ${
              mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {m === "login" ? "Entrar" : "Cadastrar"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="E-mail" value={email} onChange={setEmail} required />
        {mode !== "forgot" && (
          <Field icon={<Lock className="h-4 w-4" />} type="password" placeholder="Senha" value={password} onChange={setPassword} required />
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground shadow-md tap-scale disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
        </button>
      </form>

      {mode === "login" && (
        <button
          type="button"
          onClick={() => setMode("forgot")}
          className="mt-3 w-full text-[12px] text-muted-foreground hover:text-foreground"
        >
          Esqueci minha senha
        </button>
      )}
      {mode === "forgot" && (
        <button
          type="button"
          onClick={() => setMode("login")}
          className="mt-3 w-full text-[12px] text-muted-foreground hover:text-foreground"
        >
          Voltar para login
        </button>
      )}

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full rounded-2xl bg-card border border-border py-3 text-[14px] font-semibold text-foreground shadow-sm tap-scale flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <GoogleIcon />
        Continuar com Google
      </button>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Ao continuar você concorda com nossos{" "}
        <Link to="/" className="underline">termos</Link>.
      </p>
    </div>
  );
}

function Field({
  icon, type = "text", placeholder, value, onChange, required,
}: {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3 focus-within:ring-2 focus-within:ring-primary/30">
      <span className="text-muted-foreground">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.3 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.6 35.8 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}