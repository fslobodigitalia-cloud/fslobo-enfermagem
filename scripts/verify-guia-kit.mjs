#!/usr/bin/env node
/**
 * Teste automatizado leve da regra de seleção/preço do "Kit Completo" do Guia
 * (src/lib/guiaKit.ts) e da interação dela com as tentativas de checkout
 * (src/lib/checkoutAttempt.ts). Mesmo padrão de scripts/verify-checkout-attempt.mjs:
 * usa o esbuild que já é dependência transitiva do Vite para transpilar os
 * módulos TS em memória — sem renderizar React, sem rede, sem backend.
 *
 * Roda com: node scripts/verify-guia-kit.mjs
 * (chamado por `npm run verify:guia-kit`, ver package.json)
 *
 * Lembrete: isto valida só a PRÉVIA visual e o payload montado no frontend.
 * O preço cobrado de verdade é sempre derivado e validado pelo servidor.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadTs(relativePath, patch = (source) => source) {
  const raw = patch(readFileSync(path.join(root, relativePath), "utf8"));
  const { code } = await esbuild.transform(raw, { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

// Ambiente mínimo simulado para checkoutAttempt.ts (sessionStorage + React stub).
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
const kitLib = await loadTs("src/lib/guiaKit.ts");
const attemptLib = await loadTs("src/lib/checkoutAttempt.ts", (source) =>
  source.replace('import * as React from "react";', "const React = globalThis.__ReactStub;"),
);

const { guiaEvolucaoBumps: bumps, guiaKitOffer: kit, guiaEvolucaoProduct } = config;
const { computeTotalCents, addKit, removeKit, toggleIndividual, buildProductSlugs, validateSelection } = kitLib;
const { useCheckoutAttempt } = attemptLib;

const BASE = 1000;
const PRIMARY = guiaEvolucaoProduct.slug;
const SIX = bumps.map((b) => b.slug);

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
const total = (selection) => computeTotalCents(BASE, selection, bumps, kit);

console.log("configuração do kit");

check("kit tem o slug definitivo, R$ 39,90, original R$ 60,00 e os seis membros", () => {
  assert.equal(kit.slug, "kit-completo-enfermagem-bump");
  assert.equal(kit.priceCents, 3990);
  assert.equal(kit.originalPriceCents, 6000);
  assert.deepEqual([...kit.memberSlugs].sort(), [...SIX].sort());
  assert.equal(SIX.length, 6);
  assert.ok(!SIX.includes(kit.slug), "o kit não pode estar dentro do array dos seis cards");
  assert.ok(bumps.every((b) => b.priceCents === 1000), "preço individual continua R$ 10");
  assert.equal(kit.originalPriceCents - kit.priceCents, 2010, "economia = R$ 20,10");
  assert.equal(kit.originalPriceCents, bumps.reduce((s, b) => s + b.priceCents, 0));
});

console.log("total");

check("1) sem adicionais = 1000", () => {
  assert.deepEqual(total(new Set()), { ok: true, totalCents: 1000 });
});
check("2) um individual = 2000", () => {
  assert.deepEqual(total(new Set([SIX[0]])), { ok: true, totalCents: 2000 });
});
check("3) dois individuais = 3000", () => {
  assert.deepEqual(total(new Set([SIX[0], SIX[3]])), { ok: true, totalCents: 3000 });
});
check("4) seis individuais = 7000", () => {
  assert.deepEqual(total(new Set(SIX)), { ok: true, totalCents: 7000 });
});
check("5) kit = 4990", () => {
  assert.deepEqual(total(new Set([kit.slug])), { ok: true, totalCents: 4990 });
});
check("6) kit + qualquer individual é inválido", () => {
  for (const slug of SIX) {
    const r = total(new Set([kit.slug, slug]));
    assert.equal(r.ok, false);
    assert.equal(r.reason, "kit_with_individual");
  }
  assert.equal(total(new Set([kit.slug, ...SIX])).ok, false);
});
check("7) slug desconhecido é inválido (e slug repetido também)", () => {
  assert.deepEqual(total(new Set(["slug-inventado"])), { ok: false, reason: "unknown_slug" });
  assert.deepEqual(total(new Set([SIX[0], "2000-questoes-enfermagem"])), { ok: false, reason: "unknown_slug" });
  assert.deepEqual(total([SIX[0], SIX[0]]), { ok: false, reason: "duplicate_slug" });
  assert.deepEqual(computeTotalCents(0, new Set(), bumps, kit), { ok: false, reason: "invalid_base_price" });
  assert.equal(validateSelection(new Set(), bumps, kit).ok, true);
});

console.log("seleção exclusiva");

check("8) adicionar o kit limpa os individuais (substitui a seleção)", () => {
  let selection = new Set();
  selection = toggleIndividual(selection, SIX[0], bumps, kit);
  selection = toggleIndividual(selection, SIX[1], bumps, kit);
  assert.equal(selection.size, 2);
  selection = addKit(kit);
  assert.deepEqual([...selection], [kit.slug]);
  assert.deepEqual(total(selection), { ok: true, totalCents: 4990 });
});
check("   com o kit ativo, alternar um individual não muda nada (mesma instância)", () => {
  const selection = addKit(kit);
  const after = toggleIndividual(selection, SIX[2], bumps, kit);
  assert.equal(after, selection);
  assert.deepEqual([...after], [kit.slug]);
  const unknown = toggleIndividual(new Set(), "slug-inventado", bumps, kit);
  assert.equal(unknown.size, 0);
});
check("9) remover o kit volta a vazio (não restaura individuais antigos)", () => {
  const selection = removeKit();
  assert.equal(selection.size, 0);
  assert.deepEqual(total(selection), { ok: true, totalCents: 1000 });
});
check("   alternar individual liga e desliga normalmente sem o kit", () => {
  let selection = new Set();
  selection = toggleIndividual(selection, SIX[4], bumps, kit);
  assert.deepEqual([...selection], [SIX[4]]);
  selection = toggleIndividual(selection, SIX[4], bumps, kit);
  assert.equal(selection.size, 0);
});

console.log("payload");

check("10) payload do kit contém só principal + kit (nunca os seis membros)", () => {
  const slugs = buildProductSlugs(PRIMARY, addKit(kit), bumps, kit);
  assert.deepEqual(slugs, [PRIMARY, kit.slug]);
  for (const slug of SIX) assert.ok(!slugs.includes(slug));
});
check("11) payload individual não contém o kit", () => {
  const slugs = buildProductSlugs(PRIMARY, new Set([SIX[1], SIX[5]]), bumps, kit);
  assert.deepEqual(slugs, [PRIMARY, SIX[1], SIX[5]]);
  assert.ok(!slugs.includes(kit.slug));
  assert.deepEqual(buildProductSlugs(PRIMARY, new Set(), bumps, kit), [PRIMARY]);
});
check("   payload de seleção inválida é rejeitado (null)", () => {
  assert.equal(buildProductSlugs(PRIMARY, new Set([kit.slug, SIX[0]]), bumps, kit), null);
  assert.equal(buildProductSlugs(PRIMARY, new Set(["slug-inventado"]), bumps, kit), null);
});

console.log("tentativas de checkout (idempotência)");

const person = { name: "Maria", email: "m@x.com" };
function freshAttempts() {
  sessionStorage.clear();
  return useCheckoutAttempt(PRIMARY);
}
const payloadFor = (selection) => buildProductSlugs(PRIMARY, selection, bumps, kit);

check("12) IDs de tentativa mudam quando a seleção muda (add kit, remover kit, trocar individuais pelo kit)", () => {
  const { ensureAttempt } = freshAttempts();
  const none = ensureAttempt({ ...person, productSlugs: payloadFor(new Set()) });
  const withKit = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.notEqual(none.checkoutRequestId, withKit.checkoutRequestId);
  assert.notEqual(none.checkoutAccessToken, withKit.checkoutAccessToken);

  const afterRemove = ensureAttempt({ ...person, productSlugs: payloadFor(removeKit()) });
  assert.notEqual(withKit.checkoutRequestId, afterRemove.checkoutRequestId);

  const individuals = ensureAttempt({ ...person, productSlugs: payloadFor(new Set([SIX[0], SIX[1]])) });
  const replacedByKit = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.notEqual(individuals.checkoutRequestId, replacedByKit.checkoutRequestId);
});
check("13) retry idêntico mantém a identidade (kit e individual) e a ordenação dos slugs é determinística", () => {
  const { ensureAttempt } = freshAttempts();
  const first = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  const retry = ensureAttempt({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.equal(first.checkoutRequestId, retry.checkoutRequestId);
  assert.equal(first.checkoutAccessToken, retry.checkoutAccessToken);

  const a = attemptLib.computeCheckoutFingerprint({ ...person, productSlugs: payloadFor(new Set([SIX[3], SIX[0]])) });
  const b = attemptLib.computeCheckoutFingerprint({ ...person, productSlugs: payloadFor(new Set([SIX[0], SIX[3]])) });
  assert.equal(a, b, "a ordem em que os itens foram marcados não importa");
  const kitPrint = attemptLib.computeCheckoutFingerprint({ ...person, productSlugs: payloadFor(addKit(kit)) });
  assert.ok(kitPrint.includes(kit.slug));
  assert.ok(!kitPrint.includes(SIX[0]));
});

console.log("promoção do pacote (7 materiais)");

check("valores exibidos derivam das fontes de preço: normal 7000, total 4990, economia 2010", () => {
  const display = kitLib.getBundleDisplay(BASE, kit);
  assert.deepEqual(display, { normalCents: 7000, totalCents: 4990, savingsCents: 2010 });
  assert.equal(display.normalCents, BASE + bumps.reduce((s, b) => s + b.priceCents, 0), "normal = principal + seis separados");
  assert.equal(display.totalCents, total(addKit(kit)).totalCents, "o total da promoção é igual ao total do checkout com o kit");
  assert.equal(kit.priceCents, 3990, "preço interno do SKU do kit permanece 3990");
  assert.equal(kitLib.getBundleDisplay(0, kit), null);
  // acompanha uma mudança do preço base (ex.: catálogo): nada fica duplicado/fixo no bloco
  assert.deepEqual(kitLib.getBundleDisplay(1200, kit), { normalCents: 7200, totalCents: 5190, savingsCents: 2010 });
});

check("o bloco promocional não exibe R$ 39,90 e usa a copy do pacote de 7 materiais", () => {
  const source = readFileSync(path.join(root, "src/components/guia/OrderBumpCarousel.tsx"), "utf8");
  assert.ok(!source.includes("39,90"), "nenhum literal 39,90 no componente");
  assert.ok(!/formatCents\(\s*kit\.priceCents/.test(source), "o preço interno do kit não é renderizado");
  for (const text of [
    "Leve o pacote completo com 7 materiais",
    "Seu Guia principal + todos os 6 materiais desta seção.",
    "Tenha tudo em um único pedido e prepare-se do plantão aos concursos.",
    "Pacote completo adicionado",
    "Remover pacote completo",
    "Quero os 7 materiais por",
    "Incluído no pacote",
    "no pacote completo",
  ]) assert.ok(source.includes(text), `copy ausente: ${text}`);
  assert.ok(!/Incluído no kit/.test(source), "o selo dos cards deve dizer pacote, não kit");
  assert.ok(!/ no kit completo/.test(source), "anúncio acessível deve dizer pacote");
});

console.log(`\n${passed} verificação(ões) passaram.`);
if (process.exitCode) {
  console.error("Falhas encontradas.");
  process.exit(1);
}
