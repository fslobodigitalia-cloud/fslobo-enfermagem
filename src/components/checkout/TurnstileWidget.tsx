/**
 * Widget do Cloudflare Turnstile — carrega o script oficial dinamicamente
 * (sem dependência npm extra) e renderiza o widget dentro de um container
 * próprio. Só a chave PÚBLICA (site key) passa por aqui; a secret key
 * nunca existe no frontend, só na Edge Function.
 *
 * reset() é uma recuperação REAL: se o widget já foi renderizado, só pede
 * um token novo (window.turnstile.reset); se o CARREGAMENTO DO SCRIPT
 * falhou antes disso (widget nunca chegou a existir), reset() refaz a
 * tentativa do zero — recarrega o script e renderiza o widget no mesmo
 * container. Isso é o que permite o botão "Tentar verificação novamente"
 * recuperar tanto um erro do widget quanto uma falha de carregamento do
 * script.
 */
import * as React from "react";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

// Estado module-level (compartilhado por todas as instâncias do widget na
// página) — só existe enquanto uma tentativa de carregamento do script
// está genuinamente em andamento ou já teve sucesso. Numa FALHA, os dois
// são limpos (ver catch em loadTurnstileScript) para que a PRÓXIMA
// chamada tente carregar de novo, do zero — nunca fica presa numa
// promise rejeitada para sempre.
let scriptLoadPromise: Promise<void> | null = null;
let scriptElement: HTMLScriptElement | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    scriptElement = script;
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;

    const handleLoad = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      reject(new Error("turnstile_script_error"));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Falha de carregamento: limpa o estado module-level (permite uma
    // PRÓXIMA tentativa real, disparada explicitamente pelo botão "Tentar
    // verificação novamente") e remove o <script> que falhou — nunca
    // deixa um elemento morto no <head> nem uma promise rejeitada presa.
    scriptLoadPromise = null;
    if (scriptElement && scriptElement.parentNode) {
      scriptElement.parentNode.removeChild(scriptElement);
    }
    scriptElement = null;
    throw error;
  });

  return scriptLoadPromise;
}

export interface TurnstileWidgetHandle {
  /**
   * Recuperação do widget — usada depois de cada tentativa de envio
   * (token de uso único) e pelo botão "Tentar verificação novamente":
   *   - se o widget já existe: pede um token novo (window.turnstile.reset);
   *   - se o widget NUNCA chegou a ser renderizado (ex.: o script externo
   *     falhou ao carregar): tenta de novo do zero — recarrega o script e
   *     renderiza o widget no mesmo container.
   * Nunca cria dois widgets no mesmo container nem roda depois que o
   * componente foi desmontado.
   */
  reset: () => void;
}

interface TurnstileWidgetProps {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
}

export const TurnstileWidget = React.forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, action, onToken, onExpire, onError }, ref) {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const widgetIdRef = React.useRef<string | null>(null);
    const mountedRef = React.useRef(false);

    const renderWidget = React.useCallback(async () => {
      try {
        await loadTurnstileScript();
      } catch {
        if (mountedRef.current) onError();
        return;
      }
      if (!mountedRef.current || !containerRef.current || !window.turnstile) return;

      // Nunca dois widgets no mesmo container: remove qualquer widget
      // anterior (ex.: de uma tentativa parcial) antes de renderizar um
      // novo.
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: (token: string) => {
          if (mountedRef.current) onToken(token);
        },
        "expired-callback": () => {
          if (mountedRef.current) onExpire();
        },
        "error-callback": () => {
          if (mountedRef.current) onError();
        },
      });
    }, [siteKey, action, onToken, onExpire, onError]);

    React.useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          // Widget já existe — só pede um token novo, sem recarregar nada.
          window.turnstile.reset(widgetIdRef.current);
          return;
        }
        // Widget nunca chegou a existir (ex.: falha de carregamento do
        // script) — tenta de novo do zero. Não é um loop automático: só
        // roda quando algo (o botão "Tentar verificação novamente")
        // chama reset() explicitamente.
        void renderWidget();
      },
    }));

    React.useEffect(() => {
      mountedRef.current = true;
      void renderWidget();

      return () => {
        mountedRef.current = false;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [renderWidget]);

    return <div ref={containerRef} className="flex justify-center" />;
  },
);
