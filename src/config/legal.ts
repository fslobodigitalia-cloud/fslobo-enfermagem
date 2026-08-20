/**
 * Conteúdo das páginas legais — Guia de Evolução de Enfermagem
 * (FSLobo Enfermagem).
 *
 * Identidade do fornecedor (LEGAL_BUSINESS_NAME, LEGAL_CNPJ, LEGAL_ADDRESS,
 * LEGAL_EMAIL, LEGAL_WHATSAPP*, LEGAL_SITE_URL) são dados reais, fornecidos
 * diretamente para esta etapa — não são mais placeholders. Deliberadamente
 * NÃO inclui data de abertura do CNPJ nem porte (MEI) — não fazem parte da
 * apresentação pública básica do fornecedor.
 *
 * Este arquivo usa LEGAL_BRAND_NAME e as constantes LEGAL_* acima em vez de
 * `brand`/`contact` de src/config/site.ts — aquele arquivo mantém só o
 * essencial para src/lib/whatsapp.ts (ver comentário lá). Da mesma forma,
 * este arquivo não usa `commercial.deliveryTime` — não existe prazo de
 * entrega estimado aqui: a entrega digital do Guia é imediata após a
 * confirmação do pagamento.
 */
import { commercial } from "./site";

export interface LegalBlock {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  blocks: LegalBlock[];
}

/* ─────────────────────── Identidade do fornecedor ─────────────────────── */

/** Marca comercial usada nas páginas legais. */
export const LEGAL_BRAND_NAME = "FSlobo Enfermagem";

/** Razão social. */
export const LEGAL_BUSINESS_NAME = "62.450.972 Flavio Sobreira Lobo";

/** CNPJ, já formatado para exibição. */
export const LEGAL_CNPJ = "62.450.972/0001-35";

/** Endereço do fornecedor, separado em linhas para exibição organizada. */
export const LEGAL_ADDRESS = {
  street: "Estrada dos Expedicionários, 1217, Casa 2",
  neighborhoodCity: "Cabuís — Nilópolis/RJ",
  zip: "CEP 26540-027",
};

/** E-mail de contato — usado tanto em texto quanto em link mailto:. */
export const LEGAL_EMAIL = "fslobodigitalia@gmail.com";

/** Número do WhatsApp formatado para exibição. */
export const LEGAL_WHATSAPP_DISPLAY = "+55 21 97919-9008";

/** Mesmo número, só dígitos — para montar o link https://wa.me/. */
export const LEGAL_WHATSAPP_NUMBER = "5521979199008";

export const LEGAL_WHATSAPP_URL = `https://wa.me/${LEGAL_WHATSAPP_NUMBER}`;

/** Domínio oficial do site. */
export const LEGAL_SITE_URL = "https://www.fsloboenfermagem.com.br";

