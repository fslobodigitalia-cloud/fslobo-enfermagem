import { Logo } from "@/components/common/Logo";
import { CosmicBackdrop } from "@/components/common/CosmicBackdrop";

/**
 * Tela mínima usada enquanto a sessão administrativa está sendo verificada
 * (carregamento inicial, troca de aba, expiração). Mantém o mesmo fundo
 * cinematográfico do restante do site em vez de um spinner genérico.
 */
export function AdminStatusScreen({ message }: { message: string }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-[22px] text-center">
      <CosmicBackdrop variant="section" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Logo size={44} markOnly />
        <p
          role="status"
          aria-live="polite"
          className="text-[13px] uppercase tracking-[0.18em] text-dim"
        >
          {message}
        </p>
      </div>
    </main>
  );
}
