/**
 * Gera todos os assets derivados da identidade visual da Entre Nós Tarô:
 * logotipo, favicons, Open Graph, artes 1080x1350 dos temas e o vídeo
 * cinematográfico de fundo da hero.
 *
 * Fontes (raiz do projeto):
 *   - "banner entre nós.png" e "entre_nos_taro_foto_perfil.png" — logotipo,
 *     Open Graph e vídeo da hero.
 *   - "carta-amor.png", "carta-decisoes.png", "carta-trabalho.png" e
 *     "carta-autoconhecimento.png" — fotografias reais das cartas usadas nos
 *     cards de cada tema (Os Enamorados, Dois de Paus, Oito de Pentáculos,
 *     O Eremita).
 *
 * Uso: npm run assets
 */
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "brand");
const temp = path.join(root, ".asset-temp");
mkdirSync(out, { recursive: true });
mkdirSync(temp, { recursive: true });

const banner = path.join(root, "banner entre nós.png");
const perfil = path.join(root, "entre_nos_taro_foto_perfil.png");

const GOLD = "#D9AC5B";
const GOLD_LIGHT = "#F3D79A";

/* ═══════════════════════════ 1. Logotipo e ícones ═══════════════════════ */

for (const size of [512, 256, 128]) {
  await sharp(perfil).resize(size, size, { fit: "cover" }).webp({ quality: 88 })
    .toFile(path.join(out, `logo-${size}.webp`));
  await sharp(perfil).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 })
    .toFile(path.join(out, `logo-${size}.png`));
}

for (const size of [16, 32, 48]) {
  await sharp(perfil).resize(size, size).png().toFile(path.join(out, `favicon-${size}.png`));
}
await sharp(perfil).resize(180, 180).png().toFile(path.join(out, "apple-touch-icon.png"));
await sharp(perfil).resize(192, 192).png().toFile(path.join(out, "icon-192.png"));
await sharp(perfil).resize(512, 512).png().toFile(path.join(out, "icon-512.png"));

/* Selo isolado da carta (sem o texto do logotipo), usado como marca compacta. */
await sharp(perfil)
  .extract({ left: 300, top: 120, width: 500, height: 500 })
  .resize(256, 256)
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, "selo-carta.png"));

/* ═══════════════════════════ 2. Capa e Open Graph ═══════════════════════ */

for (const w of [1600, 1200, 800]) {
  await sharp(banner).resize(w).webp({ quality: 78 }).toFile(path.join(out, `capa-${w}.webp`));
}
await sharp(banner).resize(1200).avif({ quality: 55 }).toFile(path.join(out, "capa-1200.avif"));

const ogInner = await sharp(banner).resize(1200).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#07040D" } })
  .composite([{ input: ogInner, gravity: "center" }])
  .jpeg({ quality: 84, progressive: true })
  .toFile(path.join(out, "og-entre-nos-taro.jpg"));

/* ═══════════════════ 3. Artes 1080x1350 dos temas ═══════════════════════ */

/**
 * Cada tema usa a fotografia real da carta correspondente (mesa de veludo
 * roxo, velas, ametista, cristais) enviada para o projeto. Sem ilustração
 * sintética: apenas grade de cor leve para manter a coerência com a paleta
 * do site, e o mesmo tratamento de vinheta/degradê usado em toda a UI para
 * garantir a leitura do texto sobreposto.
 */
const themeArt = [
  {
    slug: "amor",
    source: path.join(root, "carta-amor.png"),
    sat: 1.08,
    bright: 1.0,
    tint: "#8B5CF6",
  },
  {
    slug: "decisoes",
    source: path.join(root, "carta-decisoes.png"),
    sat: 1.06,
    bright: 1.0,
    tint: "#6D28D9",
  },
  {
    slug: "trabalho",
    source: path.join(root, "carta-trabalho.png"),
    sat: 1.06,
    bright: 1.02,
    tint: "#D9AC5B",
    // "attention" isolava o rodapé do card, onde fica impresso "O OITO DE
    // PENTÁCULOS" — o texto colidia com o título da página por cima.
    // "centre" mostra o artesão inteiro, sem tocar na faixa do título.
    heroPosition: "centre",
  },
  {
    slug: "autoconhecimento",
    source: path.join(root, "carta-autoconhecimento.png"),
    sat: 1.1,
    bright: 0.97,
    tint: "#A78BFA",
    // "attention" isolava o rodapé (título + folhagem) e perdia a figura do
    // eremita com a lanterna; "entropy" enquadra montanha, caminho e estrela.
    heroPosition: "entropy",
  },
];

const ART_W = 1080;
const ART_H = 1350;