/** Mesma URL, sem o protocolo, só para exibição. */
export const LEGAL_SITE_URL_DISPLAY = LEGAL_SITE_URL.replace(/^https?:\/\//, "");

const UPDATED_AT = "15 de agosto de 2026";

const contactLine =
  "Para exercer seus direitos ou tirar dúvidas sobre esta política, utilize os canais de contato da seção \"Identificação e contato\" desta página.";

export const privacyPolicy: LegalDocument = {
  slug: "privacidade",
  title: "Política de privacidade",
  subtitle: `Como a ${LEGAL_BRAND_NAME} trata as informações de quem visita o site e compra o Guia de Evolução de Enfermagem.`,
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Quem é o responsável pelos dados",
      paragraphs: [
        `O tratamento de dados descrito nesta política é realizado por ${LEGAL_BUSINESS_NAME} (CNPJ ${LEGAL_CNPJ}), sob a marca comercial ${LEGAL_BRAND_NAME}.`,
        "Esta política segue a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).",
      ],
    },
    {
      heading: "2. Quais dados coletamos",
      paragraphs: ["Coletamos apenas o necessário para processar sua compra:"],
      list: [
        "Dados informados no checkout: nome e e-mail, usados para criar e confirmar seu pedido.",
        "Dados técnicos do pedido: identificadores do pedido e do checkout (como o código de acesso gerado ao iniciar a compra), necessários para localizar seu pedido e liberar os materiais depois do pagamento.",
        "Dados técnicos e de campanha: parâmetros de origem (utm_source, utm_medium, utm_campaign, utm_content, utm_term e fbclid), guardados no seu navegador durante a visita.",
      ],
    },
    {
      heading: "3. O que pedimos — e o que não pedimos — no site",
      paragraphs: [
        "Para processar sua compra, o site pede apenas nome e e-mail, no formulário de checkout.",
        "O teste rápido de conhecimento (quiz) exibido na página não é enviado para nós: as respostas e a pontuação ficam somente no seu navegador e servem apenas para montar o resultado exibido na tela.",
        "O site não pede, em nenhuma etapa: documentos, dados de saúde, informações sobre pacientes de terceiros ou qualquer outro dado pessoal sensível.",
      ],
    },
    {
      heading: "4. Para que usamos os dados",
      list: [
        "Processar seu pedido e o pagamento via Pix.",
        "Confirmar o pagamento e liberar o acesso aos materiais digitais comprados.",
        "Prevenir fraude e uso automatizado indevido durante o checkout.",
        "Compreender o desempenho das campanhas de divulgação, de forma agregada.",
        "Cumprir obrigações legais aplicáveis.",
      ],
    },
    {
      heading: "5. Medição (Meta Pixel)",
      paragraphs: [
        "Usamos o Meta Pixel para entender o desempenho das campanhas de divulgação deste site. Ele é carregado automaticamente ao acessar esta página.",
        "Quando ativo, enviamos ao provedor de anúncios apenas informações comerciais agregadas relacionadas à intenção de compra e ao pedido: valor e moeda.",
        "Nunca enviamos ao provedor de anúncios: seu nome, seu e-mail, suas respostas do teste rápido de conhecimento ou qualquer outro dado pessoal.",
      ],
    },
    {
      heading: "6. Verificação de segurança (Cloudflare Turnstile)",
      paragraphs: [
        "Antes de confirmar seu pedido, usamos o Cloudflare Turnstile, um serviço de verificação que ajuda a confirmar que quem está comprando é uma pessoa real, reduzindo fraude e abuso automatizado no checkout. Essa verificação não é usada para nenhuma outra finalidade.",
      ],
    },
    {
      heading: "7. Pagamento (Mercado Pago)",
      paragraphs: [
        "O pagamento é processado pelo Mercado Pago, via Pix. Não temos acesso a dados bancários ou de conta — o Mercado Pago processa a transação de forma independente, segundo a própria política de privacidade dele.",
      ],
    },
    {
      heading: "8. Compartilhamento",
      paragraphs: [
        "Não vendemos dados pessoais. O compartilhamento ocorre apenas com provedores necessários à operação: o Mercado Pago (processamento do pagamento via Pix), o serviço de hospedagem e infraestrutura do site e, quando ativo, o provedor de medição de campanhas (Meta).",
      ],
    },
    {
      heading: "9. Retenção",
      paragraphs: [
        "Os dados do seu pedido são mantidos pelo tempo necessário para viabilizar a entrega dos materiais comprados e cumprir obrigações legais. Você pode solicitar a exclusão dos seus dados a qualquer momento, pelos canais de contato indicados nesta página.",
      ],
    },
    {
      heading: "10. Seus direitos",
      paragraphs: ["Você pode solicitar, a qualquer momento:"],
      list: [
        "Confirmação da existência de tratamento e acesso aos seus dados.",
        "Correção de dados incompletos ou desatualizados.",
        "Anonimização, bloqueio ou eliminação de dados desnecessários.",
        "Informação sobre com quem os dados foram compartilhados.",
      ],
    },
    {
      heading: "11. Segurança",
      paragraphs: [
        "Adotamos medidas razoáveis para proteger as informações tratadas. Nenhum sistema é totalmente livre de riscos, mas o acesso aos dados do pedido é restrito à operação oficial do site.",
      ],
    },
    {
      heading: "12. Contato",
      paragraphs: [contactLine],
    },
  ],
};

