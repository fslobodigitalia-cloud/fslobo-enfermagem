import type { ReactNode } from "react";
import {
  Camera,
  CheckCheck,
  ChevronLeft,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Play,
  Smile,
  Video,
} from "lucide-react";
import { brand, copy, sectionIds } from "@/config/site";
import { SectionHeading } from "./common/SectionHeading";
import { Reveal } from "./common/Reveal";
import { CosmicBackdrop } from "./common/CosmicBackdrop";

/* Paleta da conversa: tons da marca, no lugar do verde do aplicativo. */
const SCREEN = "#100A19";
const BAR = "#181022";
const BUBBLE_IN = "#1E1629";
const BUBBLE_OUT = "#2E1350";
const TEXT = "#EDE6DA";
const META = "rgba(237,230,218,0.45)";
const READ = "#53BDEB";

const chat = copy.preview.chat;

export function ReadingPreview() {
  const { preview } = copy;

  return (
    <section id={sectionIds.preview} className="relative scroll-mt-24 py-16 sm:py-20 lg:py-28">
      <CosmicBackdrop variant="section" />

      <div className="shell relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_382px] lg:gap-16">
          {/* ── Texto ── */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <SectionHeading
              eyebrow={preview.eyebrow}
              title={preview.title}
              align="left"
              className="items-center text-center lg:items-start lg:text-left"
            />

            <ul className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
              {preview.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-gold/25 bg-white/[0.03] px-3.5 py-2 text-[12px] text-dim"
                >
                  {tag}
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-[46ch] text-[12.5px] leading-relaxed text-dim/70">
              {preview.note}
            </p>
          </div>

          {/* ── Celular ── */}
          <Reveal className="mx-auto w-full max-w-[352px] lg:mx-0 lg:max-w-[382px]">
            <PhoneMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <figure
      className="relative rounded-[46px] border border-gold/25 p-[10px]"
      style={{
        background: "linear-gradient(160deg, #241536 0%, #0C0712 45%, #150C22 100%)",
        boxShadow:
          "0 0 0 1px rgba(217,172,91,0.16), 0 50px 110px -50px rgba(0,0,0,0.95), 0 0 90px -40px rgba(109,40,217,0.7)",
      }}
    >
      {/* Proporção de aparelho real (9:19.5) — o conteúdo se ajusta a ela. */}
      <div
        className="relative flex flex-col overflow-hidden rounded-[37px]"
        style={{ background: SCREEN, aspectRatio: "9 / 19.5" }}
      >
        <StatusBar />
        <ChatHeader />

        {/* Área da conversa: as mensagens ficam ancoradas embaixo e o topo é
            cortado, exatamente como um chat aberto na última mensagem. */}
        <div className="relative flex-1 overflow-hidden">
          <Wallpaper />

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-3 pb-3">
            <Chip>{chat.dayChip}</Chip>

            <BubbleOut time={chat.sent.time}>{chat.sent.text}</BubbleOut>
            <PhotoMessage />
            <ReadingMessage />
            <AudioMessage />
          </div>

          {/* Esfumaçado no topo: sinaliza que a conversa continua acima. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-10"
            style={{ background: `linear-gradient(180deg, ${SCREEN}, transparent)` }}
          />
        </div>

        <InputBar />
      </div>
    </figure>
  );
}

/* ─────────────────────────── Barra de status ───────────────────────────── */

function StatusBar() {
  return (
    <div
      className="relative flex h-9 items-center justify-between px-6 text-[11px] font-semibold"
      style={{ background: BAR, color: TEXT }}
    >
      <span>{chat.statusBarTime}</span>

      {/* Ilha dinâmica */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black"
      />

      <span aria-hidden="true" className="flex items-center gap-1.5" style={{ color: TEXT }}>
        {/* Sinal */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <rect x="0" y="7.5" width="2.6" height="3.5" rx="0.7" />
          <rect x="4.2" y="5" width="2.6" height="6" rx="0.7" />
          <rect x="8.4" y="2.5" width="2.6" height="8.5" rx="0.7" />
          <rect x="12.6" y="0" width="2.6" height="11" rx="0.7" opacity="0.4" />
        </svg>
        {/* Wi-Fi */}
        <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M1 3.6a9 9 0 0 1 12 0" />
          <path d="M3.4 6.2a5.6 5.6 0 0 1 7.2 0" />
          <path d="M5.8 8.7a2.2 2.2 0 0 1 2.4 0" />
        </svg>
        {/* Bateria */}
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.6" y="0.6" width="18" height="9.8" rx="2.6" stroke="currentColor" strokeOpacity="0.5" />
          <rect x="2.2" y="2.2" width="13" height="6.6" rx="1.4" fill="currentColor" />
          <path d="M20.4 4v3a1.9 1.9 0 0 0 0-3z" fill="currentColor" fillOpacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

/* ──────────────────────── Cabeçalho da conversa ────────────────────────── */

function ChatHeader() {
  return (
    <header
      className="flex items-center gap-2.5 border-b border-white/[0.06] px-3 py-2.5"
      style={{ background: BAR }}
    >
      <ChevronLeft className="h-5 w-5 shrink-0" style={{ color: META }} strokeWidth={2} aria-hidden="true" />

      <img
        src={brand.logo.webp}
        alt=""
        aria-hidden="true"
        width={38}
        height={38}
        loading="lazy"
        decoding="async"
        className="h-[38px] w-[38px] shrink-0 rounded-full object-cover ring-1 ring-gold/30"
      />

      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[14.5px] font-semibold" style={{ color: TEXT }}>
          {brand.name}
        </span>
        <span className="text-[11.5px]" style={{ color: META }}>
          {chat.contactStatus}
        </span>
      </span>

      <span aria-hidden="true" className="ml-auto flex items-center gap-3.5 pl-2" style={{ color: META }}>
        <Video className="h-[18px] w-[18px]" strokeWidth={1.8} />
        <Phone className="h-[16px] w-[16px]" strokeWidth={1.8} />
        <MoreVertical className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </span>
    </header>
  );
}

/* ───────────────────────── Papel de parede ─────────────────────────────── */

function Wallpaper() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <defs>
        <pattern id="chat-doodles" width="88" height="88" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#D9AC5B" strokeWidth="1.1" opacity="0.11">
            <circle cx="16" cy="18" r="5" />
            <path d="M50 8 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2z" />
            <rect x="70" y="10" width="11" height="16" rx="2.5" />
            <path d="M22 54a8 8 0 1 0 0 13 6.4 6.4 0 1 1 0-13z" />
            <path d="M74 58 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8z" />
            <circle cx="48" cy="72" r="4" />
            <path d="M4 76 h8 M8 72 v8" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={SCREEN} />
      <rect width="100%" height="100%" fill="url(#chat-doodles)" />
    </svg>
  );
}

/* ──────────────────────────── Peças da conversa ────────────────────────── */

function Chip({ children, subtle = false }: { children: ReactNode; subtle?: boolean }) {
  return (
    <p
      className="mx-auto max-w-[86%] rounded-lg px-2.5 py-1.5 text-center text-[10.5px] leading-snug"
      style={{
        background: subtle ? "rgba(46,19,80,0.55)" : "rgba(30,22,41,0.9)",
        color: subtle ? "rgba(243,215,154,0.8)" : META,
      }}
    >
      {children}
    </p>
  );
}

/** Rodapé da mensagem: horário e, quando enviada, os dois tiques. */
function Meta({ time, read = false }: { time: string; read?: boolean }) {
  return (
    <span className="mt-1 flex items-center justify-end gap-1 text-[10px]" style={{ color: META }}>
      {time}
      {read && (
        <CheckCheck className="h-3.5 w-3.5" style={{ color: READ }} strokeWidth={2.4} aria-hidden="true" />
      )}
    </span>
  );
}

function BubbleOut({ children, time }: { children: ReactNode; time: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="relative max-w-[82%] rounded-xl rounded-tr-none px-2.5 py-1.5 text-[13.5px] leading-[1.45]"
        style={{ background: BUBBLE_OUT, color: TEXT }}
      >
        {/* Bico da mensagem enviada */}
        <span
          aria-hidden="true"
          className="absolute -right-[7px] top-0 h-3 w-2"
          style={{ background: BUBBLE_OUT, clipPath: "polygon(0 0, 0 100%, 100% 0)" }}
        />
        {children}
        <Meta time={time} read />
      </div>
    </div>
  );
}

function BubbleIn({
  children,
  time,
  padded = true,
}: {
  children: ReactNode;
  time?: string;
  padded?: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div
        className={`relative max-w-[86%] rounded-xl rounded-tl-none text-[13.5px] leading-[1.45] ${
          padded ? "px-2.5 py-1.5" : "p-1"
        }`}
        style={{ background: BUBBLE_IN, color: TEXT }}
      >
        {/* Bico da mensagem recebida */}
        <span
          aria-hidden="true"
          className="absolute -left-[7px] top-0 h-3 w-2"
          style={{ background: BUBBLE_IN, clipPath: "polygon(100% 0, 100% 100%, 0 0)" }}
        />
        {children}
        {time && <Meta time={time} />}
      </div>
    </div>
  );
}

function PhotoMessage() {
  return (
    <BubbleIn padded={false}>
      <figure className="relative w-[150px] overflow-hidden rounded-[10px]">
        <img
          src={chat.photo.src}
          alt={chat.photo.alt}
          width={540}
          height={675}
          loading="lazy"
          decoding="async"
          className="block h-[185px] w-full object-cover"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-14"
          style={{ background: "linear-gradient(180deg, transparent, rgba(7,4,13,0.85))" }}
        />
        <figcaption
          className="absolute bottom-1.5 left-2 right-2 flex items-end justify-between gap-2 text-[10px]"
          style={{ color: "rgba(237,230,218,0.85)" }}
        >
          <span className="leading-tight">{chat.photo.caption}</span>
          <span className="shrink-0">{chat.photo.time}</span>
        </figcaption>
      </figure>
    </BubbleIn>
  );
}

function ReadingMessage() {
  const { preview } = copy;
  return (
    <BubbleIn time={chat.reading.time}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-gold/85">
        {preview.cardLabel}
      </span>
      <span className="block font-display text-[17px] leading-tight text-gold-light">
        {preview.cardName}
      </span>
      <span className="mt-1.5 block">{preview.interpretation}</span>
    </BubbleIn>
  );
}

/** Barras da forma de onda — alturas fixas, sem aleatoriedade em tempo de render. */
const WAVE = [
  5, 9, 14, 8, 17, 11, 20, 13, 7, 16, 22, 10, 6, 13, 18, 9, 14, 20, 8, 12, 16, 7, 11, 15, 6, 9, 13,
  8, 5,
];

function AudioMessage() {
  return (
    <BubbleIn>
      <div className="flex w-[204px] items-center gap-2.5 py-0.5">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "rgba(217,172,91,0.16)", color: "#F3D79A" }}
        >
          <Play className="h-3.5 w-3.5 translate-x-[1px]" fill="currentColor" strokeWidth={0} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span aria-hidden="true" className="flex h-6 items-center gap-[2px]">
            {WAVE.map((height, index) => (
              <span
                key={index}
                className="w-[2px] shrink-0 rounded-full"
                style={{
                  height: `${height}px`,
                  background: index < 6 ? "#F3D79A" : "rgba(237,230,218,0.32)",
                }}
              />
            ))}
          </span>
          <span className="flex items-center justify-between text-[10px]" style={{ color: META }}>
            <span className="flex items-center gap-1">
              <Mic className="h-3 w-3" style={{ color: "rgba(243,215,154,0.7)" }} strokeWidth={2} aria-hidden="true" />
              {chat.audio.duration}
            </span>
            <span>{chat.audio.time}</span>
          </span>
        </span>
      </div>
      <span className="sr-only">{chat.audio.label}</span>
    </BubbleIn>
  );
}

function InputBar() {
  return (
    <div
      aria-hidden="true"
      className="relative flex items-center gap-2 px-2.5 pb-5 pt-2"
      style={{ background: SCREEN }}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2.5"
        style={{ background: BAR, color: META }}
      >
        <Smile className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
        <span className="flex-1 truncate text-[13px]">{chat.inputPlaceholder}</span>
        <Paperclip className="h-[17px] w-[17px] shrink-0 -rotate-45" strokeWidth={1.7} />
        <Camera className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
      </div>

      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink"
        style={{ background: "linear-gradient(135deg, #F3D79A 0%, #D9AC5B 55%, #C69444 100%)" }}
      >
        <Mic className="h-[19px] w-[19px]" strokeWidth={2} />
      </span>

      {/* Indicador inferior do sistema */}
      <span
        className="absolute inset-x-0 bottom-1.5 mx-auto h-1 w-28 rounded-full"
        style={{ background: "rgba(237,230,218,0.25)" }}
      />
    </div>
  );
}
