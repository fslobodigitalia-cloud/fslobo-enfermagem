// Servidor LOCAL de testes: roda o MESMO manipulador da Edge Function (validação, limites, logs), mas com um
// "modelo" SIMULADO por regras. Nada aqui chama o provedor real e não existe chave nenhuma.
//   deno run --config supabase/functions/practice-feedback/deno.json -A tests/ai-dev-server.ts 8799
// Controle (para os testes de navegador): GET /__mode?m=ok|net_fail|not_configured|slow|garbage  e  GET /__reset
import { createHandler, type Deps } from "../supabase/functions/practice-feedback/handler.ts";
import { ProviderError } from "../supabase/functions/practice-feedback/provider.ts";
import type { ModelOut } from "../supabase/functions/practice-feedback/validate.ts";

const port = Number(Deno.args[0] ?? 8799);
let mode = "ok";
let events: number[] = [];
const logs: Record<string, unknown>[] = [];
const WINDOW_MS = 10 * 60_000;
const LIMIT_WINDOW = 3;

const grab = (text: string, re: RegExp): string | null => {
  const m = text.match(new RegExp(`[^.;\\n]*(?:${re.source})[^.;\\n]*`, re.flags.includes("i") ? "i" : ""));
  return m ? m[0].trim() : null;
};

/** "Modelo" simulado: imita um avaliador razoável, inclusive com alguns erros típicos que o servidor deve barrar. */
function simulateModel(text: string): ModelOut {
  const out: ModelOut = { assessable: true, limitation: "", hits: [], findings: [] };
  if (text.replace(/[^a-zA-ZÀ-ú]/g, "").length < 15) return { assessable: false, limitation: "O texto não parece uma anotação de enfermagem.", hits: [], findings: [] };
  const facts: [string, RegExp, string][] = [
    ["F1", /desconforto|falta de ar|dispneia|respirar/i, "Não consta o relato de desconforto ao respirar e de dificuldade para dormir (22h10)."],
    ["F3", /\bdor\b/i, "Não consta a dor torácica, com a intensidade e o que a piora."],
    ["F4", /PA\s*\d|128|sinais vitais|SSVV/i, "Não constam os sinais vitais com os valores aferidos (22h15)."],
    ["F5", /cabeceira|elev/i, "Não consta o cuidado de elevar a cabeceira e a orientação (22h17)."],
    ["F6", /enfermeir|\bEnf\b/i, "Não consta a comunicação à enfermeira responsável (22h20)."],
    ["F7", /melhora|melhorou|adorm|dormi/i, "Não consta a resposta da pessoa às 22h40."],
  ];
  for (const [id, re, why] of facts) {
    const q = grab(text, re);
    if (q) out.hits.push({ rubric_id: id, quote: q });
    else out.findings.push({ category: "ausente", rubric_id: id, quote: null, explanation: why, certainty: "alta" });
  }
  // contradição de horário
  const wrong = text.match(/22h30[^.;\n]*/i);
  if (wrong) out.findings.push({ category: "contradicao", rubric_id: "F6", quote: wrong[0].trim(), explanation: "O caso informa que a enfermeira foi comunicada às 22h20, e não às 22h30.", certainty: "alta" });
  // informação não fornecida
  for (const re of [/oxig[eê]nio[^.;\n]*/i, /dipirona[^.;\n]*/i, /(a )?filha[^.;\n]*/i, /raio[- ]?x[^.;\n]*/i]) {
    const m = text.match(re);
    if (m) out.findings.push({ category: "nao_fornecida", rubric_id: "X1", quote: m[0].trim(), explanation: "O caso não traz essa informação.", certainty: "alta" });
  }
  // sugestões opcionais
  if (!/\d{1,2}\/\d{1,2}/.test(text)) out.findings.push({ category: "clareza", rubric_id: "N1", quote: null, explanation: "Comece o registro com a data e a hora.", certainty: "media" });
  if (!/assin|coren|\[/i.test(text)) out.findings.push({ category: "clareza", rubric_id: "N2", quote: null, explanation: "Termine com a assinatura e a identificação (fictícias na simulação).", certainty: "media" });
  if (/bem\b|muito|pouco/i.test(text)) { const q = grab(text, /\b(?:muito|pouco)\b/i); if (q) out.findings.push({ category: "clareza", rubric_id: "N6", quote: q.slice(0, 60), explanation: "Troque o termo de valor pelo dado observado.", certainty: "media" }); }
  if (/pcte/i.test(text)) out.findings.push({ category: "clareza", rubric_id: "N7", quote: "Pcte", explanation: "‘Pcte’ não é padronizada; prefira ‘pessoa’ ou ‘paciente’.", certainty: "baixa" });
  // erros típicos do modelo que o servidor precisa barrar:
  if (/SSVV/.test(text)) out.findings.push({ category: "clareza", rubric_id: "N7", quote: "SSVV", explanation: "Abreviatura.", certainty: "baixa" });
  if (/cabeceira/i.test(text)) out.findings.push({ category: "ausente", rubric_id: "F5", quote: null, explanation: "Faltou a cabeceira.", certainty: "baixa" });
  return out;
}

const deps: Deps = {
  get provider() {
    if (mode === "not_configured") return null;
    return async (text: string) => {
      if (mode === "net_fail") throw new ProviderError("unavailable", "http 500");
      if (mode === "slow") await new Promise((r) => setTimeout(r, 1500));
      if (mode === "garbage") throw new ProviderError("invalid_output");
      return { out: simulateModel(text), inputTokens: 2100, outputTokens: 640, model: "claude-sonnet-5-5 (simulado)" };
    };
  },
  authenticate: async (req) => (req.headers.get("Authorization") === "Bearer test-access-token" ? { userId: "00000000-0000-0000-0000-0000000000aa" } : null),
  acquire: async () => {
    const now = Date.now();
    events = events.filter((t) => now - t < WINDOW_MS);
    if (events.length >= LIMIT_WINDOW) return { allowed: false, reason: "rate_limited", retryAfter: Math.ceil((events[0] + WINDOW_MS - now) / 1000) };
    events.push(now);
    return { allowed: true, reason: "ok", retryAfter: 0, eventId: events.length };
  },
  release: async () => { events.pop(); },
  log: (e) => logs.push(e),
};
const handle = createHandler(deps);

Deno.serve({ port, hostname: "127.0.0.1", onListen() { console.log(`ai-dev-server em http://127.0.0.1:${port}`); } }, (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/__mode") { mode = u.searchParams.get("m") ?? "ok"; return new Response("ok " + mode); }
  if (u.pathname === "/__reset") { events = []; logs.length = 0; mode = "ok"; return new Response("reset"); }
  if (u.pathname === "/__logs") return new Response(JSON.stringify(logs), { headers: { "content-type": "application/json" } });
  return handle(req);
});
