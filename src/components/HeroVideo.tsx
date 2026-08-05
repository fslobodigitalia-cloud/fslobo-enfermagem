import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { brand } from "@/config/site";

/**
 * Fundo cinematográfico da hero.
 *
 * • Escolhe a versão vertical no celular e a horizontal no desktop.
 * • Em prefers-reduced-motion, exibe apenas o poster — nenhum vídeo é baixado.
 * • Pausa quando a aba fica inativa e volta ao poster se o vídeo falhar.
 */
export function HeroVideo() {
  const reduced = useReducedMotion();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = React.useState<boolean | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  /* Só revelamos o vídeo quando ele realmente começa a rodar sobre o poster. */
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  /* O vídeo entra depois da primeira pintura para não disputar banda com o LCP. */
  React.useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isMobile, reduced]);

  const poster = isMobile ? brand.heroVideo.posterMobile : brand.heroVideo.poster;
  const source = isMobile ? brand.heroVideo.mobile : brand.heroVideo.desktop;
  const showVideo = ready && isMobile !== null && !reduced && !failed;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Poster: pintado imediatamente, evita qualquer salto de layout. */}
      <img
        src={poster}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />

      {showVideo && (
        <video
          key={source}
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
        >
          <source src={source} type="video/mp4" />
        </video>
      )}

      {/* Camadas de leitura: escurecem o vídeo e reforçam roxo e dourado. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 20%, rgba(7,4,13,0.25) 0%, rgba(7,4,13,0.72) 55%, rgba(7,4,13,0.94) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,4,13,0.85) 0%, rgba(7,4,13,0.35) 34%, rgba(7,4,13,0.72) 74%, #07040D 100%)",
        }}
      />
      <div
        className="absolute inset-0 mix-blend-soft-light"
        style={{
          background:
            "radial-gradient(80% 60% at 20% 30%, rgba(109,40,217,0.55) 0%, transparent 65%), radial-gradient(70% 60% at 85% 70%, rgba(217,172,91,0.35) 0%, transparent 68%)",
        }}
      />
    </div>
  );
}
