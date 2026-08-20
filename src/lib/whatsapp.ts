/**
 * Montagem de links de WhatsApp.
 *
 * A única função deste arquivo com uso real é buildPixSupportWhatsAppUrl —
 * usada pelo link de suporte do checkout do Guia de Evolução de Enfermagem
 * (GuiaEvolucaoEnfermagemPage.tsx) quando o pagamento Pix exige contato
 * manual.
 */
import { brand, contact } from "@/config/site";
import { appendCampaignParams } from "./utmTracking";

/* ═══════════════════ Suporte — checkout Pix transparente ═════════════════
 *
 * Usado só quando o checkout Pix devolve um estado que exige contato
 * manual (reconciliação, conflito etc.) — nunca inclui o código de erro
 * bruto do servidor, IDs internos ou o checkout_access_token; só o
 * public_id do pedido (já exibido ao cliente na tela, não sensível), que
 * ajuda o atendimento a localizar a compra.
 * ══════════════════════════════════════════════════════════════════════ */

export interface PixSupportContext {
  /**
   * Descreve o que foi comprado, ex.: "o Guia de Evolução de Enfermagem".
   * O único chamador em produção (GuiaEvolucaoEnfermagemPage.tsx) sempre
   * informa este campo — o texto padrão abaixo é usado só se um chamador
   * futuro omitir o contexto.
   */
  purchaseLabel?: string;
}

export function buildPixSupportWhatsAppUrl(orderPublicId: string | null, context?: PixSupportContext): string {
  const number = contact.whatsappNumber.replace(/\D/g, "");
  const openingLine = context?.purchaseLabel
    ? `Olá! Estou com um problema para confirmar o pagamento de ${context.purchaseLabel}.`
    : `Olá! Estou com um problema para confirmar um pagamento no site da ${brand.name}.`;
  const lines = [openingLine];
  if (orderPublicId) {
    lines.push(`Código do pedido: ${orderPublicId}`);
  }
  const text = encodeURIComponent(lines.join("\n"));
  return appendCampaignParams(`https://wa.me/${number}?text=${text}`);
}
