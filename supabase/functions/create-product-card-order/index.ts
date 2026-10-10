import { createClient } from "npm:@supabase/supabase-js@2.112.0";
import { authorize, cardEnvironment, configured, createCharge, getCharge, asRecord } from "../_shared/efi-card.ts";

const URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
const PREVIEW_ORIGIN = Deno.env.get("EFI_CARD_PREVIEW_ORIGIN");
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY");
const TURNSTILE_HOST = Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME");
const TURNSTILE_ACTION = Deno.env.get("TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER");
const RATE_SECRET = Deno.env.get("RATE_LIMIT_HASH_SECRET");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && (origin === ORIGIN || origin === PREVIEW_ORIGIN);
}

function cors(origin: string | null): Headers {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
  if (isAllowedOrigin(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
function result(status: number, data: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(data), { status, headers: cors(origin) });
}
function fail(status: number, code: string, origin: string | null): Response {
  return result(status, { ok: false, error: { code } }, origin);
}

interface Input {
  checkoutRequestId: string; checkoutAccessToken: string; customerName: string;
  customerEmail: string; slugs: string[]; turnstile: string;
  cpf: string; phone: string; paymentToken: string;
}
function parse(value: unknown): Input | null {
  const r = asRecord(value);
  const expected = ["checkout_request_id", "checkout_access_token", "customer_name", "customer_email",
    "product_slugs", "turnstile_token", "cpf", "phone_number", "payment_token"];
  if (!r || Object.keys(r).length !== expected.length || !expected.every((key) => key in r)) return null;
  if (typeof r.checkout_request_id !== "string" || !UUID.test(r.checkout_request_id)
    || typeof r.checkout_access_token !== "string" || !/^[a-f0-9]{64}$/.test(r.checkout_access_token)
    || typeof r.customer_name !== "string" || r.customer_name.trim().length < 2 || r.customer_name.length > 120
    || typeof r.customer_email !== "string" || r.customer_email.length > 254 || !EMAIL.test(r.customer_email.trim())
    || !Array.isArray(r.product_slugs) || r.product_slugs.length < 1 || r.product_slugs.length > 16
    || !r.product_slugs.every((s: unknown) => typeof s === "string" && /^[a-z0-9-]{1,80}$/.test(s))
    || typeof r.turnstile_token !== "string" || !r.turnstile_token || r.turnstile_token.length > 2048
    || typeof r.cpf !== "string" || !/^\d{11}$/.test(r.cpf)
    || typeof r.phone_number !== "string" || !/^\d{10,11}$/.test(r.phone_number)
    || typeof r.payment_token !== "string" || !/^[a-zA-Z0-9_-]{20,256}$/.test(r.payment_token)) return null;
  const cpf = r.cpf as string;
  if (/^(\d)\1{10}$/.test(cpf)) return null;
  for (const length of [9, 10]) {
    const sum = Array.from(cpf.slice(0, length)).reduce((acc, digit, index) => acc + Number(digit) * (length + 1 - index), 0);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(cpf[length])) return null;
  }
  return { checkoutRequestId: r.checkout_request_id, checkoutAccessToken: r.checkout_access_token,
    customerName: r.customer_name.trim(), customerEmail: r.customer_email.trim(),
    slugs: r.product_slugs as string[], turnstile: r.turnstile_token,
    cpf, phone: r.phone_number, paymentToken: r.payment_token };
}

async function hmac(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(RATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET!, response: token }), signal: controller.signal,
    });
    const body = asRecord(await response.json());
    return response.ok && body?.success === true && body?.hostname === TURNSTILE_HOST && body?.action === TURNSTILE_ACTION;
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) return fail(403, "origin_not_allowed", origin);
    const headers = cors(origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type");
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") return fail(405, "method_not_allowed", origin);
  if (!isAllowedOrigin(origin)) return fail(403, "origin_not_allowed", origin);
  if (!URL || !SERVICE_KEY || !ORIGIN || !TURNSTILE_SECRET || !TURNSTILE_HOST || !TURNSTILE_ACTION
    || !RATE_SECRET || RATE_SECRET.length < 32 || !configured()) return fail(500, "server_misconfigured", origin);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return fail(415, "unsupported_media_type", origin);
  if (Number(req.headers.get("content-length") ?? 0) > 32768) return fail(413, "payload_too_large", origin);
  let input: Input | null;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 32768) return fail(413, "payload_too_large", origin);
    input = parse(JSON.parse(raw));
  } catch { return fail(400, "invalid_request", origin); }
  if (!input) return fail(400, "invalid_request", origin);
  try {
    if (!await verifyTurnstile(input.turnstile)) return fail(403, "human_verification_failed", origin);
  } catch { return fail(503, "human_verification_temporarily_unavailable", origin); }

  const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = input.customerEmail.toLowerCase();
  const forwarded = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded && (/^(\d{1,3}\.){3}\d{1,3}$/.test(forwarded) || /^[0-9a-fA-F:]+$/.test(forwarded)) ? forwarded : null;
  const { data: rate, error: rateError } = await db.rpc("record_checkout_attempt", {
    p_ip_hash: ip ? await hmac(`ip:${ip}`) : null,
    p_email_hash: await hmac(`email:${email}`),
    p_request_hash: await hmac(`request:${input.checkoutRequestId}:email:${email}:environment:efi-card:${cardEnvironment}`),
  });
  if (rateError || !Array.isArray(rate) || rate.length !== 1) return fail(500, "database_error", origin);
  if (rate[0].allowed !== true) return fail(429, "rate_limit_exceeded", origin);

  const { data: rows, error } = await db.rpc("create_or_get_product_order_with_items_efi", {
    p_checkout_request_id: input.checkoutRequestId, p_checkout_access_token: input.checkoutAccessToken,
    p_product_slugs: input.slugs, p_customer_name: input.customerName, p_customer_email: input.customerEmail,
    p_terms_version: "2026-08-01", p_privacy_version: "2026-08-01",
    p_efi_environment: cardEnvironment,
  });
  if (error) return fail(error.message?.includes("já foi usado") ? 409 : 422,
    error.message?.includes("já foi usado") ? "checkout_conflict" : "invalid_request", origin);
  const order = Array.isArray(rows) && rows.length === 1 ? asRecord(rows[0]) : null;
  if (!order || typeof order.order_id !== "string" || !UUID.test(order.order_id)
    || typeof order.public_id !== "string" || !UUID.test(order.public_id)
    || !Number.isSafeInteger(order.amount_cents) || (order.amount_cents as number) <= 0
    || order.currency !== "BRL" || order.efi_environment !== cardEnvironment
    || order.efi_txid !== null || !Array.isArray(order.item_names) || !Array.isArray(order.item_slugs)
    || order.item_names.length === 0 || order.item_names.length !== order.item_slugs.length) {
    return fail(409, "checkout_conflict", origin);
  }
  const summary = { public_id: order.public_id, amount_cents: order.amount_cents, currency: "BRL",
    items: order.item_slugs.map((slug: string, index: number) => ({ slug, name: order.item_names[index] })) };

  let access: string | null;
  try { access = await authorize(); } catch { access = null; }
  if (!access) return fail(503, "payment_provider_temporarily_unavailable", origin);

  // A reivindicação é atômica. Nunca reenviar POST de criação num retry ou após timeout.
  const { data: claims, error: claimError } = await db.rpc("claim_efi_card_checkout", { p_order_id: order.order_id });
  if (claimError || !Array.isArray(claims) || claims.length !== 1) return fail(409, "checkout_conflict", origin);
  const claim = asRecord(claims[0]);
  if (!claim || claim.public_id !== order.public_id || claim.amount_cents !== order.amount_cents) return fail(500, "database_error", origin);

  try {
    if (claim.should_create !== true) {
      if (!Number.isSafeInteger(claim.charge_id) || (claim.charge_id as number) <= 0)
        return fail(409, "manual_reconciliation_required", origin);
      const existing = await getCharge(access, claim.charge_id as number);
      if (!existing || existing.customId !== `fs-${order.public_id}` || existing.amountCents !== order.amount_cents)
        return fail(409, "manual_reconciliation_required", origin);
      const { data: reconciled, error: reconcileError } = await db.rpc("link_efi_card_charge", {
        p_public_id: order.public_id, p_charge_id: existing.chargeId,
        p_amount_cents: existing.amountCents, p_provider_status: existing.status,
      });
      if (reconcileError || !Array.isArray(reconciled) || reconciled.length !== 1)
        return fail(409, "manual_reconciliation_required", origin);
      return result(200, { ok: true, order: summary, payment: {
        status: reconciled[0].order_status === "paid" ? "processed" : existing.status === "unpaid" ? "declined" : "processing",
      } }, origin);
    }
    const id = await createCharge(access, { publicId: order.public_id as string, amountCents: order.amount_cents as number,
      itemNames: order.item_names as string[], customerName: input.customerName, customerEmail: email,
      cpf: input.cpf, phone: input.phone, paymentToken: input.paymentToken,
      notificationUrl: `${URL}/functions/v1/efi-card-notification` });
    if (!id) return fail(409, "manual_reconciliation_required", origin);
    const charge = await getCharge(access, id);
    if (!charge || charge.customId !== `fs-${order.public_id}` || charge.amountCents !== order.amount_cents)
      return fail(409, "manual_reconciliation_required", origin);
    const { data: linked, error: linkError } = await db.rpc("link_efi_card_charge", {
      p_public_id: order.public_id, p_charge_id: charge.chargeId,
      p_amount_cents: charge.amountCents, p_provider_status: charge.status,
    });
    if (linkError || !Array.isArray(linked) || linked.length !== 1)
      return fail(409, "manual_reconciliation_required", origin);
    return result(200, { ok: true, order: summary, payment: {
      status: linked[0].order_status === "paid" ? "processed" : charge.status === "unpaid" ? "declined" : "processing",
    } }, origin);
  } catch {
    // A chamada pode ter chegado à Efí; uma segunda cobrança é proibida.
    return fail(409, "manual_reconciliation_required", origin);
  }
});
