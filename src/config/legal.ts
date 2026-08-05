/**
 * Conteúdo das páginas legais.
 *
 * ⚠️ Os campos entre colchetes precisam ser preenchidos com os dados reais do
 * responsável pela marca antes da publicação. Este material é um ponto de
 * partida e não substitui a revisão de um profissional jurídico.
 */
import { brand, commercial, contact } from "./site";

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

/** ⚠️ PREENCHER — data da última revisão dos documentos. */
const UPDATED_AT = "1º de agosto de 2026";

/** ⚠️ PREENCHER — identificação do responsável (nome empresarial e CNPJ/CPF). */
const RESPONSIBLE = "[RAZÃO SOCIAL / CNPJ OU CPF DO RESPONSÁVEL]";

const contactLine = `Dúvidas sobre este documento podem ser enviadas para ${contact.email} ou pelo atendimento oficial da ${brand.name}.`;

export const privacyPolicy: LegalDocument = {
  slug: "privacidade",
  title: "Política de privacidade",
  subtitle: `Como a ${brand.name} trata as informações de quem visita o site e contrata uma leitura.`,
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Quem é o responsável pelos dados",
      paragraphs: [
        `O tratamento de dados descrito nesta política é realizado pela ${brand.name}, sob responsabilidade de ${RESPONSIBLE}.`,
        "Esta política segue a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).",
      ],
    },
    {
      heading: "2. Quais dados coletamos",
      paragraphs: ["Coletamos apenas o necessário para viabilizar o atendimento:"],
      list: [
        "Dados informados no site: primeiro nome, tema escolhido, pacote selecionado, formato de leitura preferido e as perguntas que você escreve para a sua leitura.",
        "Dados do atendimento: eventuais informações adicionais que você compartilhar durante a conversa no WhatsApp, além do que já chega preenchido a partir do site.",
        "Dados técnicos e de campanha: parâmetros de origem (utm_source, utm_medium, utm_campaign, utm_content, utm_term e fbclid), guardados no seu navegador durante a visita.",
        "Dados de medição: somente se você escolher “Aceitar métricas” no aviso exibido no site.",
      ],
    },
    {
      heading: "3. O que pedimos — e o que não pedimos — no site",
      paragraphs: [
        "Para preparar o atendimento, o site pede: primeiro nome, tema da leitura, pacote escolhido, formato preferido e as perguntas que você deseja levar para a sua leitura, escritas diretamente no formulário de cada tema.",
        "O quiz de reflexão exibido antes do resumo de cada tema não é salvo: as respostas ficam apenas no seu navegador, ajudam a montar a prévia exibida na tela e não são enviadas para nós.",
        "O site não pede, em nenhuma etapa: nome de terceiros, data de nascimento, informações de saúde, CPF ou qualquer documento.",
      ],
    },
    {
      heading: "4. Para que usamos os dados",
      list: [
        "Preparar a mensagem de WhatsApp com o pacote, o tema e as perguntas informadas, e iniciar o atendimento.",
        "Preparar e entregar a leitura contratada.",
        "Compreender o desempenho das campanhas de divulgação, de forma agregada, quando há consentimento.",
        "Cumprir obrigações legais aplicáveis.",
      ],
    },
    {
      heading: "5. Medição e Meta Pixel",
      paragraphs: [
        "As tecnologias de medição só são carregadas depois que você escolhe “Aceitar métricas”. Se você optar por continuar sem métricas, o site funciona normalmente e nenhum pixel é ativado.",
        "Quando ativas, enviamos ao provedor de anúncios apenas informações comerciais: nome do pacote, quantidade de perguntas, valor e moeda.",
        "Nunca enviamos ao provedor de anúncios: as perguntas da consulta, o conteúdo da conversa, o texto da leitura, nome de terceiros, informações de saúde, respostas abertas ou qualquer dado pessoal sensível.",
        "Você pode revogar a escolha limpando os dados do site no seu navegador.",
      ],
    },
    {
      heading: "6. Compartilhamento",
      paragraphs: [
        "Não vendemos dados pessoais. O compartilhamento ocorre apenas com provedores necessários à operação, como a plataforma de mensagens utilizada no atendimento, o serviço de hospedagem do site e, mediante consentimento, o provedor de medição de campanhas.",
      ],
    },
    {
      heading: "7. Confidencialidade do atendimento",
      paragraphs: [
        "O conteúdo compartilhado durante a leitura é tratado com discrição e não é divulgado publicamente nem utilizado em materiais de divulgação sem autorização expressa da pessoa atendida.",
      ],
    },
    {
      heading: "8. Retenção",
      paragraphs: [
        "As conversas são mantidas pelo tempo necessário ao atendimento e ao cumprimento de obrigações legais. Você pode solicitar a exclusão das mensagens a qualquer momento.",
      ],
    },
    {
      heading: "9. Seus direitos",
      paragraphs: ["Você pode solicitar, a qualquer momento:"],
      list: [
        "Confirmação da existência de tratamento e acesso aos seus dados.",
        "Correção de dados incompletos ou desatualizados.",
        "Anonimização, bloqueio ou eliminação de dados desnecessários.",
        "Informação sobre com quem os dados foram compartilhados.",
        "Revogação do consentimento de medição.",
      ],
    },
    {
      heading: "10. Segurança",
      paragraphs: [
        "Adotamos medidas razoáveis para proteger as informações tratadas. Nenhum sistema é totalmente livre de riscos, mas o acesso ao atendimento é restrito à operação oficial da marca.",
      ],
    },
    {
      heading: "11. Contato",
      paragraphs: [contactLine],
    },
  ],
};

