/**
 * Configuração do backend do app. Este arquivo NÃO importa o Supabase: serve para decidir,
 * sem carregar a biblioteca, se as telas reais podem funcionar neste build.
 */
const url = (import.meta.env.VITE_APP_SUPABASE_URL ?? "").trim();
const key = (import.meta.env.VITE_APP_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

/** Só aceita https://<ref>.supabase.co e uma chave de tamanho plausível. */
export const REMOTE_CONFIGURED = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) && key.length > 20;
export const REMOTE_URL = url;
export const REMOTE_KEY = key;

/** Aviso de ambiente (ex.: "Homologação"). Vazio = sem aviso. */
export const ENV_LABEL = (import.meta.env.VITE_APP_ENV_LABEL ?? "").trim();
