/**
 * Cliente Supabase EXCLUSIVO do app.
 *
 *  - Só a chave PÚBLICA (anon/publishable). A service_role nunca existe no navegador.
 *  - Sessão em chave própria de localStorage ("fslobo-app-auth"): não reaproveita nada da loja
 *    (carrinho, pedidos, parâmetros de campanha) nem o cliente de src/lib/supabase.ts.
 *  - Este módulo só é carregado pelas rotas reais do /app (import dinâmico a partir de index.tsx).
 *    As páginas de venda nunca o importam.
 *  - flowType "pkce": o link de recuperação de senha traz só um "code" inútil sem o verificador
 *    guardado neste navegador.
 *  - Nada aqui registra senha, token ou e-mail.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REMOTE_CONFIGURED, REMOTE_KEY, REMOTE_URL } from "../config";

export const APP_AUTH_STORAGE_KEY = "fslobo-app-auth";

let client: SupabaseClient | null = null;

export function getAppSupabase(): SupabaseClient {
  if (!REMOTE_CONFIGURED) throw new Error("backend do app não configurado neste build");
  if (!client) {
    client = createClient(REMOTE_URL, REMOTE_KEY, {
      auth: {
        storageKey: APP_AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}
