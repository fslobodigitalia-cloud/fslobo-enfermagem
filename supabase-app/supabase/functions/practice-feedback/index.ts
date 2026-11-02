/**
 * Edge Function "practice-feedback" (homologação). Correção educativa assistida por IA, piloto de UM exercício.
 *
 * Segredos (nunca no código): ANTHROPIC_API_KEY (obrigatório para ligar a IA; exclusivo do app), AI_MODEL e
 * AI_EFFORT (opcionais). SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são fornecidos pela plataforma
 * e ficam só aqui no servidor. Sem ANTHROPIC_API_KEY a função responde "ai_not_configured" e não chama ninguém.
 */
import { createClient } from "@supabase/supabase-js";
import { createHandler, type Acquire } from "./handler.ts";
import { makeAnthropicProvider, type Effort } from "./provider.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const aiKey = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
const effortEnv = Deno.env.get("AI_EFFORT");
const effort: Effort = effortEnv === "low" || effortEnv === "high" ? effortEnv : "medium";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin = () => createClient(url, serviceKey, noSession);

const handler = createHandler({
  provider: aiKey ? makeAnthropicProvider({ apiKey: aiKey, model: Deno.env.get("AI_MODEL") || undefined, effort }) : null,
  log: (entry) => console.log(JSON.stringify({ fn: "practice-feedback", ...entry })),
  async authenticate(req) {
    const h = req.headers.get("Authorization") ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    if (!token || !url || !anonKey) return null;
    const { data, error } = await createClient(url, anonKey, noSession).auth.getUser(token);
    const u = data?.user;
    // Só conta real: usuário autenticado, não anônimo, com e-mail confirmado.
    if (error || !u || u.is_anonymous || !u.email_confirmed_at) return null;
    return { userId: u.id };
  },
  async acquire(userId): Promise<Acquire> {
    const { data, error } = await admin().rpc("study_ai_acquire", { p_user: userId });
    if (error || !data) throw new Error("acquire");
    const d = data as { allowed: boolean; reason: string; retry_after_seconds: number; event_id?: number };
    return { allowed: !!d.allowed, reason: String(d.reason), retryAfter: Number(d.retry_after_seconds) || 0, eventId: d.event_id };
  },
  async release(userId, eventId) {
    await admin().rpc("study_ai_release", { p_user: userId, p_event_id: eventId });
  },
});

Deno.serve(handler);
