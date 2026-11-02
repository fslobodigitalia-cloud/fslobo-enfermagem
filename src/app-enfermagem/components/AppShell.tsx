import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, RotateCcw, User, X } from "lucide-react";
import { BarChart3, House } from "./icons";
import { Brand } from "./Brand";
import { useDemo } from "../demoState";
import { useBase } from "../base";

type ShellCtx = { openSettings: () => void };
const ShellContext = React.createContext<ShellCtx>({ openSettings: () => {} });
export const useShell = () => React.useContext(ShellContext);

function NavItems({ className }: { className: string }) {
  const base = useBase();
  const pathname = useLocation().pathname.replace(/\/+$/, "") || "/";
  const items = [
    { to: base, label: "Início", Icon: House, end: true },
    { to: `${base}/questoes`, label: "Questões", Icon: FileText, end: false },
    { to: `${base}/pratica`, label: "Prática", Icon: BarChart3, end: false },
    { to: `${base}/perfil`, label: "Perfil", Icon: User, end: false },
  ];
  return (
    <>
      {items.map(({ to, label, Icon, end }) => {
        const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`${className}${active ? " is-active" : ""}`}
          >
            <Icon size={26} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </>
  );
}

/** Diálogo de configurações da DEMONSTRAÇÃO (reiniciar os dados locais). Só existe no modo demo. */
function DemoSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [confirmReset, setConfirmReset] = React.useState(false);
  const { reset } = useDemo();
  const navigate = useNavigate();
  const base = useBase();

  const doReset = () => {
    reset();
    setConfirmReset(false);
    onOpenChange(false);
    navigate(base);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setConfirmReset(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fsl-overlay" />
        <Dialog.Content className="fsl-dialog fsl-app-portal">
          <Dialog.Close className="fsl-dialog-x" aria-label="Fechar">
            <X size={22} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="fsl-dialog-title">Configurações da demonstração</Dialog.Title>
          <Dialog.Description className="fsl-dialog-text">
            Esta é uma versão de demonstração do app. O perfil, os pontos, o ranking e as questões são
            ilustrativos e o conteúdo está sujeito a revisão editorial antes de qualquer lançamento. O
            progresso fica salvo apenas neste navegador.
          </Dialog.Description>
          {confirmReset ? (
            <div className="fsl-dialog-confirm" role="alert">
              <p>Apagar respostas, textos e progresso salvos neste navegador?</p>
              <div className="fsl-dialog-actions">
                <button type="button" className="fsl-btn fsl-btn-outline" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
                <button type="button" className="fsl-btn fsl-btn-navy" onClick={doReset}>
                  Sim, reiniciar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="fsl-btn fsl-btn-navy" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={20} aria-hidden="true" /> Reiniciar demonstração
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ShellProps = {
  children: React.ReactNode;
  /** true = demonstração (dados ilustrativos locais); false = conta real. */
  demo?: boolean;
  /** Faixa de aviso no topo do conteúdo (ambiente de homologação, demonstração...). */
  banner?: React.ReactNode;
  /** Texto fixo do rodapé da barra lateral (desktop). */
  sideNote?: string;
};

export function AppShell({ children, demo = true, banner, sideNote }: ShellProps) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [typing, setTyping] = React.useState(false);

  // Esconde a navegação inferior enquanto um campo de texto está em foco, para
  // não ficar entre o campo e o teclado virtual.
  React.useEffect(() => {
    // Só campos que abrem o teclado: rádios e checkboxes não contam (esconder a
    // barra ao focá-los move o layout entre o toque e o clique e perde o toque).
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && /^(text|search|email|tel|url|number|password)$/.test(el.type));
    const onIn = (e: FocusEvent) => isField(e.target) && setTyping(true);
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const ctx = React.useMemo(() => ({ openSettings: () => setSettingsOpen(true) }), []);

  return (
    <ShellContext.Provider value={ctx}>
      <div className="fsl-app" data-typing={typing ? "true" : "false"} data-mode={demo ? "demo" : "real"}>
        <a href="#fsl-conteudo" className="fsl-skip">
          Pular para o conteúdo
        </a>

        <aside className="fsl-side" aria-label="Navegação do app">
          <Brand />
          <nav className="fsl-side-nav" aria-label="Seções do app">
            <NavItems className="fsl-side-link" />
          </nav>
          <div className="fsl-side-foot">
            <p>{sideNote ?? "Demonstração com dados ilustrativos. Nada aqui é dado real da plataforma."}</p>
            {demo ? (
              <button type="button" className="fsl-link-btn" onClick={() => setSettingsOpen(true)}>
                <RotateCcw size={16} aria-hidden="true" /> Reiniciar demonstração
              </button>
            ) : null}
          </div>
        </aside>

        <div className="fsl-main">
          {banner}
          <main id="fsl-conteudo" className="fsl-content" tabIndex={-1}>
            {children}
          </main>
        </div>

        <nav className="fsl-tabbar" aria-label="Seções do app">
          <NavItems className="fsl-tab" />
        </nav>

        {demo ? <DemoSettings open={settingsOpen} onOpenChange={setSettingsOpen} /> : null}
      </div>
    </ShellContext.Provider>
  );
}
