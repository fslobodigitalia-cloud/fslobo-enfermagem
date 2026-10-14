#!/usr/bin/env node
/**
 * Teste automatizado leve da oferta de order bumps do combo
 * (/guia-evolucao-medicamentos): cinco adicionais + pacote completo.
 * Mesmo padrão de scripts/verify-guia-kit.mjs: transpila os módulos TS em memória
 * com o esbuild (dependência transitiva do Vite) — sem React, sem rede, sem backend.
 *
 * Roda com: node scripts/verify-combo-kit.mjs  (npm run verify:combo-kit)
 *
 * Valida só a PRÉVIA visual e o payload montado no frontend; o preço cobrado de
 * verdade é sempre derivado e validado pelo servidor.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

async function loadTs(relativePath, patch = (source) => source) {
  const { code } = await esbuild.transform(patch(read(relativePath)), { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
globalThis.sessionStorage = makeMemoryStorage();
globalThis.__ReactStub = { useCallback: (fn) => fn };

const config = await loadTs("src/config/digitalProducts.ts");
const lib = await loadTs("src/lib/guiaKit.ts");
const attemptLib = await loadTs("src/lib/checkoutAttempt.ts", (source) =>
  source.replace('import * as React from "react";', "const React = globalThis.__ReactStub;"),
);

const {
  comboEvolucaoMedicamentosCompleteBumps: bumps,
  comboCompletePackageOffer: kit,
  comboEvolucaoMedicamentosProduct: combo,
  guiaEvolucaoBumps,
  guiaKitOffer,
} = config;
const { computeTotalCents, addKit, removeKit, toggleIndividual, buildProductSlugs, validateSelection, getBundleDisplay } = lib;
const { useCheckoutAttempt } = attemptLib;

const BASE = combo.priceCents; // fallback do combo (o catálogo pode sobrescrever)
const PRIMARY = combo.slug;
const FIVE = [
  "mapa-mental-ilustrado",
  "balanco-hidrico-bump",
  "exames-laboratoriais",
  "dicionario-termos-tecnicos",
  "feridas-curativos-coberturas",
];
const OLD_KIT = "kit-completo-enfermagem-bump";

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${label}`);
  } catch (err) {
    console.error(`FAIL  - ${label}`);
    console.error(err);
    process.exitCode = 1;
  }
}
const total = (selection, base = BASE) => computeTotalCents(base, selection, bumps, kit);

console.log("configuração");

check("combo principal: slug e fallback de R$ 17", () => {
  assert.equal(PRIMARY, "combo-evolucao-medicamentos");
  assert.equal(BASE, 1700);
});
check("exatamente cinco bumps, na ordem esperada, sem Medicamentos", () => {
  assert.equal(bumps.length, 5);
  assert.deepEqual(
    bumps.map((b) => b.slug),
    FIVE,
  );
  assert.ok(!bumps.some((b) => b.slug === "medicamentos-na-pratica"));
  assert.ok(!kit.memberSlugs.includes("medicamentos-na-pratica"));
  assert.deepEqual([...kit.memberSlugs], FIVE);
  assert.ok(bumps.every((b) => b.priceCents === 1000), "cada adicional continua R$ 10");
  assert.ok(bumps.every((b) => typeof b.image === "string" && b.image.length > 0), "todos têm capa");
});
check("pacote novo: slug definitivo, incremento 3290 e original 5000", () => {
  assert.equal(kit.slug, "pacote-completo-combo-medicamentos-bump");
  assert.equal(kit.priceCents, 3290);
  assert.equal(kit.originalPriceCents, 5000);
  assert.equal(kit.originalPriceCents, bumps.reduce((s, b) => s + b.priceCents, 0), "original = soma dos cinco separados");
  assert.ok(!bumps.some((b) => b.slug === kit.slug), "o pacote não está dentro da lista dos cards");
});
check("a página do Guia continua com seis bumps e o pacote antigo", () => {
  assert.equal(guiaEvolucaoBumps.length, 6);
  assert.ok(guiaEvolucaoBumps.some((b) => b.slug === "medicamentos-na-pratica"));
  assert.equal(guiaKitOffer.slug, OLD_KIT);
  assert.equal(guiaKitOffer.priceCents, 3990);
  assert.equal(guiaKitOffer.originalPriceCents, 6000);
  assert.notEqual(kit.slug, guiaKitOffer.slug);
});

console.log("totais");

check("sem adicionais 1700; um 2700; dois 3700; cinco separados 6700; pacote 4990", () => {
  assert.deepEqual(total(new Set()), { ok: true, totalCents: 1700 });
  assert.deepEqual(total(new Set([FIVE[0]])), { ok: true, totalCents: 2700 });
  assert.deepEqual(total(new Set([FIVE[0], FIVE[3]])), { ok: true, totalCents: 3700 });
  assert.deepEqual(total(new Set(FIVE)), { ok: true, totalCents: 6700 });
  assert.deepEqual(total(new Set([kit.slug])), { ok: true, totalCents: 4990 });
});
check("valores do bloco promocional derivam das fontes: normal 6700, total 4990, economia 1710", () => {
  const display = getBundleDisplay(BASE, kit);
  assert.deepEqual(display, { normalCents: 6700, totalCents: 4990, savingsCents: 1710 });
  assert.equal(display.normalCents, total(new Set(FIVE)).totalCents, "normal = total dos cinco separados");
  assert.equal(display.totalCents, total(addKit(kit)).totalCents, "total da promoção = total do checkout");
  assert.equal(getBundleDisplay(0, kit), null);
  assert.deepEqual(getBundleDisplay(1900, kit), { normalCents: 6900, totalCents: 5190, savingsCents: 1710 }, "acompanha o preço base do catálogo");
});

console.log("validação de seleção");

check("slugs desconhecidos, repetidos e Medicamentos separado são rejeitados", () => {
  assert.deepEqual(total(new Set(["slug-inventado"])), { ok: false, reason: "unknown_slug" });
  assert.deepEqual(total(new Set(["medicamentos-na-pratica"])), { ok: false, reason: "unknown_slug" });
  assert.deepEqual(total(new Set([FIVE[0], "medicamentos-na-pratica"])), { ok: false, reason: "unknown_slug" });
  assert.deepEqual(total([FIVE[0], FIVE[0]]), { ok: false, reason: "duplicate_slug" });
  assert.deepEqual(total([kit.slug, kit.slug]), { ok: false, reason: "duplicate_slug" });
  assert.deepEqual(computeTotalCents(0, new Set(), bumps, kit), { ok: false, reason: "invalid_base_price" });
  assert.equal(validateSelection(new Set(), bumps, kit).ok, true);
});
check("pacote novo junto de qualquer individual é inválido", () => {
  for (const slug of FIVE) {
    const r = total(new Set([kit.slug, slug]));
    assert.deepEqual(r, { ok: false, reason: "kit_with_individual" });
  }
  assert.equal(total(new Set([kit.slug, ...FIVE])).ok, false);
});
check("pacote novo junto do pacote antigo é inválido (slug desconhecido nesta oferta)", () => {
  assert.deepEqual(total(new Set([kit.slug, OLD_KIT])), { ok: false, reason: "unknown_slug" });
  assert.deepEqual(total(new Set([OLD_KIT])), { ok: false, reason: "unknown_slug" });
  assert.equal(buildProductSlugs(PRIMARY, new Set([kit.slug, OLD_KIT]), bumps, kit), null);
});

console.log("seleção exclusiva");

check("adicionar o pacote substitui os individuais; remover esvazia a seleção", () => {
  let selection = new Set();
  selection = toggleIndividual(selection, FIVE[0], bumps, kit);
  selection = toggleIndividual(selection, FIVE[1], bumps, kit);
  assert.equal(selection.size, 2);
  selection = addKit(kit);
  assert.deepEqual([...selection], [kit.slug]);
  assert.deepEqual(total(selection), { ok: true, totalCents: 4990 });
  selection = removeKit();
  assert.equal(selection.size, 0);
  assert.deepEqual(total(selection), { ok: true, totalCents: 1700 });
});
check("com o pacote ativo, alternar individual (ou Medicamentos) não muda nada", () => {
  const selection = addKit(kit);
  assert.equal(toggleIndividual(selection, FIVE[2], bumps, kit), selection);
  assert.equal(toggleIndividual(new Set(), "medicamentos-na-pratica", bumps, kit).size, 0);
});
check("alternar individual liga e desliga normalmente sem o pacote", () => {
  let selection = toggleIndividual(new Set(), FIVE[4], bumps, kit);
  assert.deepEqual([...selection], [FIVE[4]]);
  selection = toggleIndividual(selection, FIVE[4], bumps, kit);
  assert.equal(selection.size, 0);
});

console.log("payload");

check("payload individual: combo + individuais, sem o pacote", () => {
  const slugs = buildProductSlugs(PRIMARY, new Set([FIVE[1], FIVE[4]]), bumps, kit);
  assert.deepEqual(slugs, [PRIMARY, FIVE[1], FIVE[4]]);
  assert.ok(!slugs.includes(kit.slug));
  assert.ok(!slugs.includes("medicamentos-na-pratica"));
  assert.deepEqual(buildProductSlugs(PRIMARY, new Set(), bumps, kit), [PRIMARY]);
});
check("payload do pacote é exatamente [combo, pacote]", () => {
  const slugs = buildProductSlugs(PRIMARY, addKit(kit), bumps, kit);
  assert.deepEqual(slugs, ["combo-evolucao-medicamentos", "pacote-completo-combo-medicamentos-bump"]);
  for (const slug of FIVE) assert.ok(!slugs.includes(slug));
});
check("seleção inválida não gera payload", () => {
  assert.equal(buildProductSlugs(PRIMARY, new Set([kit.slug, FIVE[0]]), bumps, kit), null);
  assert.equal(buildProductSlugs(PRIMARY, new Set(["slug-inventado"]), bumps, kit), null);
  assert.equal(buildProductSlugs(PRIMARY, new Set(["medicamentos-na-pratica"]), bumps, kit), null);
});

console.log("tentativas de checkout (idempotência)");

const person = { name: "Maria", email: "m@x.com" };
const payloadFor = (selection) => buildProductSlugs(PRIMARY, selection, bumps, kit);

check("IDs de tentativa mudam quando a seleção muda; retry idêntico mantém a identidade", () => {
  sessionStorage.clear();
  const { ensureAttempt } = useCheckoutAttempt(PRIMARY);
  const none = ensureAttempt({ ...person, productSlugs: payloadFor(new Set()) });
  const withKit = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.notEqual(none.checkoutRequestId, withKit.checkoutRequestId);
  assert.notEqual(none.checkoutAccessToken, withKit.checkoutAccessToken);
  const retry = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.equal(withKit.checkoutRequestId, retry.checkoutRequestId);
  const afterRemove = ensureAttempt({ ...person, productSlugs: payloadFor(removeKit()) });
  assert.notEqual(withKit.checkoutRequestId, afterRemove.checkoutRequestId);
  const individuals = ensureAttempt({ ...person, productSlugs: payloadFor(new Set([FIVE[0], FIVE[1]])) });
  const replaced = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.notEqual(individuals.checkoutRequestId, replaced.checkoutRequestId);
});

console.log("copy");

check("a nova oferta não exibe R$ 39,90 nem usa o pacote antigo", () => {
  const page = read("src/pages/GuiaEvolucaoMedicamentosPage.tsx");
  const configSource = read("src/config/digitalProducts.ts");
  const comboBlock = configSource.slice(configSource.indexOf("COMBO_COMPLETE_BUMP_SLUGS"));
  assert.ok(!page.includes("39,90"), "página do combo sem 39,90");
  assert.ok(!comboBlock.includes("39,90") && !comboBlock.includes("3990"), "config do combo sem 39,90/3990");
  assert.ok(!page.includes("guiaKitOffer") && !page.includes("GUIA_KIT_SLUG") && !page.includes(OLD_KIT), "combo não referencia o pacote antigo");
  assert.ok(!page.includes("guiaEvolucaoBumps"), "combo não usa a lista dos seis bumps");
  for (const text of [
    "Complete sua biblioteca de enfermagem por apenas R$ 10 cada",
    "Complete sua biblioteca com os 7 materiais",
    "Seu combo já inclui o Guia de Evolução e Medicamentos na Prática. Leve também os outros 5 materiais.",
    "Quero os 7 materiais por",
  ]) assert.ok(page.includes(text), `copy ausente: ${text}`);
  assert.ok(page.includes("buildProductSlugs(comboProduct.slug"), "payload montado por buildProductSlugs");
});
check("o carrossel mantém os textos do Guia como padrão", () => {
  const source = read("src/components/guia/OrderBumpCarousel.tsx");
  for (const text of [
    "Complete seu material por apenas R$ 10 cada",
    "Leve o pacote completo com 7 materiais",
    "Seu Guia principal + todos os 6 materiais desta seção.",
    "Tenha tudo em um único pedido e prepare-se do plantão aos concursos.",
    "Quero os 7 materiais por",
    "Remover pacote completo",
  ]) assert.ok(source.includes(text), `padrão ausente: ${text}`);
  const guiaPage = read("src/pages/GuiaEvolucaoEnfermagemPage.tsx");
  assert.ok(!guiaPage.includes("copy="), "a página do Guia não sobrescreve nenhuma copy");
});

console.log(`\n${passed} verificação(ões) passaram.`);
if (process.exitCode) {
  console.error("Falhas encontradas.");
  process.exit(1);
}
