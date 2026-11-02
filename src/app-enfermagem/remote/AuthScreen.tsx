import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, Info, X } from "lucide-react";
import { BrandMark } from "../components/Brand";
import { ENV_LABEL } from "../config";
import { useAuth } from "./auth";
import { passwordOk, passwordRules } from "./password";

/** Moldura das telas de acesso (sem barra de navegação do app). */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fsl-app fsl-auth-page" data-mode="real">
      <main id="fsl-conteudo" className="fsl-auth" tabIndex={-1}>
        <div className="fsl-auth-brand">
          <BrandMark size={44} />
          <span className="fsl-brand-text">
            <span className="fsl-brand-name">FSLOBO</span>
            <span className="fsl-brand-sub">Enfermagem</span>
          </span>
        </div>
        {ENV_LABEL ? (
          <p className="fsl-modebar is-env" role="note">
            <Info size={18} aria-hidden="true" /> Ambiente de {ENV_LABEL.toLocaleLowerCase("pt-BR")}: use somente dados fictícios.
            Nunca informe dados de pacientes.
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}

type View = "login" | "signup" | "forgot" | "signup-sent" | "reset-sent";

const FLASH: Record<string, { tone: "ok" | "error"; text: string }> = {
  confirmado: { tone: "ok", text: "E-mail confirmado! Agora entre com o e-mail e a senha que você cadastrou." },
  otp_expired: { tone: "error", text: "O link de confirmação expirou ou já foi usado. Entre com sua senha; se o e-mail ainda não foi confirmado, peça um novo link." },
  link: { tone: "error", text: "Não foi possível validar o link. Peça um novo e-mail de confirmação." },
};

function Field(props: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  inputMode?: "email" | "text";
}) {
  return (
    <div className="fsl-field">
      <label htmlFor={props.id} className="fsl-label">
        {props.label}
      </label>
      <input
        id={props.id}
        className="fsl-input"
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required={props.required ?? true}
        aria-invalid={props.invalid ? true : undefined}
        aria-describedby={props.describedBy}
        inputMode={props.inputMode}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}

export default function AuthScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const q = new URLSearchParams(loc.search);
  const flash = q.get("confirmado") ? FLASH.confirmado : q.get("erro") ? (FLASH[q.get("erro") as string] ?? FLASH.link) : null;

  const [view, setView] = React.useState<View>("login");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ code: string; message: string } | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  // Trava síncrona: dois envios no mesmo instante (ex.: extensão do navegador) viram um só.
  const inFlight = React.useRef(false);

  // Já autenticado: segue para onde queria ir (ou para o início).
  React.useEffect(() => {
    if (auth.status === "signed_in") navigate(from && from.startsWith("/app") ? from : "/app", { replace: true });
  }, [auth.status, from, navigate]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const go = (v: View) => {
    setView(v);
    setError(null);
    setInfo(null);
    setPassword("");
    setShowPw(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || inFlight.current) return;
    setError(null);
    setInfo(null);
    // validação própria (o formulário usa noValidate): mensagens em português, acessíveis e consistentes
    if (view === "signup" && !name.trim()) return setError({ code: "name", message: "Informe como quer ser chamado(a)." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError({ code: "email", message: "Informe um e-mail válido." });
    if (view !== "forgot" && !password) return setError({ code: "password", message: "Informe a senha." });
    inFlight.current = true;
    setBusy(true);
    try {
      if (view === "login") {
        const r = await auth.signIn(email, password);
        if (!r.ok) setError(r);
      } else if (view === "signup") {
        if (!passwordOk(password)) {
          setError({ code: "weak", message: "A senha não atende à política abaixo." });
          return;
        }
        const r = await auth.signUp(name, email, password);
        if (!r.ok) setError(r);
        else {
          setPassword("");
          setView("signup-sent");
          setCooldown(60);
        }
      } else if (view === "forgot") {
        const r = await auth.requestReset(email);
        if (!r.ok) setError(r);
        else setView("reset-sent");
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function resend() {
    if (busy || inFlight.current || cooldown > 0) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const r = await auth.resendConfirmation(email);
    setBusy(false);
    inFlight.current = false;
    if (!r.ok) setError(r);
    else {
      setInfo("Enviamos um novo e-mail de confirmação.");
      setCooldown(60);
    }
  }

  const rules = passwordRules(password);

  if (view === "signup-sent") {
    return (
      <section className="fsl-auth-card" aria-labelledby="enviado-titulo">
        <h1 id="enviado-titulo" className="fsl-display fsl-display-l">Confirme seu e-mail</h1>
        <p className="fsl-auth-text">
          Se o endereço <strong>{email.trim()}</strong> puder receber a mensagem, enviamos um link de confirmação. Abra o
          e-mail, clique no link e depois volte aqui para entrar. Confira também a caixa de spam.
        </p>
        {error ? <p className="fsl-alert is-error" role="alert">{error.message}</p> : null}
        {info ? <p className="fsl-alert is-ok" role="status">{info}</p> : null}
        <button type="button" className="fsl-btn fsl-btn-outline fsl-btn-block" onClick={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `Reenviar e-mail (${cooldown}s)` : "Reenviar e-mail de confirmação"}
        </button>
        <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={() => go("login")}>
          Já confirmei, quero entrar
        </button>
      </section>
    );
  }

  if (view === "reset-sent") {
    return (
      <section className="fsl-auth-card" aria-labelledby="reset-titulo">
        <h1 id="reset-titulo" className="fsl-display fsl-display-l">Verifique seu e-mail</h1>
        <p className="fsl-auth-text">
          Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Abra o link no <strong>mesmo
          navegador</strong> em que você fez o pedido.
        </p>
        <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={() => go("login")}>
          Voltar para entrar
        </button>
      </section>
    );
  }

  const title = view === "login" ? "Entrar" : view === "signup" ? "Criar conta" : "Recuperar senha";

  return (
    <section className="fsl-auth-card" aria-labelledby="auth-titulo">
      <h1 id="auth-titulo" className="fsl-display fsl-display-l">{title}</h1>
      {view === "forgot" ? (
        <p className="fsl-auth-text">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
      ) : (
        <p className="fsl-auth-text">
          {view === "login" ? "Acesse seu progresso de estudo." : "Seu progresso e seus pontos ficam salvos na sua conta."}
        </p>
      )}

      {flash && view === "login" ? (
        <p className={`fsl-alert is-${flash.tone}`} role={flash.tone === "error" ? "alert" : "status"}>{flash.text}</p>
      ) : null}

      <form onSubmit={submit} noValidate className="fsl-auth-form">
        {view === "signup" ? (
          <Field id="nome" label="Como quer ser chamado(a)" type="text" value={name} onChange={setName} autoComplete="name" />
        ) : null}
        <Field id="email" label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
        {view !== "forgot" ? (
          <div className="fsl-field">
            <div className="fsl-label-row">
              <label htmlFor="senha" className="fsl-label">Senha</label>
              <button type="button" className="fsl-link-btn fsl-mini" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw}>
                {showPw ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <input
              id="senha"
              className="fsl-input"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={view === "login" ? "current-password" : "new-password"}
              required
              aria-describedby={view === "signup" ? "regras-senha" : undefined}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {view === "signup" ? (
              <ul id="regras-senha" className="fsl-pw-rules" aria-label="Regras da senha">
                {rules.map((r) => (
                  <li key={r.id} className={r.ok ? "is-ok" : ""}>
                    {r.ok ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <X size={16} strokeWidth={3} aria-hidden="true" />}
                    <span>{r.label}</span>
                    <span className="fsl-sr">{r.ok ? " (ok)" : " (falta)"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="fsl-alert is-error" role="alert">{error.message}</p> : null}
        {info ? <p className="fsl-alert is-ok" role="status">{info}</p> : null}

        <button type="submit" className="fsl-btn fsl-btn-green fsl-btn-block" disabled={busy}>
          {busy ? "Aguarde…" : view === "login" ? "Entrar" : view === "signup" ? "Criar conta" : "Enviar link"}
        </button>

        {view === "login" && error?.code === "email_not_confirmed" ? (
          <button type="button" className="fsl-btn fsl-btn-outline fsl-btn-block" onClick={resend} disabled={busy || cooldown > 0 || !email.trim()}>
            {cooldown > 0 ? `Reenviar e-mail (${cooldown}s)` : "Reenviar e-mail de confirmação"}
          </button>
        ) : null}
      </form>

      <div className="fsl-auth-links">
        {view === "login" ? (
          <>
            <button type="button" className="fsl-link-btn" onClick={() => go("forgot")}>Esqueci minha senha</button>
            <button type="button" className="fsl-link-btn" onClick={() => go("signup")}>Criar conta</button>
          </>
        ) : (
          <button type="button" className="fsl-link-btn" onClick={() => go("login")}>Já tenho conta: entrar</button>
        )}
      </div>

      <p className="fsl-demo-note">
        <Info size={16} aria-hidden="true" />
        <span>
          Quer só conhecer? Veja a <Link className="fsl-inline-link" to="/app/demo">demonstração</Link>, com dados ilustrativos e sem
          conta.
        </span>
      </p>
    </section>
  );
}
