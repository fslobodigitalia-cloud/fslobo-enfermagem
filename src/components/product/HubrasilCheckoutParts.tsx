import * as React from "react";
import { Check, Mail, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents, type DigitalBump } from "@/config/digitalProducts";

/**
 * Peças visuais do checkout da landing HUBRASIL (variante "hubrasil" do
 * ProductCheckout). Só apresentação: seleção, preços e envio continuam no
 * ProductCheckout; nada aqui calcula valor nem cria pedido.
 */

/** Preço curto dos cartões: "R$ 10" (sem centavos quando redondo). */
function shortPrice(cents: number): string {
  return formatCents(cents).replace(/,00$/, "");
}

/** Marca do Pix (losango com quatro pétalas), em currentColor. */
export function PixIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <g fill="currentColor">
        <rect x="9.2" y="2.2" width="5.6" height="5.6" rx="1.2" transform="rotate(45 12 5)" />
        <rect x="16.2" y="9.2" width="5.6" height="5.6" rx="1.2" transform="rotate(45 19 12)" />
        <rect x="9.2" y="16.2" width="5.6" height="5.6" rx="1.2" transform="rotate(45 12 19)" />
        <rect x="2.2" y="9.2" width="5.6" height="5.6" rx="1.2" transform="rotate(45 5 12)" />
      </g>
    </svg>
  );
}

function BumpCover({ bump }: { bump: DigitalBump }) {
  const [failed, setFailed] = React.useState(false);
  return (
    <div className="flex h-[132px] items-center justify-center rounded-2xl bg-gradient-to-b from-[#eefaf7] to-[#e3f4f0] sm:h-[124px]">
      {failed || !bump.image ? (
        <div role="img" aria-label={`Capa de ${bump.name}`} className="flex h-[108px] w-[76px] items-end rounded-md bg-gradient-to-br from-teal-700 to-teal-950 p-1.5 text-[10px] font-extrabold leading-tight text-white shadow-md">
          {bump.name}
        </div>
      ) : (
        <img
          src={bump.image}
          alt={`Capa de ${bump.name}`}
          width={88}
          height={124}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-[112px] w-auto select-none object-contain drop-shadow-[0_6px_8px_rgba(15,23,42,0.28)] sm:h-[104px]"
        />
      )}
    </div>
  );
}

interface HubrasilBumpsProps {
  bumps: readonly DigitalBump[];
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  introduction?: string;
}

/**
 * Adicionais opcionais. Celular: faixa horizontal com rolagem nativa e snap
 * (um cartão e meio por vez). A partir de 640 px: grade de três colunas, sem
 * autoplay nem controles ocultos.
 */
export function HubrasilBumps({ bumps, selected, onToggle, introduction }: HubrasilBumpsProps) {
  const [announcement, setAnnouncement] = React.useState("");
  const prices = new Set(bumps.map(bump => bump.priceCents));
  const title = prices.size === 1 && bumps[0] ? `Complete seu material por ${shortPrice(bumps[0].priceCents)} cada` : "Complete seu material";

  function handle(bump: DigitalBump) {
    setAnnouncement(selected.has(bump.slug) ? `${bump.name} removido do pedido.` : `${bump.name} adicionado ao pedido.`);
    onToggle(bump.slug);
  }

  return (
    <section aria-labelledby="hubrasil-bumps-title" className="rounded-[22px] border border-[#cfeee6] bg-gradient-to-b from-white to-[#f4fbf9] p-3.5 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dff5ee] text-[#0f8a6c]">
          <ShoppingCart className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 id="hubrasil-bumps-title" className="text-[18px] font-extrabold leading-tight tracking-tight text-[#0b1f3a] sm:text-[20px]">{title}</h3>
          {introduction && <p className="mt-1 text-[14px] leading-snug text-slate-600">{introduction}</p>}
        </div>
      </div>

      <ul className="-mx-3.5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3.5 pb-3 [scrollbar-width:none] sm:mx-0 sm:flex sm:snap-none sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {bumps.map(bump => {
          const isSelected = selected.has(bump.slug);
          const price = shortPrice(bump.priceCents);
          return (
            <li key={bump.slug} className="w-[72%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/3)]">
              <div
                className={cn(
                  "flex h-full flex-col gap-2.5 rounded-[20px] border-2 bg-white p-2.5 transition-[border-color,box-shadow,background-color] duration-200",
                  isSelected
                    ? "border-[#0f9b76] bg-[#f0fbf7] shadow-[0_10px_26px_-14px_rgba(15,138,108,0.6)]"
                    : "border-[#e3eeee] shadow-[0_2px_4px_rgba(15,23,42,0.04),0_10px_22px_-16px_rgba(15,23,42,0.2)]",
                )}
              >
                <BumpCover bump={bump} />
                <div className="flex flex-1 flex-col gap-1 px-0.5">
                  <h4 className="text-[15px] font-extrabold leading-snug text-[#0b1f3a]">{bump.name}</h4>
                  <p className="text-[13.5px] leading-snug text-slate-600">{bump.description}</p>
                </div>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={isSelected ? `Remover do pedido: ${bump.name}` : `Adicionar ${bump.name} por ${price}`}
                  onClick={() => handle(bump)}
                  className={cn(
                    "flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-full border-2 px-2 text-[15px] font-extrabold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40",
                    isSelected
                      ? "border-[#0f9b76] bg-white text-[#0b6b52] [@media(hover:hover)]:hover:border-rose-500 [@media(hover:hover)]:hover:bg-rose-50 [@media(hover:hover)]:hover:text-rose-700"
                      : "border-transparent bg-gradient-to-b from-[#12a37c] to-[#0b7f63] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_16px_-10px_rgba(11,127,99,0.7)] [@media(hover:hover)]:hover:from-[#0f9370] [@media(hover:hover)]:hover:to-[#096f56]",
                  )}
                >
                  {isSelected ? (
                    <span className="flex flex-col items-center leading-tight">
                      <span className="flex items-center gap-1">
                        <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> Adicionado
                      </span>
                      <span className="text-[11.5px] font-semibold opacity-80">toque para remover</span>
                    </span>
                  ) : (
                    `Adicionar +${price}`
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-center text-[12.5px] font-semibold text-slate-500 sm:hidden" aria-hidden="true">Deslize para ver os {bumps.length} materiais →</p>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}

interface FieldProps {
  id: string;
  label: string;
  icon: "user" | "mail";
  error?: string;
  hint?: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}

/** Campo com rótulo visível, ícone discreto e texto de 16 px (sem zoom no iOS). */
export function HubrasilField({ id, label, icon, error, hint, inputProps }: FieldProps) {
  const Icon = icon === "user" ? User : Mail;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-bold uppercase tracking-[0.16em] text-[#41546b]">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6d8196]" aria-hidden="true" />
        <input
          id={id}
          className="h-[54px] w-full rounded-2xl border border-[#cfe3e3] bg-white pl-12 pr-4 text-[16px] text-[#0b1f3a] shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 hover:border-[#7fcdbd] focus:border-[#0f9b76] focus:outline-none focus:ring-2 focus:ring-[#0f9b76]/25 aria-[invalid=true]:border-rose-400"
          {...inputProps}
        />
      </div>
      {hint && <p className="text-[13px] leading-snug text-slate-600">{hint}</p>}
      {error && (
        <p role="alert" className="text-[13px] text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
