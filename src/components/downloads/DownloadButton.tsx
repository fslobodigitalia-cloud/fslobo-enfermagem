import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { readOrderAccess } from "@/lib/orderAccess";
import { getOrderDownloads, downloadItemKey } from "@/lib/orderDownloads";

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

type Phase = "idle" | "loading" | "error";

/** Mensagens amigáveis por código de erro — nunca a mensagem crua do servidor. */
const DOWNLOAD_ERROR_MESSAGES: Record<string, string> = {
  no_access: "Não foi possível localizar seu pedido neste navegador.",
  not_paid: "Não foi possível confirmar o pagamento agora.",
  file_not_found: "Não foi possível localizar este arquivo agora.",
  network_error: "Sem conexão no momento.",
};
const DEFAULT_ERROR_MESSAGE = "Não foi possível preparar o download agora.";

export function DownloadButton({
  orderAccessKey,
  fileKey,
  label = "Baixar material",
  className,
  size = "sm",
  variant,
}: DownloadButtonProps) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  async function handleClick() {
    if (phase === "loading") return;
    setPhase("loading");
    setErrorCode(null);

    const access = readOrderAccess(orderAccessKey);
    if (!access) {
      setPhase("error");
      setErrorCode("no_access");
      return;
    }

    const outcome = await getOrderDownloads(access.publicId, access.checkoutAccessToken);
    if (outcome.kind === "error") {
      setPhase("error");
      setErrorCode(outcome.code);
      return;
    }
    if (outcome.kind === "waiting") {
      setPhase("error");
      setErrorCode("not_paid");
      return;
    }

    const match = outcome.downloads.find((item, index) => downloadItemKey(item, index) === fileKey);
    if (!match) {
      setPhase("error");
      setErrorCode("file_not_found");
      return;
    }

    // Dispara o download a partir da URL recém-gerada — <a> temporário,
    // criado, clicado e removido imediatamente num único uso. Nunca fica
    // em atributo href permanente na página, nunca é logada.
    const link = document.createElement("a");
    link.href = match.url;
    link.rel = "noopener noreferrer";
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setPhase("idle");
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
