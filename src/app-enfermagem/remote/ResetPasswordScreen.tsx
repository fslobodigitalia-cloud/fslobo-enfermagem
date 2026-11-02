import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useAuth } from "./auth";
import { passwordOk, passwordRules } from "./password";

/** Remove da barra de endereço qualquer parâmetro do link (code, tokens) sem recarregar a página. */
function scrubUrl() {
  try {
    window.history.replaceState(null, "", window.location.pathname);
  } catch {
    /* ignora */
  }
}

/**
 * Destino do link de recuperação de senha. O link traz um "code" (PKCE) que o cliente troca por uma
 * sessão sozinho; se vier com tokens no #hash (link gerado por administração), eles são aplicados uma
 * única vez e a URL é limpa. Nada disso é registrado.
 */
export default function ResetPasswordScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<"checking" | "form" | "invalid" | "done">("checking");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef(false); // trava síncrona contra envio duplicado

  React.useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status === "signed_in") {
      setPhase((p) => (p === "done" ? p : "form"));
      scrubUrl();
      return;
    }
    // sem sessão: pode ser link com tokens no #hash
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = h.get("access_token");
    const refresh = h.get("refresh_token");
    if (h.get("type") === "recovery" && access && refresh) {
      void auth.adoptRecoveryTokens(access, refresh).then((ok) => {
        scrubUrl();
        setPhase(ok ? "form" : "invalid");
      });
    } else {
      scrubUrl();
      setPhase("invalid");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || inFlight.current) return;
    setError(null);
    if (!passwordOk(password)) return setError("A senha não atende à política abaixo.");
    if (password !== confirm) return setError("As duas senhas precisam ser iguais.");
    inFlight.current = true;
    setBusy(true);
    const r = await auth.updatePassword(password);
    setBusy(false);
    inFlight.current = false;
    if (!r.ok) return setError(r.message);
    setPassword("");
    setConfirm("");
    setPhase("done");
  }

  if (phase === "checking") {
    return (
      <section className="fsl-auth-card" aria-busy="true">
        <h1 className="fsl-display fsl-display-l">Verificando o link…</h1>
      </section>
    );
  }

  if (phase === "invalid") {
    return (
      <section className="fsl-auth-card" aria-labelledby="invalido-titulo">
        <h1 id="invalido-titulo" className="fsl-display fsl-display-l">Link inválido ou expirado</h1>
        <p className="fsl-auth-text">
          Peça um novo link de recuperação e abra-o no mesmo navegador em que fez o pedido.
        </p>
        <button type="button" className="fsl-btn fsl-btn-navy fsl-btn-block" onClick={() => navigate("/app/entrar", { replace: true })}>
          Voltar para entrar
        </button>
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section className="fsl-auth-card" aria-labelledby="ok-titulo">
        <h1 id="ok-titulo" className="fsl-display fsl-display-l">Senha alterada</h1>
        <p className="fsl-alert is-ok" role="status">Pronto! Sua nova senha já vale.</p>
        <button type="button" className="fsl-btn fsl-btn-green fsl-btn-block" onClick={() => navigate("/app", { replace: true })}>
          Ir para o app
        </button>
      </section>
    );
  }

  const rules = passwordRules(password);
  return (
    <section className="fsl-auth-card" aria-labelledby="nova-titulo">
      <h1 id="nova-titulo" className="fsl-display fsl-display-l">Nova senha</h1>
      <form onSubmit={submit} noValidate className="fsl-auth-form">
        {/* Campo de usuário oculto: gerenciadores de senha precisam dele para salvar a nova senha da conta certa. */}
        <input type="text" name="username" autoComplete="username" value={auth.email} readOnly tabIndex={-1} aria-hidden="true" className="fsl-sr" />
        <div className="fsl-field">
          <label htmlFor="nova" className="fsl-label">Nova senha</label>
          <input id="nova" className="fsl-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" required aria-describedby="regras-nova" autoCapitalize="none" spellCheck={false} />
          <ul id="regras-nova" className="fsl-pw-rules" aria-label="Regras da senha">
            {rules.map((r) => (
              <li key={r.id} className={r.ok ? "is-ok" : ""}>
                {r.ok ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <X size={16} strokeWidth={3} aria-hidden="true" />}
                <span>{r.label}</span>
                <span className="fsl-sr">{r.ok ? " (ok)" : " (falta)"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="fsl-field">
          <label htmlFor="confirma" className="fsl-label">Repita a nova senha</label>
          <input id="confirma" className="fsl-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password" required autoCapitalize="none" spellCheck={false} />
        </div>
        {error ? <p className="fsl-alert is-error" role="alert">{error}</p> : null}
        <button type="submit" className="fsl-btn fsl-btn-green fsl-btn-block" disabled={busy}>
          {busy ? "Aguarde…" : "Salvar nova senha"}
        </button>
      </form>
    </section>
  );
}