/** Halo do tema + vinheta + degradê inferior para o texto sobreposto. */
function gradeSvg(width, height, tint) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="halo" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="${tint}" stop-opacity="0.14"/>
      <stop offset="60%" stop-color="${tint}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vinheta" cx="50%" cy="42%" r="78%">
      <stop offset="55%" stop-color="#07040D" stop-opacity="0"/>
      <stop offset="100%" stop-color="#07040D" stop-opacity="0.7"/>
    </radialGradient>
    <linearGradient id="base" x1="0%" y1="42%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#07040D" stop-opacity="0"/>
      <stop offset="62%" stop-color="#07040D" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#07040D" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="topo" x1="0%" y1="0%" x2="0%" y2="26%">
      <stop offset="0%" stop-color="#07040D" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#07040D" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#halo)"/>
  <rect width="${width}" height="${height}" fill="url(#vinheta)"/>
  <rect width="${width}" height="${height}" fill="url(#topo)"/>
  <rect width="${width}" height="${height}" fill="url(#base)"/>
</svg>`);
}

for (const theme of themeArt) {
  const composed = await sharp(theme.source)
    .resize(ART_W, ART_H, { fit: "cover", position: "center", kernel: "lanczos3" })
    .modulate({ saturation: theme.sat, brightness: theme.bright })
    .composite([{ input: gradeSvg(ART_W, ART_H, theme.tint) }])
    .toBuffer();

  await sharp(composed).webp({ quality: 84 }).toFile(path.join(out, `tema-${theme.slug}.webp`));
  await sharp(composed).avif({ quality: 56 }).toFile(path.join(out, `tema-${theme.slug}.avif`));
  await sharp(composed)
    .resize(540, 675)
    .webp({ quality: 80 })
    .toFile(path.join(out, `tema-${theme.slug}-540.webp`));
}

/* ──────────────── 3b. Versão larga das fotos para a hero de cada tema ───── */

const HERO_W = 1920;
const HERO_H = 960;

/**
 * Vinheta leve: só o necessário para o cabeçalho fixo e a transição para a
 * próxima seção. Bem mais discreta que a do card — aqui a foto ocupa uma
 * faixa larga e precisa "respirar", sem a barra escura pensada para o
 * rodapé de um card vertical.
 */
function heroGradeSvg(width, height) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="topo" x1="0%" y1="0%" x2="0%" y2="24%">
      <stop offset="0%" stop-color="#07040D" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#07040D" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="base" x1="0%" y1="66%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#07040D" stop-opacity="0"/>
      <stop offset="100%" stop-color="#07040D" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="vinheta" cx="50%" cy="50%" r="75%">
      <stop offset="60%" stop-color="#07040D" stop-opacity="0"/>
      <stop offset="100%" stop-color="#07040D" stop-opacity="0.42"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#vinheta)"/>
  <rect width="${width}" height="${height}" fill="url(#topo)"/>
  <rect width="${width}" height="${height}" fill="url(#base)"/>
</svg>`);
}

for (const theme of themeArt) {
  // "attention" analisa nitidez/contraste da imagem e centraliza o recorte
  // na carta em si — evita fixar manualmente uma posição para cada foto.
  // Alguns temas têm uma posição de recorte específica (ver themeArt acima).
  const composed = await sharp(theme.source)
    .resize(HERO_W, HERO_H, {
      fit: "cover",
      position: theme.heroPosition ?? "attention",
      kernel: "lanczos3",
    })
    .modulate({ saturation: theme.sat, brightness: Math.max(theme.bright, 1.05) })
    .composite([{ input: heroGradeSvg(HERO_W, HERO_H) }])
    .toBuffer();

  await sharp(composed).webp({ quality: 80 }).toFile(path.join(out, `tema-${theme.slug}-hero.webp`));
  await sharp(composed).avif({ quality: 52 }).toFile(path.join(out, `tema-${theme.slug}-hero.avif`));
}

/* ═════════════════ 4. Vídeo cinematográfico da hero ═════════════════════
 *
 * Em vez do recorte estilizado da capa, a hero agora usa as fotos reais do
 * ritual de leitura (velas, cristais, cartas, veludo roxo — sem pessoas) já
 * usadas nos cards de tema. O vídeo alterna entre as quatro com um zoom
 * lento e transições em fade, fechando o ciclo de volta à primeira foto
 * para o loop ficar contínuo.
 * ════════════════════════════════════════════════════════════════════════ */

/** Mesmo enquadramento já validado nas artes -hero dos temas. */
const ritualPhotos = [
  { source: path.join(root, "carta-amor.png"), position: "attention" },
  { source: path.join(root, "carta-decisoes.png"), position: "attention" },
  { source: path.join(root, "carta-trabalho.png"), position: "centre" },
  { source: path.join(root, "carta-autoconhecimento.png"), position: "entropy" },
];

