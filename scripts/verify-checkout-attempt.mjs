#!/usr/bin/env node
/**
 * Teste automatizado leve para src/lib/checkoutAttempt.ts — o projeto não
 * tem um test runner instalado (sem vitest/jest no package.json), então
 * este script usa o esbuild que já é dependência transitiva do Vite para
 * transpilar o módulo TS em memória e testar diretamente as funções
 * exportadas (computeCheckoutFingerprint) e o comportamento de
 * ensureAttempt()/resetAttempt() com um sessionStorage/crypto simulados —
 * sem precisar renderizar React.
 *
 * Roda com: node scripts/verify-checkout-attempt.mjs
 * (chamado por `npm run verify:checkout-attempt`, ver package.json)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.join(__dirname, "..", "src", "lib", "checkoutAttempt.ts");

// ── Ambiente mínimo simulado (sem jsdom): React só precisa existir como
//    módulo importável — nenhuma das funções testadas aqui chama hooks,
//    então um stub vazio é suficiente. sessionStorage e crypto são
//    reimplementados de forma equivalente ao browser.
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
// Node já expõe globalThis.crypto (WebCrypto) nativamente desde a v19 —
// getRandomValues/randomUUID usados por checkoutAttempt.ts funcionam sem
// nenhum stub adicional aqui.

// React nunca é usado além de React.useCallback (identidade + memoização)
// pelas duas funções testadas aqui — trocado por um stub de identidade
// (useCallback(fn) => fn) para não precisar montar um componente/renderer
// React de verdade só para testar lógica pura.
const rawSource = readFileSync(modulePath, "utf8").replace('import * as React from "react";', "const React = globalThis.__ReactStub;");
globalThis.__ReactStub = { useCallback: (fn) => fn };

const { code } = await esbuild.transform(rawSource, { loader: "ts", format: "esm" });
const encoded = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const mod = await import(encoded);

const { computeCheckoutFingerprint, useCheckoutAttempt: useCheckoutAttemptRaw } = mod;

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

console.log("computeCheckoutFingerprint");

check("nome com espaço nas EXTREMIDADES e caixa diferente normaliza igual (== RPC: lower(btrim(customer_name)))", () => {
  const a = computeCheckoutFingerprint({ name: "Maria Silva", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const b = computeCheckoutFingerprint({ name: "  Maria Silva  ", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const c = computeCheckoutFingerprint({ name: "MARIA SILVA", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.equal(a, b);
  assert.equal(a, c);
});

check("nome com espaço DUPLICADO internamente NÃO normaliza igual (btrim não colapsa espaços internos)", () => {
  const a = computeCheckoutFingerprint({ name: "Maria Silva", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const b = computeCheckoutFingerprint({ name: "Maria  Silva", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(a, b);
});

check("e-mail continua usando trim + lowercase", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const b = computeCheckoutFingerprint({ name: "Maria", email: "  M@X.COM  ", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.equal(a, b);
});

check("ordem dos slugs não muda o fingerprint", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["a", "b"] });
  const b = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["b", "a"] });
  assert.equal(a, b);
});

check("slugs duplicados são deduplicados no fingerprint", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["a", "a", "b"] });
  const b = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["a", "b"] });
  assert.equal(a, b);
});

check("marcar um bump muda o fingerprint", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const b = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem", "guia-feridas-cronicas"] });
  assert.notEqual(a, b);
});

check("remover um bump muda o fingerprint", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem", "guia-feridas-cronicas"] });
  const b = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(a, b);
});

check("mudar o nome muda o fingerprint", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const b = computeCheckoutFingerprint({ name: "João", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(a, b);
});

check("mudar o e-mail muda o fingerprint", () => {
  const a = computeCheckoutFingerprint({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const b = computeCheckoutFingerprint({ name: "Maria", email: "outro@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(a, b);
});

console.log("\nuseCheckoutAttempt (ensureAttempt/resetAttempt, fora de um componente React)");

function freshStorage() {
  sessionStorage.clear();
}

check("1) guia sozinho em tentativa nova — gera um ID", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const attempt = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.match(attempt.checkoutRequestId, /^[0-9a-f-]{36}$/);
  assert.equal(attempt.checkoutAccessToken.length, 64);
});

check("2) guia + 1 bump ANTES do primeiro envio — ainda não há tentativa salva, gera direto com os slugs finais", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const attempt = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem", "guia-feridas-cronicas"] });
  assert.ok(attempt.checkoutRequestId);
});

check("3) retry idêntico reaproveita o MESMO checkout_request_id", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const input = { name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem", "guia-feridas-cronicas"] };
  const first = ensureAttempt(input);
  const retry = ensureAttempt(input); // simula reenvio após erro de rede, mesmo payload
  assert.equal(first.checkoutRequestId, retry.checkoutRequestId);
  assert.equal(first.checkoutAccessToken, retry.checkoutAccessToken);
});

check("4) após envio, MARCAR bump e reenviar gera um ID NOVO", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const first = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const second = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem", "guia-feridas-cronicas"] });
  assert.notEqual(first.checkoutRequestId, second.checkoutRequestId);
  assert.notEqual(first.checkoutAccessToken, second.checkoutAccessToken);
});

check("5) após envio, REMOVER bump e reenviar gera um ID NOVO", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const first = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem", "guia-feridas-cronicas"] });
  const second = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(first.checkoutRequestId, second.checkoutRequestId);
});

check("6) após envio, mudar NOME gera um ID NOVO", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const first = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const second = ensureAttempt({ name: "Maria Silva", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(first.checkoutRequestId, second.checkoutRequestId);
});

check("6b) após envio, mudar E-MAIL gera um ID NOVO", () => {
  freshStorage();
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const first = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  const second = ensureAttempt({ name: "Maria", email: "outro@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(first.checkoutRequestId, second.checkoutRequestId);
});

check("resetAttempt() força um ID novo mesmo com o MESMO payload", () => {
  freshStorage();
  const { ensureAttempt, resetAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const input = { name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] };
  const first = ensureAttempt(input);
  resetAttempt();
  const second = ensureAttempt(input);
  assert.notEqual(first.checkoutRequestId, second.checkoutRequestId);
});

check("estado antigo persistido SEM fingerprint (schema anterior) é descartado com segurança", () => {
  freshStorage();
  sessionStorage.setItem(
    "entre-nos-taro:checkout-attempt:guia-evolucao-enfermagem",
    JSON.stringify({ checkoutRequestId: "id-antigo", checkoutAccessToken: "token-antigo" }),
  );
  const { ensureAttempt } = useCheckoutAttemptRaw("guia-evolucao-enfermagem");
  const attempt = ensureAttempt({ name: "Maria", email: "m@x.com", productSlugs: ["guia-evolucao-enfermagem"] });
  assert.notEqual(attempt.checkoutRequestId, "id-antigo");
});

console.log(`\n${passed} verificação(ões) passaram.`);
if (process.exitCode) {
  console.error("Falhas encontradas.");
  process.exit(1);
}
