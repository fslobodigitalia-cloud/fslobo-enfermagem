import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBrowserEnvironment } from "@/lib/browserEnvironment";

/**
 * Aviso discreto exibido UMA ÚNICA VEZ, acima da lista de downloads, quando
 * o navegador é o WebView interno do Instagram/Facebook/Messenger (ou
 * outro navegador interno reconhecível) — nunca em Safari/Chrome/Firefox/
 * Edge normais. Usado pelos 5 painéis de downloads pagos (Guia, Mapas
 * Mentais, Balanço Hídrico, ProductDownloads, CartDownloads).
 *
 * Não é modal, não cobre os botões, não interrompe o download — é só um
 * texto de orientação antes da lista de arquivos. A detecção
 * (src/lib/browserEnvironment.ts) roda uma única vez por montagem
 * (useState lazy initializer): a mesma instância de navegador não muda de
 * User-Agent no meio da sessão, então não há necessidade de recalcular em
 * cada render nem de observar mudanças.
 *
 * Deliberadamente NÃO orienta a cliente a reabrir a compra do zero, copiar
 * a URL do PDF, compartilhar ou guardar o link — o acesso à compra já
 * pode estar salvo neste navegador interno (orderAccess, ver
 * src/lib/orderAccess.ts) e a URL do PDF é sempre temporária (gerada de
 * novo a cada clique pelo DownloadButton, nunca alterado por este
 * componente).
 */
export function InAppDownloadNotice({ className }: { className?: string }) {
  const [env] = React.useState(getBrowserEnvironment);

  if (env.inAppBrowser === null) return null;

  const message = messageFor(env.inAppBrowser, env.platform);

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-[13px] leading-relaxed text-sky-800",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" strokeWidth={2} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function messageFor(
  kind: NonNullable<ReturnType<typeof getBrowserEnvironment>["inAppBrowser"]>,
  platform: ReturnType<typeof getBrowserEnvironment>["platform"],
): string {
  if (kind === "other") return GENERIC_IN_APP_MESSAGE;
  if (platform === "ios") return IOS_META_IN_APP_MESSAGE;
  if (platform === "android") return ANDROID_META_IN_APP_MESSAGE;
  // Instagram/Facebook/Messenger detectado, mas plataforma não identificada
  // como iOS/Android (caso raro) — cai na orientação genérica, nunca fica
  // sem nenhuma mensagem.
  return GENERIC_IN_APP_MESSAGE;
}

const IOS_META_IN_APP_MESSAGE =
  "Você está no navegador do Instagram ou Facebook. Toque em ‘Baixar material’ e aguarde alguns segundos. O PDF pode ser salvo no app Arquivos, geralmente na pasta Downloads. Se após o clique abrir uma tela branca, sem fechar essa tela, toque nos três pontos e escolha ‘Abrir no Safari’.";

const ANDROID_META_IN_APP_MESSAGE =
  "Você está no navegador do Instagram ou Facebook. Toque em ‘Baixar material’ e aguarde alguns segundos. O PDF pode ser salvo em Arquivos ou Downloads. Se após o clique abrir uma tela branca, sem fechar essa tela, toque nos três pontos e escolha ‘Abrir no Chrome’.";

const GENERIC_IN_APP_MESSAGE =
  "Você está usando um navegador interno. Toque em ‘Baixar material’ e aguarde alguns segundos. Se abrir uma tela branca, use o menu desta tela para abri-la no navegador do aparelho.";
