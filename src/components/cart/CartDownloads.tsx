import * as React from "react";
import { Check, Download, FileText, MessageCircle } from "lucide-react";
import { buildPixSupportWhatsAppUrl } from "@/lib/whatsapp";
import type { DownloadItem } from "@/lib/orderDownloads";
import { Button } from "@/components/ui/button";

/**
 * Painel de downloads liberados do carrinho — mesmo conceito de
 * src/components/product/ProductDownloads.tsx (não alterado, continua
 * servindo só /produto/:slug), adaptado para agrupar por produto: o array
 * plano devolvido por get-order-downloads pode ter mais de uma linha com o
 * mesmo `slug` (produto com múltiplos arquivos — ver auditoria de
 * get_order_downloads_info), então agrupamos por slug ANTES de renderizar,
 * exibindo o nome do produto uma vez e todos os arquivos dele em seguida.
 */
interface DownloadGroup {
  slug: string;
  productName: string;
  files: DownloadItem[];
}

function groupDownloadsByProduct(downloads: DownloadItem[]): DownloadGroup[] {
  const order: string[] = [];
  const bySlug = new Map<string, DownloadGroup>();
  for (const download of downloads) {
    let group = bySlug.get(download.slug);
    if (!group) {
      group = { slug: download.slug, productName: download.name, files: [] };
      bySlug.set(download.slug, group);
      order.push(download.slug);
    }
    group.files.push(download);
  }
  return order.map((slug) => bySlug.get(slug)!);
}

export function CartDownloads({ downloads }: { downloads: DownloadItem[] }) {
  const groups = React.useMemo(() => groupDownloadsByProduct(downloads), [downloads]);
  const supportUrl = buildPixSupportWhatsAppUrl(null, { purchaseLabel: "sua compra na FSLobo Enfermagem" });

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
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            Seus {groups.length === 1 ? "material já está liberado" : "materiais já estão liberados"}.
          </p>
        </div>

        <div role="list" className="flex w-full flex-col gap-4 text-left">
          {groups.map((group) => (
            <div key={group.slug} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13.5px] font-bold text-slate-900">
                {group.productName}
              </p>
              <ul role="list" className="flex flex-col gap-3 p-4">
                {group.files.map((file, index) => (
                  <li
                    key={`${file.slug}-${index}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                        <FileText className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold leading-snug text-slate-800">
                          {group.files.length > 1 ? file.name : "Arquivo em PDF"}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
                      <a href={file.url} target="_blank" rel="noopener noreferrer" download>
                        <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        Baixar PDF
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

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
