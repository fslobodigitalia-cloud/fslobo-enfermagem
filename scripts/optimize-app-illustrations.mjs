#!/usr/bin/env node
/**
 * Gera as ilustrações do app (/app) em WebP com transparência, aparadas e em
 * três larguras. Uso: node scripts/optimize-app-illustrations.mjs <pasta-origem>
 * (a pasta deve conter app-estudo, app-pratica e app-conquistas, PNG sem extensão).
 * Saída: public/fslobo-app/<nome>-<largura>.webp — servidas só pelas rotas /app.
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) throw new Error("Informe a pasta de origem.");
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "fslobo-app");
const widths = [480, 800, 1100];

for (const name of ["estudo", "pratica", "conquistas"]) {
  const trimmed = await sharp(path.join(src, `app-${name}`)).trim({ threshold: 8 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log(name, "aparada:", meta.width + "x" + meta.height);
  for (const w of widths) {
    const info = await sharp(trimmed)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 5 })
      .toFile(path.join(out, `${name}-${w}.webp`));
    console.log(`  ${name}-${w}.webp ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
  }
}