/* Recortes em alta resolução (2x o tamanho final) para o zoom não perder nitidez. */
const WIDE_CROP = { w: 3200, h: 1800 };
const TALL_CROP = { w: 1440, h: 2160 };

const wideFrames = [];
const tallFrames = [];
for (const [index, photo] of ritualPhotos.entries()) {
  const widePath = path.join(temp, `ritual-wide-${index}.png`);
  const tallPath = path.join(temp, `ritual-tall-${index}.png`);

  await sharp(photo.source)
    .resize(WIDE_CROP.w, WIDE_CROP.h, { fit: "cover", position: photo.position })
    .modulate({ saturation: 1.06, brightness: 1.0 })
    .png()
    .toFile(widePath);

  await sharp(photo.source)
    .resize(TALL_CROP.w, TALL_CROP.h, { fit: "cover", position: photo.position })
    .modulate({ saturation: 1.06, brightness: 1.0 })
    .png()
    .toFile(tallPath);

  wideFrames.push(widePath);
  tallFrames.push(tallPath);
}

const FPS = 24;
/** Duração de cada foto em tela e da transição entre elas. */
const SEG_SECONDS = 5;
const XFADE_SECONDS = 1;
const SEG_FRAMES = FPS * SEG_SECONDS;

/**
 * Alterna entre as fotos (a primeira repetida no final) com zoom lento e
 * crossfade. Como a última transição volta para a mesma foto e o mesmo
 * quadro inicial da primeira, o loop do <video> fica sem corte perceptível.
 */
function renderRitualVideo({ file, width, height, frames }) {
  // A primeira foto é repetida ao final para fechar o ciclo com um fade.
  const sequence = [...frames, frames[0]];

  const inputs = sequence.flatMap((frame) => [
    "-loop", "1",
    "-t", String(SEG_SECONDS),
    "-i", frame,
  ]);

  const clipFilters = sequence.map((_, i) =>
    [
      `[${i}:v]scale=${width * 2}:${height * 2}:flags=lanczos,`,
      `zoompan=z='1+0.09*on/${SEG_FRAMES}':`,
      `d=1:s=${width}x${height}:fps=${FPS},`,
      `eq=saturation=1.05:contrast=1.04:brightness=-0.02,`,
      `vignette=PI/4.5,format=yuv420p[v${i}]`,
    ].join(""),
  );

  const xfadeFilters = [];
  let runningLabel = "v0";
  let runningDuration = SEG_SECONDS;
  for (let i = 1; i < sequence.length; i++) {
    const nextLabel = i === sequence.length - 1 ? "out" : `x${i}`;
    const offset = runningDuration - XFADE_SECONDS;
    xfadeFilters.push(
      `[${runningLabel}][v${i}]xfade=transition=fade:duration=${XFADE_SECONDS}:offset=${offset}[${nextLabel}]`,
    );
    runningDuration = runningDuration + SEG_SECONDS - XFADE_SECONDS;
    runningLabel = nextLabel;
  }

  const filter = [...clipFilters, ...xfadeFilters].join(";");

  execFileSync(
    ffmpegPath,
    [
      "-y",
      "-loglevel", "error",
      ...inputs,
      "-filter_complex", filter,
      "-map", "[out]",
      "-an",
      "-c:v", "libx264",
      "-profile:v", "high",
      "-crf", "29",
      "-preset", "slow",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      file,
    ],
    { stdio: "inherit" },
  );
}

if (!ffmpegPath) {
  console.warn("ffmpeg-static indisponível — vídeo da hero não foi gerado.");
} else {
  console.log("Renderizando vídeo do ritual (pode levar alguns minutos)...");
  renderRitualVideo({
    file: path.join(out, "hero-cartas.mp4"),
    width: 1600,
    height: 900,
    frames: wideFrames,
  });
  renderRitualVideo({
    file: path.join(out, "hero-cartas-mobile.mp4"),
    width: 720,
    height: 1080,
    frames: tallFrames,
  });
}

/* Poster: primeiro quadro estático (a foto de Amor), exibido antes do vídeo
   carregar e usado como único fundo em prefers-reduced-motion. */
const posterBase = await sharp(wideFrames[0])
  .resize(1600, 900, { fit: "cover", position: "center" })
  .toBuffer();
await sharp(posterBase).webp({ quality: 76 }).toFile(path.join(out, "hero-poster.webp"));
await sharp(posterBase).jpeg({ quality: 74 }).toFile(path.join(out, "hero-poster.jpg"));

const posterMobile = await sharp(tallFrames[0])
  .resize(720, 1080, { fit: "cover", position: "center" })
  .toBuffer();
await sharp(posterMobile).webp({ quality: 76 }).toFile(path.join(out, "hero-poster-mobile.webp"));

rmSync(temp, { recursive: true, force: true });
console.log("Assets gerados em public/brand");
