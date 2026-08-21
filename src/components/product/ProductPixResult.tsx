import { Clock, Copy, ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/config/digitalProducts";
import type { ProductCheckoutResult, ProductOrderSummary } from "@/lib/productCheckout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Painel de resultado do Pix — versão genérica/reutilizável do mesmo
 * conceito já validado em GuiaEvolucaoEnfermagemPage.tsx (ResultPanel),
 * usada por ProductCheckout.tsx (checkout da página dinâmica de produto,
 * /produto/:slug). Não importa nada da página do Guia nem a altera —
 * componente novo e independente, só o formato do resultado
 * (ProductCheckoutResult, de src/lib/productCheckout.ts) é compartilhado.
 *
 * `formatCents` é reaproveitado de src/config/digitalProducts.ts (função
 * pura de formatação pt-BR/BRL, sem nenhum dado do Guia).
 */

const PANEL_SHADOW = "shadow-[0_2px_6px_rgba(15,23,42,0.05),0_28px_60px_-30px_rgba(13,148,136,0.4)]";

function OrderSummary({ order, statusLabel }: { order: ProductOrderSummary; statusLabel: string }) {
  const rows = [
    { label: "Itens", value: order.items.map((item) => item.name).join(", ") },
    { label: "Valor", value: formatCents(order.amountCents) },
    { label: "Status", value: statusLabel },
  ];

  return (
    <dl className="grid w-full gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 bg-white px-5 py-3.5">
          <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{row.label}</dt>
          <dd className="text-right text-[13.5px] font-semibold text-slate-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductPixResult({
  result,
  copied,
  onCopyCode,
}: {
  result: Exclude<ProductCheckoutResult, { kind: "error" }>;
  copied: boolean;
  onCopyCode: (qrCode: string) => void;
}) {
  const order = result.order;

  if (result.kind === "pending") {
    return (
      <div className={cn("relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 sm:p-7", PANEL_SHADOW)}>
        <div className="flex flex-col items-center gap-5 text-center">
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-amber-700"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Aguardando confirmação do Pix
          </span>

          <h3 className="font-sans text-[1.3rem] font-extrabold leading-tight text-slate-900">
            Pagamento quase concluído
          </h3>
          <p className="max-w-[42ch] text-[14px] leading-relaxed text-slate-600">
            Escaneie o QR Code ou copie o código Pix para concluir o pagamento.
          </p>

          {result.pix.qrCodeBase64 && (
            <div className={cn("rounded-2xl border border-slate-200 bg-white p-3", PANEL_SHADOW)}>
              <img
                src={`data:image/png;base64,${result.pix.qrCodeBase64}`}
                alt="QR Code Pix"
                className="h-[200px] w-[200px] rounded-xl"
              />
            </div>
          )}

          <div className="w-full text-left">
            <Label htmlFor="product-pix-copia-cola" className="text-slate-500">
              Pix copia e cola
            </Label>
            <textarea
              id="product-pix-copia-cola"
              readOnly
              value={result.pix.qrCode}
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-700 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <Button type="button" full onClick={() => onCopyCode(result.pix.qrCode)} className="mt-2.5">
              <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {copied ? "Código copiado!" : "Copiar código Pix"}
            </Button>
          </div>

          <div className="flex w-full items-start gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-left">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">Não precisa enviar comprovante.</span> A confirmação
              acontece automaticamente e o material é liberado assim que o Pix é confirmado.
            </p>
          </div>

          <OrderSummary order={order} statusLabel="Aguardando pagamento" />
        </div>
      </div>
    );
  }

  // "preparing" (shell) e "processing": ainda sem QR Code disponível — a
  // verificação automática (polling de get-order-downloads, em
  // ProductCheckout.tsx) continua rodando em segundo plano até o pagamento
  // ser confirmado.
  return (
    <div className={cn("relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 sm:p-7", PANEL_SHADOW)}>
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-teal-100 bg-teal-50" aria-hidden="true">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        </span>
        <h3 className="font-sans text-[1.3rem] font-extrabold leading-tight text-slate-900">Preparando seu Pix...</h3>
        <p className="max-w-[42ch] text-[14px] leading-relaxed text-slate-600">
          Estamos confirmando os detalhes do seu pagamento. Isso pode levar alguns instantes.
        </p>
        <OrderSummary order={order} statusLabel="Aguardando pagamento" />
      </div>
    </div>
  );
}
