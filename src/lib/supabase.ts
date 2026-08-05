/**
 * Cliente Supabase do frontend.
 *
 * Usa exclusivamente a chave pública (publishable/anon) — a única chave que
 * um navegador pode legitimamente conhecer. A chave service_role NUNCA deve
 * ser importada nem referenciada aqui: ela só existe do lado do servidor
 * (Edge Functions), onde ignora RLS e tem acesso operacional completo.
 *
 * Com o papel anon, este cliente só consegue o que a migration inicial
 * concedeu a esse papel: SELECT em packages ativos. Qualquer outra operação
 * (criar pedido, sortear cartas, gerar leitura...) acontece por trás de uma
 * Edge Function validada — nunca por este cliente falando direto com as
 * tabelas operacionais.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "[supabase] Variáveis de ambiente ausentes: VITE_SUPABASE_URL e/ou " +
      "VITE_SUPABASE_PUBLISHABLE_KEY não foram encontradas. Copie .env.example " +
      "para .env e preencha os dois valores (painel do Supabase → Project Settings → API).",
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
