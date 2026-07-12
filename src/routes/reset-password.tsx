import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nova senha — FSlobo" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada!");
      navigate({ to: "/perfil" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-5 pt-10 animate-fade-in">
      <h1 className="text-2xl font-extrabold text-foreground text-center mb-2">Definir nova senha</h1>
      <p className="text-[13px] text-muted-foreground text-center mb-6">
        Escolha uma senha forte para sua conta.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <input
            type="password"
            placeholder="Nova senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="flex-1 bg-transparent text-[14px] outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground shadow-md tap-scale disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </button>
      </form>
    </div>
  );
}