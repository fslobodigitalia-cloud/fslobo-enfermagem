/* ════════════════════════════════════════════════════════════════════════════
 *  FSLOBO ENFERMAGEM — CONFIGURAÇÃO CENTRAL
 *
 *  Este arquivo é deliberadamente enxuto: mantém só o que ainda é consumido
 *  de verdade por código em produção — src/lib/whatsapp.ts (usado pelo link
 *  de suporte do checkout do Guia de Evolução de Enfermagem, em
 *  GuiaEvolucaoEnfermagemPage.tsx) e src/config/legal.ts/LegalLayout
 *  (política comercial e navegação entre páginas legais).
 *
 *  O grosso do conteúdo comercial do Guia (preço, bumps, copy da página)
 *  vive em src/config/digitalProducts.ts e src/config/guiaQuiz.ts — não
 *  aqui. Os dados reais do fornecedor (razão social, CNPJ, endereço,
 *  e-mail e WhatsApp usados nas páginas legais) vivem em
 *  src/config/legal.ts, não neste arquivo.
 *
 *  ⚠️ contact.whatsappNumber abaixo é um número herdado, preservado sem
 *  alteração até nova instrução (nenhuma mudança de dado de
 *  contato/checkout foi autorizada) — ele é diferente do WhatsApp oficial
 *  da FSLobo Enfermagem já cadastrado em LEGAL_WHATSAPP_NUMBER
 *  (src/config/legal.ts). Confirmar com o responsável qual número deve
 *  realmente receber as mensagens de suporte ao pagamento antes de
 *  publicar.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Valor sentinela usado nos campos que ainda precisam ser preenchidos. */
export const PLACEHOLDER_PREFIX = "[";

export const isPlaceholder = (value: string): boolean =>
  value.trim().startsWith(PLACEHOLDER_PREFIX);

/* ─────────────────────────── Identidade da marca ────────────────────────── */

export const brand = {
  name: "FSLobo Enfermagem",
  description:
    "Materiais digitais educacionais para profissionais e estudantes de enfermagem.",
} as const;

/* ─────────────────────────────── Contato ───────────────────────────────── */

export const contact = {
  whatsappNumber: "5521979199008",

  siteUrl: "https://www.fsloboenfermagem.com.br",

  /** ⚠️ PREENCHER — e-mail de contato exibido fora das páginas legais. */
  email: "[EMAIL]",
} as const;

/* ───────────────────────── Condições comerciais ─────────────────────────── */

export const commercial = {
  paymentMethod: "Pix",
  currency: "BRL",
  currencySymbol: "R$",
} as const;

/* ─────────────────────────────── Links legais ──────────────────────────── */

export const legalLinks = [
  { label: "Política de privacidade", href: "/privacidade" },
  { label: "Termos de uso", href: "/termos" },
  { label: "Política de entrega", href: "/entrega" },
  { label: "Política de reembolso", href: "/reembolso" },
] as const;

/* ─────────────────────── Verificação em desenvolvimento ────────────────── */

export const pendingConfigFields = (): string[] => {
  const pending: string[] = [];
  if (isPlaceholder(contact.email)) pending.push("contact.email");
  return pending;
};
