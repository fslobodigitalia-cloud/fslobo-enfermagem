import * as React from "react";
import { LogOut } from "lucide-react";
import { brand } from "@/config/site";
import { useDocumentMeta } from "@/lib/seo";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Logo } from "@/components/common/Logo";
import { CosmicBackdrop } from "@/components/common/CosmicBackdrop";
import { StarField } from "@/components/common/StarField";
import { Button } from "@/components/ui/button";

/**
 * Painel administrativo provisório. Nesta etapa só confirma que a
 * autenticação + verificação de administrador funcionaram — o CRM de
 * pedidos, leituras e aprovações chega em etapas futuras.
 */
export default function AdminDashboardPage() {
  useDocumentMeta({
    title: `Painel administrativo | ${brand.name}`,
    description: "Painel interno da equipe Entre Nós Tarô.",
    path: "/admin",
    noindex: true,
  });

  const { user, signOut } = useAdminAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-[22px] py-14">
      <CosmicBackdrop variant="section" />
      <StarField count={20} mobileCount={8} seed={31} />

      <div className="relative z-10 mx-auto flex max-w-shell flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo size={40} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? "Saindo…" : "Sair"}
          </Button>
        </header>

        <div className="glass rounded-3xl px-7 py-10 sm:px-9">
          <h1 className="font-display text-[clamp(1.75rem,5vw,2.5rem)] text-cream">
            Painel Entre Nós Tarô
          </h1>
          <p className="mt-3 text-[15px] text-dim">
            Autenticação concluída. Sessão administrativa ativa para:
          </p>
          <p className="mt-1 text-[16px] font-semibold text-gold">{user?.email}</p>

          <div className="mt-10 rounded-2xl border border-dashed border-gold/25 bg-white/[0.02] px-6 py-10 text-center text-dim">
            <p className="mx-auto max-w-[46ch] text-[14px] leading-relaxed">
              Esta área vai receber, nas próximas etapas, o painel de pedidos, geração de
              rascunhos, aprovação e liberação de leituras.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