export const termsOfUse: LegalDocument = {
  slug: "termos",
  title: "Termos de uso",
  subtitle: `Condições para o uso do site e a contratação das leituras da ${brand.name}.`,
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Aceitação",
      paragraphs: [
        `Ao navegar neste site e contratar uma leitura, você concorda com estes termos. O serviço é oferecido pela ${brand.name}, sob responsabilidade de ${RESPONSIBLE}.`,
      ],
    },
    {
      heading: "2. Natureza do serviço",
      paragraphs: [
        "O tarô é apresentado como ferramenta de reflexão e orientação. As leituras oferecem perspectivas simbólicas sobre o momento atual e não constituem previsão garantida de acontecimentos futuros.",
        "As leituras não substituem acompanhamento médico, psicológico, jurídico ou financeiro. As decisões continuam sendo responsabilidade do cliente.",
      ],
    },
    {
      heading: "3. Idade mínima",
      paragraphs: ["O atendimento é destinado a maiores de 18 anos."],
    },
    {
      heading: "4. Limites de conteúdo",
      paragraphs: ["Não realizamos, em nenhuma hipótese:"],
      list: [
        "Diagnóstico médico ou psicológico.",
        "Aconselhamento jurídico ou financeiro.",
        "Previsão de morte ou de doenças.",
        "Orientação para jogos de azar.",
        "Promessas de reconciliação, de retorno de relacionamentos ou de qualquer resultado garantido.",
        "Afirmações sobre a conduta ou a intenção de terceiros.",
      ],
    },
    {
      heading: "5. Como funciona a contratação",
      list: [
        "Você escolhe o tema, responde a um breve quiz de reflexão e escolhe o pacote pelo site.",
        "Você escreve, no próprio site, as perguntas que deseja levar para a leitura, na quantidade correspondente ao pacote escolhido.",
        "O atendimento continua pelo WhatsApp, já com o pacote e as perguntas preenchidos, onde a disponibilidade e a forma de pagamento são confirmadas.",
        `O pagamento é realizado por ${commercial.paymentMethod}.`,
      ],
    },
    {
      heading: "6. Perguntas",
      paragraphs: [
        "A quantidade de perguntas corresponde ao pacote contratado e é escrita por você diretamente no site, antes da confirmação do atendimento pelo WhatsApp. As perguntas poderão ser ajustadas antes do início da preparação da leitura; depois de iniciado o atendimento, alterações poderão ser consideradas novas perguntas.",
        "As perguntas devem priorizar a forma como a situação afeta você, seus sentimentos, suas escolhas e seus limites.",
      ],
    },
    {
      heading: "7. Conduta",
      paragraphs: [
        "Reservamo-nos o direito de recusar ou encerrar um atendimento em caso de desrespeito, pedidos que violem estes termos ou solicitações fora do escopo do serviço.",
      ],
    },
    {
      heading: "8. Propriedade intelectual",
      paragraphs: [
        `Os textos, o logotipo, as identidades visuais e os materiais deste site pertencem à ${brand.name}. O conteúdo entregue na leitura é de uso pessoal do cliente.`,
      ],
    },
    {
      heading: "9. Alterações",
      paragraphs: [
        "Estes termos podem ser atualizados. A versão vigente é sempre a publicada nesta página.",
      ],
    },
    {
      heading: "10. Contato",
      paragraphs: [contactLine],
    },
  ],
};

