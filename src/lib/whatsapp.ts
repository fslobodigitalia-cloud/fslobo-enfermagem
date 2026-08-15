/**
 * Montagem do link de WhatsApp.
 *
 * A mensagem contém apenas dados operacionais confirmados pelo visitante no
 * modal de qualificação. A pergunta da consulta NUNCA é coletada no site nem
 * enviada nesta mensagem.
 */
import {
  brand,
  contact,
  getFormatLabel,
  getThemeLabel,
  isPlaceholder,
  type FormatId,
  type QuickProduct,
  type ReadingPackage,
  type ThemeId,
} from "@/config/site";
import { appendCampaignParams } from "./utmTracking";

export interface WhatsAppLeadData {
  firstName: string;
  pkg: ReadingPackage;
  theme: ThemeId | null;
  format: FormatId | null;
}

export function buildWhatsAppMessage({ firstName, pkg, theme, format }: WhatsAppLeadData): string {
  const nome = firstName.trim() || "Não informado";

  return [
    `Olá! Vim pelo site da ${brand.name} e gostaria de iniciar uma leitura.`,
    "",
    `Meu nome: ${nome}`,
    `Pacote escolhido: ${pkg.name}`,
    `Quantidade de perguntas: ${pkg.questions}`,
    `Tema principal: ${getThemeLabel(theme)}`,
    `Formato de preferência: ${getFormatLabel(format)}`,
    `Valor informado: ${pkg.priceLabel}`,
    "",
    "Estou ciente do valor e do prazo e gostaria de confirmar a disponibilidade e a forma de pagamento.",
  ].join("\n");
}

export function buildWhatsAppUrl(data: WhatsAppLeadData): string {
  const number = contact.whatsappNumber.replace(/\D/g, "");
  const text = encodeURIComponent(buildWhatsAppMessage(data));
  const base = `https://wa.me/${number}?text=${text}`;

  // Os parâmetros de campanha seguem no link de saída; a mensagem em si
  // permanece exatamente com o conteúdo acordado com o cliente.
  return appendCampaignParams(base);
}

/** Indica se o número ainda é o placeholder de configuração. */
export const isWhatsAppConfigured = (): boolean => !isPlaceholder(contact.whatsappNumber);

export function openWhatsApp(data: WhatsAppLeadData): void {
  if (!isWhatsAppConfigured()) {
    console.warn(
      "[whatsapp] Número não configurado. Preencha contact.whatsappNumber em src/config/site.ts.",
    );
  }
  window.open(buildWhatsAppUrl(data), "_blank", "noopener,noreferrer");
}

/* ═══════════════════════════ Funil do tema ══════════════════════════════
 *
 * Diferente de `buildWhatsAppMessage` acima, esta mensagem inclui as
 * perguntas reais que o cliente escreveu — por pedido explícito do
 * responsável pela marca, para que o atendimento no WhatsApp já chegue
 * com tudo preenchido. Mantida separada da função anterior para não
 * alterar o comportamento de nenhum outro fluxo do site.
 * ══════════════════════════════════════════════════════════════════════ */

export interface FunnelWhatsAppData {
  firstName: string;
  pkg: ReadingPackage;
  theme: ThemeId | null;
  format: FormatId | null;
  /** Texto bruto digitado pelo cliente, uma pergunta por linha. */
  questionsText: string;
}

/** Numera as perguntas digitadas, removendo linhas vazias e numeração duplicada. */
function formatQuestions(raw: string): string {
  const lines = raw
    .split("\n")
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);

  if (lines.length === 0) return "Não informadas";
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

export function buildFunnelWhatsAppMessage({
  firstName,
  pkg,
  theme,
  format,
  questionsText,
}: FunnelWhatsAppData): string {
  const nome = firstName.trim() || "Não informado";

  return [
    `Olá! Vim pelo site da ${brand.name} e já preparei tudo para a minha leitura ✨🔮`,
    "",
    `*Nome:* ${nome}`,
    `*Tema:* ${getThemeLabel(theme)} 💜`,
    `*Pacote:* ${pkg.name} (${pkg.questions} perguntas) — ${pkg.priceLabel}`,
    `*Formato preferido:* ${getFormatLabel(format)}`,
    "",
    "*Minhas perguntas:* 📝",
    formatQuestions(questionsText),
    "",
    "Estou ciente do valor e do prazo e gostaria de confirmar a disponibilidade e o pagamento 🙏",
  ].join("\n");
}

export function buildFunnelWhatsAppUrl(data: FunnelWhatsAppData): string {
  const number = contact.whatsappNumber.replace(/\D/g, "");
  const text = encodeURIComponent(buildFunnelWhatsAppMessage(data));
  return appendCampaignParams(`https://wa.me/${number}?text=${text}`);
}

export function openFunnelWhatsApp(data: FunnelWhatsAppData): void {
  window.open(buildFunnelWhatsAppUrl(data), "_blank", "noopener,noreferrer");
}

/* ═════════════════════ Experiências rápidas ══════════════════════════════
 *
 * Produtos de preço único, sem tema nem escolha de pacote. O campo de
 * contexto é opcional e, quando vazio, simplesmente não aparece na mensagem.
 * ══════════════════════════════════════════════════════════════════════ */

export interface QuickProductWhatsAppData {
  firstName: string;
  product: QuickProduct;
  /** Texto livre e opcional — só é incluído se o cliente escrever algo. */
  context: string;
}

export function buildQuickProductWhatsAppMessage({
  firstName,
  product,
  context,
}: QuickProductWhatsAppData): string {
  const nome = firstName.trim() || "Não informado";
  const trimmedContext = context.trim();

  const lines = [
    `Olá! Vim pelo site da ${brand.name} e já preparei tudo para a minha leitura ✨🔮`,
    "",
    `*Nome:* ${nome}`,
    `*Experiência escolhida:* ${product.name} — ${product.priceLabel}`,
  ];

  if (trimmedContext) {
    lines.push("", "*O que gostaria de observar:* 📝", trimmedContext);
  }

  lines.push(
    "",
    "Estou ciente do valor e do prazo e gostaria de confirmar a disponibilidade e o pagamento 🙏",
  );

  return lines.join("\n");
}

export function buildQuickProductWhatsAppUrl(data: QuickProductWhatsAppData): string {
  const number = contact.whatsappNumber.replace(/\D/g, "");
  const text = encodeURIComponent(buildQuickProductWhatsAppMessage(data));
  return appendCampaignParams(`https://wa.me/${number}?text=${text}`);
}

export function openQuickProductWhatsApp(data: QuickProductWhatsAppData): void {
  window.open(buildQuickProductWhatsAppUrl(data), "_blank", "noopener,noreferrer");
}

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
   * Se omitido, mantém o texto padrão do checkout de tarô (leitura + nome
   * da marca) — nenhuma chamada existente precisa mudar.
   */
  purchaseLabel?: string;
}

export function buildPixSupportWhatsAppUrl(orderPublicId: string | null, context?: PixSupportContext): string {
  const number = contact.whatsappNumber.replace(/\D/g, "");
  const openingLine = context?.purchaseLabel
    ? `Olá! Estou com um problema para confirmar o pagamento de ${context.purchaseLabel}.`
    : `Olá! Estou com um problema para confirmar o pagamento de uma leitura no site da ${brand.name}.`;
  const lines = [openingLine];
  if (orderPublicId) {
    lines.push(`Código do pedido: ${orderPublicId}`);
  }
  const text = encodeURIComponent(lines.join("\n"));
  return appendCampaignParams(`https://wa.me/${number}?text=${text}`);
}
