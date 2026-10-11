import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./TurnstileWidget";
import { useCheckoutAttempt } from "@/lib/checkoutAttempt";
import { cardAvailable, createCardOrder, tokenizeCard, type CardCheckoutResult } from "@/lib/cardCheckout";
import { getOrderDownloads, type DownloadItem } from "@/lib/orderDownloads";
import { clearOrderAccess, readOrderAccess, saveOrderAccess } from "@/lib/orderAccess";
import { ProductDownloads } from "@/components/product/ProductDownloads";

const digits = (value: string) => value.replace(/\D/g, "");
const terminalStatuses = new Set(["failed", "cancelled", "refunded", "expired"]);

/** Alternativa independente ao Pix; PAN/CVV ficam apenas no estado deste formulário. */
export function CardCheckoutPanel({ storageKey, productName, productSlugs }: {
  storageKey: string; productName: string; productSlugs: string[];
}) {
  const key = `${storageKey}:credit-card`;
  const { ensureAttempt, resetAttempt } = useCheckoutAttempt(key);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [cpf, setCpf] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [year, setYear] = React.useState("");
  const [cvv, setCvv] = React.useState("");
  const [token, setToken] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [outcome, setOutcome] = React.useState<CardCheckoutResult | null>(null);
  const [accessToken, setAccessToken] = React.useState("");
  const [downloads, setDownloads] = React.useState<DownloadItem[] | null>(null);
  const [restoring, setRestoring] = React.useState(() => readOrderAccess(key) !== null);
  const turnstile = React.useRef<TurnstileWidgetHandle>(null);
  const slugs = productSlugs.join("|");
  const handleTurnstileToken = React.useCallback((value: string) => {
    setToken(value);
  }, []);
  const handleTurnstileExpire = React.useCallback(() => {
    setToken(null);
  }, []);
  const handleTurnstileError = React.useCallback(() => {
    setToken(null);
  }, []);

  React.useEffect(() => {
    const previous = readOrderAccess(key);
    if (!previous) return;
    let active = true;
    let timer: number | undefined;
    const check = () => { void getOrderDownloads(previous.publicId, previous.checkoutAccessToken).then((result) => {
      if (!active) return;
      if (result.kind === "paid") {
        setDownloads(result.downloads); setOpen(true); window.clearInterval(timer);
      } else if (result.kind === "waiting" && terminalStatuses.has(result.status)) {
        clearOrderAccess(key); resetAttempt(); setRestoring(false); window.clearInterval(timer);
      }
    }); };
    check();
    timer = window.setInterval(check, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [key, resetAttempt]);

  React.useEffect(() => {
    if (!outcome || outcome.kind === "error" || outcome.kind === "declined" || downloads || !accessToken) return;
    const timer = window.setInterval(() => {
      void getOrderDownloads(outcome.order.publicId, accessToken).then((result) => {
        if (result.kind === "paid") setDownloads(result.downloads);
        else if (result.kind === "waiting" && terminalStatuses.has(result.status)) {
          clearOrderAccess(key); resetAttempt();
          setOutcome({ kind: "declined", order: outcome.order });
          setMessage("O pagamento não foi aprovado. Você pode tentar uma nova compra ou usar Pix.");
        }
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [outcome, accessToken, downloads, key, resetAttempt]);

  if (!cardAvailable && !restoring) return null;
  if (downloads) return <ProductDownloads productName={productName} productSlug={key} downloads={downloads} />;
  if (restoring) return <p className="mt-4 rounded-2xl border border-teal-200 p-4 text-sm text-teal-900" role="status">
    Acompanhando o pagamento com cartão. Se a confirmação demorar, fale com o suporte antes de iniciar outra compra.
  </p>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    const cleanCpf = digits(cpf), cleanPhone = digits(phone), cleanNumber = digits(number);
    if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || cleanCpf.length !== 11 || !/^\d{10,11}$/.test(cleanPhone)
      || cleanNumber.length < 13 || cleanNumber.length > 19 || !/^\d{2}$/.test(month)
      || Number(month) < 1 || Number(month) > 12 || !/^\d{4}$/.test(year)
      || Number(year) < new Date().getFullYear() || !/^\d{3,4}$/.test(cvv)) {
      setMessage("Confira os dados pessoais e do cartão."); return;
    }
    if (!token) { setMessage("Aguarde a verificação de segurança."); return; }
    setBusy(true);
    const paymentToken = await tokenizeCard({ number: cleanNumber, cvv, month, year,
      holder: name.trim(), cpf: cleanCpf });
    // Nenhum dado de face do cartão persiste ou é enviado ao servidor da loja.
    setNumber(""); setCvv("");
    if (!paymentToken) {
      setBusy(false); setMessage("Não foi possível validar o cartão. Confira os dados e tente novamente."); return;
    }
    const attempt = ensureAttempt({ name, email, productSlugs: slugs.split("|") });
    const response = await createCardOrder({ checkoutRequestId: attempt.checkoutRequestId,
      checkoutAccessToken: attempt.checkoutAccessToken, name: name.trim(), email: email.trim(),
      slugs: slugs.split("|"), turnstile: token, cpf: cleanCpf,
      phone: cleanPhone, paymentToken });
    setToken(null); turnstile.current?.reset(); setBusy(false); setOutcome(response);
    if (response.kind === "error") {
      setMessage(response.code === "manual_reconciliation_required"
        ? "A situação desta cobrança precisa ser verificada antes de tentar novamente. Fale com o suporte."
        : "Não foi possível processar o cartão agora. Verifique os dados e tente novamente.");
      return;
    }
    setAccessToken(attempt.checkoutAccessToken);
    if (response.kind === "declined") {
      setMessage("Cartão recusado. Você pode tentar uma nova compra com outro cartão ou usar Pix.");
    } else {
      saveOrderAccess(key, { publicId: response.order.publicId, checkoutAccessToken: attempt.checkoutAccessToken });
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-teal-200 bg-white p-4 text-left" aria-label="Pagamento com cartão de crédito">
      <Button type="button" variant="outline" full onClick={() => setOpen((current) => !current)}>
        {open ? "Fechar pagamento com cartão" : "Pagar com cartão de crédito"}
      </Button>
      {open && (
        outcome && outcome.kind !== "error" && outcome.kind !== "declined" ? (
          <p className="mt-4 text-sm text-teal-900" role="status">
            {outcome.kind === "processed" ? "Pagamento aprovado. Preparando seus arquivos..." : "Pagamento em análise. Acompanhe nesta página."}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3" autoComplete="on">
            {outcome?.kind === "declined" && (
              <Button type="button" variant="outline" onClick={() => { resetAttempt(); setOutcome(null); setMessage(""); }}>
                Iniciar nova tentativa
              </Button>
            )}
            <Input aria-label="Nome completo do titular" placeholder="Nome completo do titular" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            <Input aria-label="E-mail" placeholder="E-mail para receber o material" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
            <div className="grid grid-cols-2 gap-3">
              <Input aria-label="CPF" placeholder="CPF" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} maxLength={14} required />
              <Input aria-label="Telefone com DDD" placeholder="Telefone com DDD" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={16} required />
            </div>
            <Input aria-label="Número do cartão" placeholder="Número do cartão" inputMode="numeric" autoComplete="cc-number" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={23} required />
            <div className="grid grid-cols-3 gap-3">
              <Input aria-label="Mês de validade" placeholder="MM" inputMode="numeric" autoComplete="cc-exp-month" value={month} onChange={(e) => setMonth(digits(e.target.value).slice(0, 2))} required />
              <Input aria-label="Ano de validade" placeholder="AAAA" inputMode="numeric" autoComplete="cc-exp-year" value={year} onChange={(e) => setYear(digits(e.target.value).slice(0, 4))} required />
              <Input aria-label="Código de segurança" placeholder="CVV" inputMode="numeric" autoComplete="cc-csc" value={cvv} onChange={(e) => setCvv(digits(e.target.value).slice(0, 4))} required />
            </div>
            {import.meta.env.VITE_TURNSTILE_SITE_KEY && <TurnstileWidget ref={turnstile}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} action="create_product_order"
              onToken={handleTurnstileToken} onExpire={handleTurnstileExpire} onError={handleTurnstileError} />}
            {message && <p role="alert" className="text-sm text-rose-700">{message}</p>}
            <Button type="submit" disabled={busy || !token}>{busy ? "Processando..." : "Confirmar pagamento no crédito"}</Button>
            <p className="text-xs text-slate-500">Pagamento em 1 parcela. Dados do cartão são tokenizados pela Efí.</p>
          </form>
        )
      )}
    </section>
  );
}