export const deliveryPolicy: LegalDocument = {
  slug: "entrega",
  title: "Política de entrega",
  subtitle: "Como, quando e em que formato a sua leitura é entregue.",
  updatedAt: UPDATED_AT,
  blocks: [
    {
      heading: "1. Formato de entrega",
      paragraphs: [
        "Todas as leituras são digitais e entregues pelo WhatsApp, no formato correspondente ao pacote contratado (texto, áudio ou conforme descrito no pacote), acompanhadas da foto das cartas.",
      ],
    },
    {
      heading: "2. Prazo",
      paragraphs: [
        `O prazo estimado de entrega é ${commercial.deliveryTime}, contado a partir da confirmação do pagamento e do recebimento de todas as perguntas.`,
        "O prazo é confirmado no atendimento antes do pagamento. Se houver qualquer alteração, você será informado.",
      ],
    },
    {
      heading: "3. Início da contagem",
      paragraphs: [
        "A contagem começa somente quando as perguntas estiverem completas. Perguntas enviadas parcialmente podem deslocar o início da preparação.",
      ],
    },
    {
      heading: "4. Não há envio físico",
      paragraphs: [
        "Não há produto físico, frete ou envio pelos Correios. Nenhum custo adicional de entrega é cobrado.",
      ],
    },
    {
      heading: "5. Falha no recebimento",
      paragraphs: [
        "Caso você não receba a leitura no prazo informado, entre em contato pelo mesmo atendimento. A entrega será reenviada sem custo adicional.",
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
        "Conforme o artigo 49 do Código de Defesa do Consumidor, você pode desistir da contratação em até 7 (sete) dias corridos, contados do pagamento, desde que a preparação da leitura ainda não tenha sido iniciada.",
      ],
    },
    {
      heading: "2. Quando o reembolso é integral",
      list: [
        "Solicitação feita antes do início da preparação da leitura.",
        "Impossibilidade de realização do atendimento por parte da Entre Nós Tarô.",
        "Não entrega da leitura dentro do prazo confirmado, sem alternativa acordada.",
      ],
    },
    {
      heading: "3. Quando o reembolso não se aplica",
      paragraphs: [
        "Após a entrega da leitura, o serviço é considerado prestado. Como se trata de conteúdo personalizado e não devolvível, não há reembolso por discordância quanto ao conteúdo simbólico apresentado.",
        "Também não há reembolso quando a leitura não é retirada por falta de resposta do cliente no atendimento.",
      ],
    },
    {
      heading: "4. Como solicitar",
      paragraphs: [
        `A solicitação deve ser feita pelo mesmo atendimento utilizado na contratação ou pelo e-mail ${contact.email}, informando o pacote contratado e a data do pagamento.`,
      ],
    },
    {
      heading: "5. Prazo de devolução",
      paragraphs: [
        `A devolução é feita pelo mesmo meio de pagamento (${commercial.paymentMethod}) em até 10 (dez) dias úteis após a confirmação da solicitação.`,
      ],
    },
    {
      heading: "6. Reagendamento",
      paragraphs: [
        "Se preferir, no lugar do reembolso é possível reagendar a leitura para outro momento, mantendo o crédito do valor pago.",
      ],
    },
    {
      heading: "7. Contato",
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
