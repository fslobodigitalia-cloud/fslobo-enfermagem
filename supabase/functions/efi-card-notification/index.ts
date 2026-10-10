import { createClient } from "npm:@supabase/supabase-js@2.112.0";
import { authorize, configured, getCharge, getNotification, asRecord } from "../_shared/efi-card.ts";

const URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  if (!configured() || !URL || !SERVICE_KEY) return new Response(null, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return new Response(null, { status: 413 });
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return new Response(null, { status: 415 });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    const notification = new URLSearchParams(raw).get("notification");
    if (!notification || !/^[a-zA-Z0-9_-]{8,256}$/.test(notification)) return new Response(null, { status: 400 });
    // O POST não é autenticado: somente dados obtidos da API Efí autorizada
    // podem confirmar o pagamento; nenhum status do corpo é confiável.
    const access = await authorize();
    if (!access) return new Response(null, { status: 503 });
    const events = await getNotification(access, notification);
    if (!events) return new Response(null, { status: 503 });
    const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const chargeIds = new Set<number>();
    for (const event of events) {
      const entry = asRecord(event);
      const identifiers = asRecord(entry?.identifiers);
      if ((entry?.type === "charge" || entry?.type === "carnet_charge")
        && Number.isSafeInteger(identifiers?.charge_id) && (identifiers!.charge_id as number) > 0) {
        chargeIds.add(identifiers!.charge_id as number);
      }
    }
    for (const chargeId of chargeIds) {
      const charge = await getCharge(access, chargeId);
      if (!charge || !charge.customId.startsWith("fs-")) continue;
      const publicId = charge.customId.slice(3);
      if (!UUID.test(publicId)) continue;
      const { error } = await db.rpc("link_efi_card_charge", {
        p_public_id: publicId, p_charge_id: charge.chargeId,
        p_amount_cents: charge.amountCents, p_provider_status: charge.status,
      });
      if (error) return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 200 });
  } catch {
    // Erro temporário: Efí pode reenviar a notificação.
    return new Response(null, { status: 503 });
  }
});
