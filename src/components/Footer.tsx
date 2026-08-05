import { Instagram, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  brand,
  contact,
  copy,
  instagramUrl,
  isPlaceholder,
  legalLinks,
} from "@/config/site";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useSelection } from "@/context/SelectionContext";
import { Logo } from "./common/Logo";

/** Formata "5511987654321" como "+55 (11) 98765-4321". */
function formatWhatsApp(raw: string): string {
  if (isPlaceholder(raw)) return raw;
  const digits = raw.replace(/\D/g, "");
  const match = digits.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  if (!match) return raw;
  const [, country, area, first, last] = match;
  return `+${country} (${area}) ${first}-${last}`;
}

export function Footer() {
  const { goToOffer } = useSelection();
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-gold/20 bg-ink-soft pb-[calc(96px+env(safe-area-inset-bottom))] pt-14 lg:pb-14">
      <div className="shell relative z-10">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr_1fr] lg:gap-12">
          {/* Marca */}
          <div>
            <Logo size={58} tone="large" />
            <p className="mt-5 font-display text-[1.15rem] italic leading-snug text-gold-light">
              {brand.tagline}
            </p>
            <p className="mt-4 max-w-[46ch] text-[14px] leading-relaxed text-dim">
              {brand.description}
            </p>
          </div>

          {/* Contato */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/85">
              Contato
            </h2>
            <ul className="mt-5 flex flex-col gap-4">
              <li className="flex items-start gap-3">
                <MessageCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-[14px] text-cream">
                    WhatsApp {formatWhatsApp(contact.whatsappNumber)}
                  </span>
                  {/* O atendimento é iniciado depois da escolha do pacote. */}
                  <button
                    type="button"
                    onClick={goToOffer}
                    className="w-fit text-[13px] text-dim underline underline-offset-4 transition-colors hover:text-gold-light"
                  >
                    Escolher minha leitura para iniciar o atendimento
                  </button>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Instagram
                  className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                {isPlaceholder(contact.instagramHandle) ? (
                  <span className="text-[14px] text-cream">
                    Instagram {contact.instagramHandle}
                  </span>
                ) : (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-cream underline-offset-4 transition-colors hover:text-gold-light hover:underline"
                  >
                    @{contact.instagramHandle.replace(/^@/, "")}
                  </a>
                )}
              </li>
            </ul>
          </div>

          {/* Informações legais */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/85">
              Informações
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={withCampaignQuery(link.href)}
                    className="text-[14px] text-dim underline-offset-4 transition-colors hover:text-gold-light hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Aviso de responsabilidade */}
        <div className="mt-12 rounded-2xl border border-gold/20 bg-white/[0.02] p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/85">
            Aviso de responsabilidade
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-dim">{copy.footer.disclaimer}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-dim">{copy.footer.ageNote}</p>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-gold/15 pt-6 text-[12px] text-dim/80 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {brand.name}. Todos os direitos reservados.
          </p>
          <p>{brand.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
