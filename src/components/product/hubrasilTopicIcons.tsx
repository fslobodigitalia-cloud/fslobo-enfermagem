import * as React from "react";

/** Ícones SVG locais da seção "O que você vai revisar" (HUBRASIL). Decorativos: o texto do cartão descreve o tema. */
const NAVY = "#0b3d91";
const GREEN = "#1f9d55";

type IconProps = React.SVGProps<SVGSVGElement>;

function Svg(props: IconProps) {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false" {...props} />;
}

export function BrazilCrossIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M23.3 3.7 35.4 5 37.6 9 37.6 11.2 46 14.8 53.7 16.5 58.6 18.7 58.9 22 55.8 27 53 36.3 51.6 39.9 50.2 43.5 46 44.2 40.4 47.8 39.6 51.4 37.6 54.3 32.8 59.6 27 54.6 30.6 50 31.3 47.8 27 42.8 26.4 39.9 26.7 34.9 23.6 31.3 16.6 25.5 11 27 4.7 22 6.8 18.4 9.6 17.2 10.3 12.6 13.8 8.3 18 5.2z" fill={GREEN} stroke={GREEN} strokeWidth="2" strokeLinejoin="round" />
      <path d="M31 25h6v6.5h6.500v6H37V44h-6v-6.500h-6.500v-6H31z" fill="#fff" />
    </Svg>
  );
}

export function MaleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="26" cy="38" r="13" stroke={NAVY} strokeWidth="7" />
      <path d="m36 28 15-15M39 11h14v14" stroke={NAVY} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ShieldAlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M28 6 46 12v16c0 12-8 20-18 26C18 48 10 40 10 28V12z" fill="#0f8f78" />
      <path d="M25 17h6v7h7v6h-7v7h-6v-7h-7v-6h7z" fill="#fff" />
      <path d="M46 33 58 54H34z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" />
      <path d="M46 40v8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="46" cy="51" r="1.8" fill="#fff" />
    </Svg>
  );
}

export function CalendarSyringeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="12" width="40" height="38" rx="6" stroke={NAVY} strokeWidth="4" />
      <path d="M7 23h40M17 6v10M37 6v10" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <path d="M14 31h4M23 31h4M32 31h4M14 39h4M23 39h4" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <g transform="rotate(-45 42 42)" stroke={GREEN} strokeLinecap="round" strokeLinejoin="round">
        <rect x="28" y="38" width="24" height="9" rx="2" strokeWidth="3.5" fill="#fff" />
        <path d="M52 42.5h6M60 38v9M20 42.5h8M36 38v9M43 38v9" strokeWidth="3" />
      </g>
    </Svg>
  );
}

export function KidsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 6l2 5M32 3v6M47 6l-2 5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" />
      <circle cx="19" cy="40" r="15" fill="#fff" stroke={NAVY} strokeWidth="4" />
      <path d="M5 38a14 14 0 0 1 28 0c-9-6-19-6-28 0z" fill={NAVY} />
      <circle cx="14" cy="43" r="1.8" fill={NAVY} />
      <circle cx="24" cy="43" r="1.8" fill={NAVY} />
      <path d="M14 49q5 4 10 0" stroke={NAVY} strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="48" cy="26" r="0" />
      <circle cx="35" cy="37" r="5" fill={GREEN} />
      <circle cx="61" cy="37" r="5" fill={GREEN} />
      <circle cx="47" cy="42" r="13" fill="#eafaee" stroke={GREEN} strokeWidth="4" />
      <circle cx="42" cy="43" r="1.8" fill={GREEN} />
      <circle cx="52" cy="43" r="1.8" fill={GREEN} />
      <path d="M42 49q5 4 10 0" stroke={GREEN} strokeWidth="2.8" strokeLinecap="round" />
    </Svg>
  );
}

export function ElderlyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="20" cy="12" r="7" fill={NAVY} />
      <rect x="10" y="22" width="20" height="22" rx="8" fill={NAVY} />
      <rect x="12" y="40" width="7" height="18" rx="3" fill={NAVY} />
      <rect x="22" y="40" width="7" height="18" rx="3" fill={NAVY} />
      <circle cx="42" cy="17" r="7" fill={GREEN} />
      <rect x="32" y="27" width="20" height="20" rx="8" fill={GREEN} />
      <rect x="34" y="43" width="7" height="15" rx="3" fill={GREEN} />
      <rect x="44" y="43" width="7" height="15" rx="3" fill={GREEN} />
      <path d="M55 37q5-2 5 3v18" stroke="#8bc34a" strokeWidth="3.5" strokeLinecap="round" />
    </Svg>
  );
}
