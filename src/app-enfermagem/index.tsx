import * as React from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Info } from "lucide-react";
import "./app.css";
import "./practice.css";
import { BaseProvider } from "./base";
import { REMOTE_CONFIGURED } from "./config";
import { DemoProvider } from "./demoState";
import { AppShell } from "./components/AppShell";
import { BrandMark } from "./components/Brand";
import HomeScreen from "./screens/HomeScreen";
import QuestionsScreen from "./screens/QuestionsScreen";
import PracticeScreen from "./screens/PracticeScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ReviewScreen from "./screens/ReviewScreen";

// A conta real (login, Supabase) fica em um pedaço separado: só é baixada nas rotas reais do /app.
// A demonstração (/app/demo) nunca carrega o cliente do Supabase.
const RemoteApp = React.lazy(() => import("./remote/RemoteApp"));

const TITLE = "FSLOBO Enfermagem · App";
const TITLE_DEMO = "FSLOBO Enfermagem · App (demonstração)";
const FONT_ID = "fsl-app-font-800";

/** Efeitos que valem só enquanto o /app está montado: título, noindex e peso 800 da fonte. */
function useAppDocument(title: string) {
  React.useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    robots.dataset.fslApp = "true";
    document.head.appendChild(robots);
    // O index.html já traz "index, follow": neutraliza enquanto estiver no app.
    const original = document.querySelector<HTMLMetaElement>('meta[name="robots"]:not([data-fsl-app])');
    const originalContent = original?.content;
    if (original) original.content = "noindex, nofollow";

    let font = document.getElementById(FONT_ID) as HTMLLinkElement | null;
    if (!font) {
      font = document.createElement("link");
      font.id = FONT_ID;
      font.rel = "stylesheet";
      font.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@800&display=swap";
      document.head.appendChild(font);
    }

    return () => {
      document.title = prevTitle;
      robots.remove();
      if (original && originalContent !== undefined) original.content = originalContent;
      document.getElementById(FONT_ID)?.remove();
    };
  }, [title]);
}

/** Demonstração: dados ilustrativos, só neste navegador, sempre identificada e separada da conta. */
function DemoApp() {
  return (
    <BaseProvider value="/app/demo">
      <DemoProvider>
        <AppShell
          demo
          banner={
            <p className="fsl-modebar is-demo" role="note">
              <Info size={18} aria-hidden="true" />
              <span>
                Demonstração: dados ilustrativos, separados da sua conta.
                {REMOTE_CONFIGURED ? (
                  <>
                    {" "}
                    <Link to="/app" className="fsl-inline-link">Ir para a minha conta</Link>
                  </>
                ) : null}
              </span>
            </p>
          }
        >
          <Routes>
            <Route index element={<HomeScreen />} />
            <Route path="questoes" element={<QuestionsScreen />} />
            <Route path="pratica/*" element={<PracticeScreen />} />
            <Route path="perfil" element={<ProfileScreen />} />
            <Route path="revisao" element={<ReviewScreen />} />
            <Route path="*" element={<Navigate to="/app/demo" replace />} />
          </Routes>
        </AppShell>
      </DemoProvider>
    </BaseProvider>
  );
}

/** Build sem backend configurado (sem as variáveis VITE_APP_*): só a demonstração funciona. */
function NotConfigured() {
  return (
    <div className="fsl-app fsl-auth-page" data-mode="real">
      <main id="fsl-conteudo" className="fsl-auth" tabIndex={-1}>
        <div className="fsl-auth-brand">
          <BrandMark size={44} />
          <span className="fsl-brand-text">
            <span className="fsl-brand-name">FSLOBO</span>
            <span className="fsl-brand-sub">Enfermagem</span>
          </span>
        </div>
        <section className="fsl-auth-card" aria-labelledby="nc-titulo">
          <h1 id="nc-titulo" className="fsl-display fsl-display-l">App ainda não conectado</h1>
          <p className="fsl-auth-text">
            Esta versão não está conectada a um servidor, então não há contas nem histórico. Você pode conhecer o app na
            demonstração, que usa dados ilustrativos.
          </p>
          <Link to="/app/demo" className="fsl-btn fsl-btn-navy fsl-btn-block">Ver a demonstração</Link>
        </section>
      </main>
    </div>
  );
}

export default function AppEnfermagem() {
  const demo = useLocation().pathname.startsWith("/app/demo");
  useAppDocument(demo ? TITLE_DEMO : TITLE);
  return (
    <Routes>
      <Route path="demo/*" element={<DemoApp />} />
      <Route
        path="*"
        element={
          REMOTE_CONFIGURED ? (
            <React.Suspense
              fallback={
                <div className="fsl-app" data-mode="real">
                  <p className="fsl-loading" role="status">Carregando…</p>
                </div>
              }
            >
              <RemoteApp />
            </React.Suspense>
          ) : (
            <NotConfigured />
          )
        }
      />
    </Routes>
  );
}
