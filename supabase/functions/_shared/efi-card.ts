/** API Cobranças Efí. As credenciais deste módulo nunca chegam ao navegador. */
export const cardEnvironment = Deno.env.get("EFI_CARD_ENVIRONMENT");
export const cardBaseUrl = cardEnvironment === "production"
  ? "https://cobrancas.api.efipay.com.br"
  : "https://cobrancas-h.api.efipay.com.br";
const clientId = Deno.env.get("EFI_CARD_CLIENT_ID");
const clientSecret = Deno.env.get("EFI_CARD_CLIENT_SECRET");
const TIMEOUT_MS = 10000;

export function configured(): boolean {
  return (cardEnvironment === "production" || cardEnvironment === "homologation")
    && !!clientId && !!clientSecret;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${cardBaseUrl}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function body(response: Response): Promise<Record<string, unknown> | null> {
  try { return asRecord(await response.json()); } catch { return null; }
}

export async function authorize(): Promise<string | null> {
  if (!configured()) return null;
  const response = await request("/v1/authorize", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const data = await body(response);
  return response.ok && typeof data?.access_token === "string" ? data.access_token : null;
}

export interface VerifiedCardCharge {
  chargeId: number;
  customId: string;
  amountCents: number;
  status: string;
}

function parseCharge(raw: unknown): VerifiedCardCharge | null {
  const charge = asRecord(raw);
  const payment = asRecord(charge?.payment);
  if (!charge || !Number.isSafeInteger(charge.charge_id) || (charge.charge_id as number) <= 0
    || typeof charge.custom_id !== "string" || !Number.isSafeInteger(charge.total)
    || (charge.total as number) <= 0 ||
    (payment?.method !== "credit_card" && payment?.payment_method !== "credit_card")
    || typeof charge.status !== "string") return null;
  return { chargeId: charge.charge_id as number, customId: charge.custom_id,
    amountCents: charge.total as number, status: charge.status };
}

export async function getCharge(token: string, chargeId: number): Promise<VerifiedCardCharge | null> {
  const response = await request(`/v1/charge/${chargeId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await body(response);
  return response.ok ? parseCharge(data?.data) : null;
}

export async function createCharge(token: string, order: {
  publicId: string; amountCents: number; itemNames: string[];
  customerName: string; customerEmail: string; cpf: string; phone: string;
  paymentToken: string; notificationUrl: string;
}): Promise<number | null> {
  // Preço e itens são os valores da RPC, nunca do corpo enviado pelo cliente.
  // Um item agregado mantém o total exatamente igual ao pedido, mesmo com bumps.
  const response = await request("/v1/charge/one-step", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      items: [{ name: order.itemNames.join(" + ").slice(0, 255), value: order.amountCents, amount: 1 }],
      metadata: { custom_id: `fs-${order.publicId}`, notification_url: order.notificationUrl },
      payment: { credit_card: { customer: {
        name: order.customerName, cpf: order.cpf, email: order.customerEmail, phone_number: order.phone,
      }, installments: 1, payment_token: order.paymentToken } },
    }),
  });
  const data = await body(response);
  const charge = asRecord(data?.data);
  // HTTP 200 também representa cartão recusado; sempre consultar GET antes de confirmar.
  return response.ok && charge && Number.isSafeInteger(charge.charge_id)
    && (charge.charge_id as number) > 0 ? charge.charge_id as number : null;
}

export async function getNotification(token: string, notification: string): Promise<unknown[] | null> {
  const response = await request(`/v1/notification/${encodeURIComponent(notification)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const result = await body(response);
  return response.ok && Array.isArray(result?.data) ? result.data : null;
}