export const termsOfUse: LegalDocument = {
  slug: "termos",
  title: "Termos de uso",
  subtitle: `Condições para o uso do site e a compra do Guia de Evolução de Enfermagem pela ${LEGAL_BRAND_NAME}.`,
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Aceitação",
      paragraphs: [
        `Ao navegar neste site e comprar o Guia de Evolução de Enfermagem (ou os materiais complementares oferecidos), você concorda com estes termos. A comercialização é realizada por ${LEGAL_BUSINESS_NAME} (CNPJ ${LEGAL_CNPJ}), sob a marca ${LEGAL_BRAND_NAME}.`,
      ],
    },
    {
      heading: "2. Natureza do conteúdo",
      paragraphs: [
        "O Guia de Evolução de Enfermagem e os materiais complementares têm caráter educacional e de consulta rápida: reúnem modelos e roteiros de anotação e evolução de enfermagem para apoiar o dia a dia profissional e os estudos.",
        "O conteúdo não substitui protocolos institucionais, a legislação profissional vigente, o julgamento clínico do profissional responsável pelo cuidado nem qualquer orientação profissional específica. A responsabilidade pelo uso correto do material em cada situação real é sempre de quem o utiliza.",
      ],
    },
    {
      heading: "3. Idade mínima",
      paragraphs: ["A compra é destinada a maiores de 18 anos."],
    },
    {
      heading: "4. Como funciona a compra",
      list: [
        "Você escolhe o produto principal (Guia de Evolução de Enfermagem) e, se desejar, os materiais complementares oferecidos na mesma tela.",
        "Você informa nome e e-mail e confirma a verificação de segurança do checkout.",
        `O pagamento é feito por ${commercial.paymentMethod}, processado pelo Mercado Pago.`,
        "Após a confirmação do pagamento, o sistema libera automaticamente o acesso aos materiais comprados para download.",
      ],
    },
    {
      heading: "5. Entrega e acesso",
      paragraphs: [
        "O produto é inteiramente digital. Não há envio físico. Depois que o pagamento é confirmado, os links de download ficam disponíveis na própria página; eles podem expirar após um tempo e, se isso acontecer, basta recarregar a página para gerar novos links de acesso ao mesmo pedido.",
      ],
    },
    {
      heading: "6. Conduta",
      paragraphs: [
        "Reservamo-nos o direito de recusar ou encerrar o acesso em caso de uso indevido do material, tentativa de fraude no checkout ou violação destes termos.",
      ],
    },
    {
      heading: "7. Propriedade intelectual",
      paragraphs: [
        `Os textos, modelos, roteiros e materiais do Guia de Evolução de Enfermagem e dos produtos complementares pertencem à ${LEGAL_BRAND_NAME}. O material é de uso pessoal de quem compra — redistribuição, revenda ou compartilhamento não autorizado não são permitidos.`,
      ],
    },
    {
      heading: "8. Alterações",
      paragraphs: [
        "Estes termos podem ser atualizados. A versão vigente é sempre a publicada nesta página.",
      ],
    },
    {
      heading: "9. Contato",
      paragraphs: [contactLine],
    },
  ],
};

export const deliveryPolicy: LegalDocument = {
  slug: "entrega",
  title: "Política de entrega",
  subtitle: "Como e quando você recebe acesso aos materiais digitais comprados.",
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Formato de entrega",
      paragraphs: [
        "Todo o conteúdo é digital — arquivos em PDF, disponibilizados para download diretamente na página do produto. Não há envio físico nem produto impresso.",
      ],
    },
    {
      heading: "2. Quando o acesso é liberado",
      paragraphs: [
        `O acesso é liberado automaticamente assim que o pagamento por ${commercial.paymentMethod} é confirmado. Enquanto a confirmação está em andamento, a página mostra o status do pedido e verifica automaticamente se o pagamento já foi aprovado.`,
      ],
    },
    {
      heading: "3. Links de download",
      paragraphs: [
        "Os links de download têm validade limitada por motivos de segurança. Se um link expirar, basta recarregar a página do pedido para gerar novos links de acesso ao mesmo material — o pagamento não precisa ser refeito.",
      ],
    },
    {
      heading: "4. Não há envio físico",
      paragraphs: [
        "Não há produto físico, frete ou envio pelos Correios. Nenhum custo adicional de entrega é cobrado.",
      ],
    },
    {
      heading: "5. Problemas no recebimento",
      paragraphs: [
        "Se você concluiu o pagamento e não conseguiu acessar os materiais, entre em contato pelos canais indicados nesta página, informando o código do seu pedido (exibido na tela após a compra), para que possamos ajudar.",
      ],
    },
    {
      heading: "6. Contato",
      paragraphs: [contactLine],
    },
  ],
};

export const refundPolicy: LegalDocument = {
  slug: "reembolso",
  title: "Política de reembolso",
  subtitle: "Condições de cancelamento e devolução de valores.",
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Direito de arrependimento",
      paragraphs: [
        "O consumidor poderá solicitar o cancelamento da compra em até 7 (sete) dias corridos, nos termos do artigo 49 do Código de Defesa do Consumidor.",
      ],
    },
    {
      heading: "2. Como solicitar",
      paragraphs: [
        `A solicitação pode ser feita por e-mail (${LEGAL_EMAIL}) ou WhatsApp (${LEGAL_WHATSAPP_DISPLAY}), informando:`,
      ],
      list: ["Nome utilizado na compra", "E-mail utilizado na compra", "Código do pedido, quando disponível"],
    },
    {
      heading: "3. Processamento da devolução",
      paragraphs: [
        "Sendo o reembolso aplicável, a devolução será processada de acordo com o meio de pagamento e os procedimentos da transação.",
      ],
    },
    {
      heading: "4. Contato",
      paragraphs: [contactLine],
    },
  ],
};

export const legalDocuments = {
  privacidade: privacyPolicy,
  termos: termsOfUse,
  entrega: deliveryPolicy,
  reembolso: refundPolicy,
} as const;
