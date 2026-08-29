import * as React from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { readOrderAccess } from "@/lib/orderAccess";
import { getOrderDownloads, downloadItemKey } from "@/lib/orderDownloads";
import { isMetaInAppIOSBrowser } from "@/lib/browserEnvironment";

/**
 * Botão reutilizável de download de um PDF privado — usado por todos os
 * fluxos de entrega (GuiaEvolucaoEnfermagemPage, MapasMentaisPage,
 * BalancoHidricoPage, ProductDownloads, CartDownloads).
 *
 * Correção do caso relatado de clientes recebendo o PDF "em branco": as
 * signed URLs do Supabase Storage expiram em 15 minutos
 * (SIGNED_URL_EXPIRES_IN_SECONDS em get-order-downloads/index.ts, não
 * alterado), mas o link antigo (`<a href={download.url}>`) ficava fixo na
 * tela desde o primeiro carregamento — se a cliente deixasse a aba aberta
 * e clicasse depois de 15 minutos, ou reabrisse via navegador interno do
 * Facebook/Instagram (que costuma reaproveitar/cachear a página), o
 * clique usava uma URL já vencida. Este componente NUNCA guarda a URL
 * recebida em atributo `href` permanente: a cada clique, chama
 * getOrderDownloads() de novo (mesmo endpoint, mesma autenticação por
 * public_id + checkout_access_token) para obter uma URL FRESCA, usada uma
 * única vez para iniciar aquele download.
 *
 * `orderAccessKey` é a mesma chave já usada por saveOrderAccess/
 * readOrderAccess (src/lib/orderAccess.ts) na página que renderiza este
 * botão — o slug do produto nas landings dedicadas e em ProductPage,
 * "cart" no carrinho — nunca inventada aqui, nunca um valor novo.
 *
 * `fileKey` identifica QUAL arquivo baixar dentro da resposta (um produto
 * pode entregar mais de um PDF) — sempre downloadItemKey(item, index)
 * (ver src/lib/orderDownloads.ts), calculada da mesma forma no momento em
 * que a lista é renderizada e de novo depois do refetch, para localizar o
 * mesmo arquivo mesmo com uma URL diferente a cada chamada.
 *
 * Nunca acrescenta fbclid/UTM/token do pedido à URL do arquivo — a URL
 * usada é exatamente a devolvida pelo backend, sem nenhuma modificação.
 */
