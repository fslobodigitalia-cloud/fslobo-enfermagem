import { Check, FileText, MessageCircle } from "lucide-react";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import { downloadItemKey, type DownloadItem } from "@/lib/orderDownloads";
import { DownloadButton } from "@/components/downloads/DownloadButton";
import { InAppDownloadNotice } from "@/components/downloads/InAppDownloadNotice";

/**
 * Painel de downloads liberados — versão genérica/reutilizável do mesmo
 * conceito já validado em GuiaEvolucaoEnfermagemPage.tsx (PaidPanel), usada
 * por ProductCheckout.tsx (checkout de /produto/:slug). Não importa nada
 * da página do Guia nem a altera.
 *
 * `buildPixSupportWhatsAppUrl` (src/lib/whatsapp.ts) já é genérico — aceita
 * um `purchaseLabel` livre, por isso é reaproveitado aqui com o nome do
 * produto atual em vez do texto fixo do Guia.
 */
export function ProductDownloads({
  productName,
  productSlug,
  downloads,
}: {
  productName: string;
  productSlug: string;
  downloads: DownloadItem[];
}) {
  const supportUrl = buildPixSupportWhatsAppUrl(null, { purchaseLabel: productName });

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_2px_6px_rgba(15,23,42,0.05),0_28px_60px_-30px_rgba(13,148,136,0.4)] sm:p-7">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
          <Check className="h-7 w-7" strokeWidth={2} />
        </span>

        <div>
          <h3 className="font-sans text-[1.35rem] font-extrabold leading-tight text-slate-900">
            Pagamento confirmado!
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">Seu material já está liberado.</p>
        </div>

        <InAppDownloadNotice className="w-full" />

        <ul role="list" className="flex w-full flex-col gap-3 text-left">
          {downloads.map((download, index) => (
            <li
              key={downloadItemKey(download, index)}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                  <FileText className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold leading-snug text-slate-900">{download.name}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">Arquivo em PDF</p>
                </div>
              </div>
              <DownloadButton
                orderAccessKey={productSlug}
                fileKey={downloadItemKey(download, index)}
                label="Baixar material"
                className="w-full shrink-0 sm:w-auto"
              />
            </li>
          ))}
        </ul>

        <p className="text-[12px] leading-relaxed text-slate-500">
          Os links de download expiram após um tempo — se precisar, recarregue esta página para gerar novos.
        </p>

        <div className="mt-1 w-full border-t border-slate-100 pt-4">
          <p className="text-[13px] text-slate-500">Precisa de ajuda com o acesso?</p>
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
          >
            <MessageCircle className="h-4 w-4 text-teal-600" strokeWidth={1.9} aria-hidden="true" />
            Falar com o suporte
          </a>
        </div>
      </div>
    </div>
  );
}
