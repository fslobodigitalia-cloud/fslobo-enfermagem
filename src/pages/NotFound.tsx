import { Link } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { brand } from "@/config/site";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  useDocumentMeta({
    title: `Página não encontrada | ${brand.name}`,
    description: brand.description,
    path: "/404",
    noindex: true,
  });

  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-center font-sans">
      <div className="flex flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <HeartPulse className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-[2rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.4rem]">
          Esta página não foi encontrada.
        </h1>
        <p className="mt-3 max-w-[42ch] text-[15.5px] leading-relaxed text-slate-600">
          O endereço acessado não existe ou foi movido.
        </p>
        <Button asChild className="mt-8 bg-teal-600 text-white hover:bg-teal-700">
          <Link to={withCampaignQuery("/")}>Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}