export interface DownloadButtonProps {
  orderAccessKey: string;
  fileKey: string;
  label?: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

type Phase = "idle" | "loading" | "ready" | "error";

/** Mensagens amigáveis por código de erro — nunca a mensagem crua do servidor. */
const DOWNLOAD_ERROR_MESSAGES: Record<string, string> = {
  no_access: "Não foi possível localizar seu pedido neste navegador.",
  not_paid: "Não foi possível confirmar o pagamento agora.",
  file_not_found: "Não foi possível localizar este arquivo agora.",
  network_error: "Sem conexão no momento.",
};
const DEFAULT_ERROR_MESSAGE = "Não foi possível preparar o download agora.";

/**
 * Validade local da URL preparada no fluxo Meta + iOS (dois toques) — ver
 * item 6 do pedido. Depois desse prazo o link preparado é descartado do
 * estado (nunca fica fixo no DOM) e o botão volta para "Preparar PDF"; a
 * signed URL do backend em si expira em 15 minutos
 * (SIGNED_URL_EXPIRES_IN_SECONDS, não alterado), esse limite de 60s é só
 * quão longo deixamos o link tocável na tela antes de exigir uma URL nova.
 */
const PREPARED_URL_TTL_MS = 60_000;

export function DownloadButton({
  orderAccessKey,
  fileKey,
  label = "Baixar material",
  className,
  size = "sm",
  variant,
}: DownloadButtonProps) {
  // Calculado uma única vez por montagem (mesmo padrão de
  // InAppDownloadNotice) — a instância de navegador não muda de
  // User-Agent no meio da sessão.
  const [isMetaIOS] = React.useState(isMetaInAppIOSBrowser);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [preparedUrl, setPreparedUrl] = React.useState<string | null>(null);
  const expiryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiryTimeout = React.useCallback(() => {
    if (expiryTimeoutRef.current !== null) {
      clearTimeout(expiryTimeoutRef.current);
      expiryTimeoutRef.current = null;
    }
  }, []);

  // Limpa o timer ao desmontar — nunca deixa a URL preparada viva além do
  // componente.
  React.useEffect(() => clearExpiryTimeout, [clearExpiryTimeout]);

  async function fetchFreshDownloadUrl(): Promise<string | null> {
    const access = readOrderAccess(orderAccessKey);
    if (!access) {
      setPhase("error");
      setErrorCode("no_access");
      return null;
    }

    const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
    if (outcome.kind === "error") {
      setPhase("error");
      setErrorCode(outcome.code);
      return null;
    }
    if (outcome.kind === "waiting") {
      setPhase("error");
      setErrorCode("not_paid");
      return null;
    }

    const match = outcome.downloads.find((item, index) => downloadItemKey(item, index) === fileKey);
    if (!match) {
      setPhase("error");
      setErrorCode("file_not_found");
      return null;
    }

    return match.url;
  }

  async function handleClick() {
    if (phase === "loading") return;
    setPhase("loading");
    setErrorCode(null);

    const url = await fetchFreshDownloadUrl();
    if (url === null) return;

    // Dispara o download a partir da URL recém-gerada — <a> temporário,
    // criado, clicado e removido imediatamente num único uso. Nunca fica
    // em atributo href permanente na página, nunca é logada.
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener noreferrer";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setPhase("idle");
  }

  // Toque 1 (só Meta + iOS): busca a URL fresca e a guarda SOMENTE em
  // estado em memória — nunca em localStorage/sessionStorage, nunca
  // logada, nunca com parâmetro acrescentado. Não dispara link.click():
  // o WebView do Instagram/Facebook no iOS é conhecido por exibir/
  // compartilhar a URL em vez de abrir o PDF quando o clique é
  // programático.
  async function handlePrepare() {
    if (phase === "loading") return;
    setPhase("loading");
    setErrorCode(null);
    clearExpiryTimeout();
    setPreparedUrl(null);

    const url = await fetchFreshDownloadUrl();
    if (url === null) return;

    setPreparedUrl(url);
    setPhase("ready");
    expiryTimeoutRef.current = setTimeout(() => {
      setPreparedUrl(null);
      setPhase("idle");
    }, PREPARED_URL_TTL_MS);
  }

  if (isMetaIOS) {
    return (
      <div className="flex w-full flex-col gap-1.5 sm:w-auto">
        {phase === "ready" && preparedUrl !== null ? (
          <Button asChild size={size} variant={variant} className={className}>
            <a href={preparedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Abrir PDF agora
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            size={size}
            variant={variant}
            onClick={handlePrepare}
            disabled={phase === "loading"}
            className={className}
          >
            {phase === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} aria-hidden="true" />
                Preparando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                Preparar PDF
              </>
            )}
          </Button>
        )}
        {phase === "ready" && (
          <p className={cn("text-[12px] leading-snug text-slate-600", "sm:text-right")}>
            Agora toque em ‘Abrir PDF agora’. Se aparecer uma tela branca ou um link comprido, toque nos três pontos
            dessa tela e escolha ‘Abrir no Safari’. Não copie nem envie o link.
          </p>
        )}
        {phase === "error" && (
          <p role="alert" className={cn("text-[12px] leading-snug text-rose-600", "sm:text-right")}>
            {DOWNLOAD_ERROR_MESSAGES[errorCode ?? ""] ?? DEFAULT_ERROR_MESSAGE}{" "}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={handlePrepare}>
              Tentar novamente
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={phase === "loading"}
        className={className}
      >
        {phase === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} aria-hidden="true" />
            Preparando...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {label}
          </>
        )}
      </Button>
      {phase === "error" && (
        <p role="alert" className={cn("text-[12px] leading-snug text-rose-600", "sm:text-right")}>
          {DOWNLOAD_ERROR_MESSAGES[errorCode ?? ""] ?? DEFAULT_ERROR_MESSAGE}{" "}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={handleClick}>
            Tentar novamente
          </button>
        </p>
      )}
    </div>
  );
}
