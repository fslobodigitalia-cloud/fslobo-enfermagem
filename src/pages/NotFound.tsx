import { Link } from "react-router-dom";
import { brand } from "@/config/site";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { Logo } from "@/components/common/Logo";
import { CosmicBackdrop } from "@/components/common/CosmicBackdrop";
import { StarField } from "@/components/common/StarField";

export default function NotFound() {
  useDocumentMeta({
    title: `Página não encontrada | ${brand.name}`,
    description: brand.description,
    path: "/404",
    noindex: true,
  });

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-[22px] text-center">
      <CosmicBackdrop variant="final" />
      <StarField count={24} mobileCount={10} seed={41} />

      <div className="relative z-10 flex flex-col items-center">
        <Logo size={72} tone="large" />
        <h1 className="mt-8 font-display text-[clamp(2rem,8vw,3rem)] leading-tight text-cream">
          Esta página não foi encontrada.
        </h1>
        <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-dim">
          O endereço acessado não existe ou foi movido. Você pode voltar ao início e escolher a sua
          leitura.
        </p>
        <Link to={withCampaignQuery("/")} className="btn-gold mt-9">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
