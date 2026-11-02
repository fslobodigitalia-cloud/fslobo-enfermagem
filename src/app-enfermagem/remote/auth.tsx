import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getAppSupabase } from "./appSupabase";
import { api, type Profile } from "./rpc";
import { purgeCleanAccountCache } from "../practiceStore";

/**
 * Autenticação do app (e-mail e senha, com confirmação de e-mail obrigatória).
 * Regras de privacidade deste arquivo:
 *  - nunca registra senha, token, código ou e-mail em console, URL ou rastreamento;
 *  - mensagens ao usuário são fixas, em português (não repetem o texto do servidor);
 *  - não cria conta a partir de pedidos: o cadastro é sempre um ato explícito do próprio usuário.
 */
export type AuthResult = { ok: true } | { ok: false; code: string; message: string };

type Status = "loading" | "signed_out" | "signed_in";

type Ctx = {
  status: Status;
  user: User | null;
  email: string;
  profile: Profile | null;
  profileError: boolean;
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  requestReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  saveProfile: (name: string, focus: string | null, goal: number) => Promise<AuthResult>;
  /** Para a tela de redefinição: aplica tokens de recuperação recebidos no #hash do link. */
  adoptRecoveryTokens: (access: string, refresh: string) => Promise<boolean>;
};

const AuthContext = React.createContext<Ctx | null>(null);

export function useAuth(): Ctx {
  const c = React.useContext(AuthContext);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}

const origin = () => window.location.origin;
/** Página ESTÁTICA (sem pixel nem app) que recebe o redirecionamento do link de confirmação. */
const confirmUrl = () => `${origin()}/fslobo-app/confirmado.html`;

function authMessage(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; status?: number; message?: string } | null;
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? "");
  switch (code) {
    case "invalid_credentials":
      return { code, message: "E-mail ou senha incorretos." };
    case "email_not_confirmed":
      return { code, message: "Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo abaixo." };
    case "weak_password":
      return { code, message: "A senha não atende à política: mínimo de 10 caracteres, com maiúscula, minúscula e número." };
    case "same_password":
      return { code, message: "A nova senha precisa ser diferente da atual." };
    case "over_email_send_rate_limit": {
      // Dois casos usam o mesmo código: o intervalo por endereço ("...only request this after N seconds")
      // e a cota de e-mails do projeto ("email rate limit exceeded"). Só o primeiro depende do que o usuário fez.
      const wait = msg.match(/after (\d+) second/i);
      if (wait) {
        return { code: "email_frequency", message: `Um e-mail foi enviado há pouco para este endereço. Aguarde ${wait[1]} segundos para pedir outro.` };
      }
      return { code: "email_unavailable", message: "O envio de e-mails está temporariamente indisponível. Tente novamente em alguns minutos. Sua conta não foi alterada." };
    }
    case "over_request_rate_limit":
      return { code, message: "O serviço recebeu muitas solicitações desta rede em pouco tempo. Aguarde alguns minutos e tente de novo." };
    case "email_address_not_authorized":
      return { code, message: "Neste ambiente de homologação, o e-mail de confirmação só é enviado a endereços autorizados." };
    case "email_address_invalid":
      return { code, message: "Este endereço de e-mail não é aceito. Confira se digitou corretamente." };
    case "signup_disabled":
      return { code, message: "O cadastro está desativado no momento." };
    case "validation_failed":
      return { code, message: "Confira o e-mail e a senha informados." };
    default:
      if (/not authorized|cannot be used/i.test(msg)) {
        return { code: "email_address_not_authorized", message: "Neste ambiente de homologação, o e-mail de confirmação só é enviado a endereços autorizados." };
      }
      if (/fetch|network|failed to/i.test(msg)) return { code: "network", message: "Sem conexão com o servidor. Verifique sua internet." };
      return { code: code || "unknown", message: "Não foi possível concluir agora. Tente de novo em instantes." };
  }
}

const fail = (err: unknown): AuthResult => ({ ok: false, ...authMessage(err) });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [profileError, setProfileError] = React.useState(false);
  const [recovery, setRecovery] = React.useState(false);

  React.useEffect(() => {
    const sb = getAppSupabase();
    let alive = true;
    const { data } = sb.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRecovery(false);
      }
      setLoading(false);
    });
    void sb.auth.getSession().then(({ data: d }) => {
      if (!alive) return;
      setSession((cur) => cur ?? d.session);
      setLoading(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const metaName = String((session?.user.user_metadata as { display_name?: unknown } | undefined)?.display_name ?? "");

  // Carrega (ou cria, no primeiro acesso) o perfil de estudo do próprio usuário.
  React.useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let alive = true;
    setProfileError(false);
    // fora do callback do onAuthStateChange, para não travar o cliente
    const t = window.setTimeout(async () => {
      try {
        const sb = getAppSupabase();
        const { data, error } = await sb
          .from("study_profiles")
          .select("display_name, exam_focus, weekly_goal")
          .maybeSingle();
        if (error) throw error;
        let p = data as Profile | null;
        if (!p) {
          const name = metaName.trim().slice(0, 60) || "Aluno";
          p = await api.upsertProfile(name, null, 5);
        }
        if (alive) setProfile(p);
      } catch {
        if (alive) setProfileError(true);
      }
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [userId, metaName]);

  const value = React.useMemo<Ctx>(() => {
    const sb = () => getAppSupabase();
    return {
      status: loading ? "loading" : session ? "signed_in" : "signed_out",
      user: session?.user ?? null,
      email: session?.user.email ?? "",
      profile,
      profileError,
      recovery,
      async signIn(email, password) {
        const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
        return error ? fail(error) : { ok: true };
      },
      async signUp(name, email, password) {
        const { error } = await sb().auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: confirmUrl(), data: { display_name: name.trim().slice(0, 60) } },
        });
        return error ? fail(error) : { ok: true };
      },
      async resendConfirmation(email) {
        const { error } = await sb().auth.resend({
          type: "signup",
          email: email.trim(),
          options: { emailRedirectTo: confirmUrl() },
        });
        return error ? fail(error) : { ok: true };
      },
      async requestReset(email) {
        const { error } = await sb().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${origin()}/app/redefinir-senha`,
        });
        return error ? fail(error) : { ok: true };
      },
      async updatePassword(password) {
        const { error } = await sb().auth.updateUser({ password });
        if (error) return fail(error);
        setRecovery(false);
        return { ok: true };
      },
      async signOut() {
        // "local": encerra só este navegador; não derruba as outras sessões do usuário.
        const uid = session?.user.id;
        await sb().auth.signOut({ scope: "local" });
        // tira deste navegador o cache da Prática desse usuário se tudo já está salvo na conta; o que não foi salvo fica (só abre para ele)
        if (uid) purgeCleanAccountCache(uid);
        setProfile(null);
      },
      async saveProfile(name, focus, goal) {
        try {
          const p = await api.upsertProfile(name.trim(), focus && focus.trim() ? focus.trim() : null, goal);
          setProfile(p);
          return { ok: true };
        } catch {
          return { ok: false, code: "profile", message: "Não foi possível salvar o perfil agora. Confira os dados e tente de novo." };
        }
      },
      async adoptRecoveryTokens(access, refresh) {
        const { error } = await sb().auth.setSession({ access_token: access, refresh_token: refresh });
        if (!error) setRecovery(true);
        return !error;
      },
    };
  }, [loading, session, profile, profileError, recovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
