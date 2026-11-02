/// <reference types="vite/client" />

/**
 * Variáveis de ambiente EXCLUSIVAS do app (/app). Nomes diferentes dos da loja
 * (VITE_SUPABASE_*) de propósito: o app fala com um projeto Supabase próprio e
 * nunca com o da loja. Só chaves PÚBLICAS (a "anon"/"publishable").
 */
interface ImportMetaEnv {
  readonly VITE_APP_SUPABASE_URL?: string;
  readonly VITE_APP_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Texto de aviso de ambiente (ex.: "Homologação"). Vazio em produção. */
  readonly VITE_APP_ENV_LABEL?: string;
}
