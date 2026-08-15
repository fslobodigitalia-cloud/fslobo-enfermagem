/**
 * Conteúdo do quiz de enfermagem exibido em GuiaEvolucaoEnfermagemPage —
 * portado da landing page de referência (reference/manual2026.html,
 * página /manual2026/ que já converteu bem). O conteúdo CLÍNICO das
 * perguntas, alternativas e explicações não foi alterado nesta etapa —
 * só a estrutura (de objetos soltos no <script> da página antiga para
 * dados tipados aqui, consumidos por um componente React nativo).
 */

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Índice (0-based) da alternativa correta em `options`. */
  answerIndex: number;
  explanation: string;
}

export const guiaQuizQuestions: QuizQuestion[] = [
  {
    question:
      "Qual profissional da equipe de enfermagem tem a competência privativa de realizar a Evolução de Enfermagem?",
    options: ["Técnico de Enfermagem", "Enfermeiro", "Auxiliar de Enfermagem", "Qualquer membro da equipe"],
    answerIndex: 1,
    explanation:
      "A Evolução de Enfermagem é uma atividade privativa do Enfermeiro. O Técnico ou Auxiliar realiza a Anotação de Enfermagem.",
  },
  {
    question: "Em caso de erro durante a anotação manual no prontuário, qual a conduta correta?",
    options: [
      "Usar corretivo líquido",
      "Riscar a palavra até ficar ilegível",
      'Utilizar a palavra "digo" entre vírgulas',
      "Arrancar a folha",
    ],
    answerIndex: 2,
    explanation:
      'Nunca rasure o prontuário. O correto é colocar a palavra errada entre vírgulas, seguida da expressão "digo", e então escrever o termo correto.',
  },
  {
    question: "O que NÃO deve constar em uma Anotação de Enfermagem segura?",
    options: [
      "Sinais vitais e medidas aferidas",
      'Termos vagos como "passa bem" ou "sem queixas"',
      "Horário exato da ocorrência",
      "Condutas tomadas após uma intercorrência",
    ],
    answerIndex: 1,
    explanation:
      'Termos genéricos como "passa bem" não possuem valor clínico ou legal. Deve-se descrever de forma objetiva os fatos e dados observados no paciente.',
  },
  {
    question: "Sobre o registro de recusa de medicação pelo paciente, é correto afirmar:",
    options: [
      "Não é necessário anotar, basta devolver o remédio à farmácia",
      "Deve-se circular o horário e ignorar",
      "Anotar o motivo, orientar o paciente e notificar o enfermeiro/médico",
      "Obrigar o paciente a tomar para não prejudicar o registro",
    ],
    answerIndex: 2,
    explanation:
      "É um direito do paciente recusar terapias. A enfermagem deve anotar a recusa, o motivo relatado, a orientação prestada sobre os riscos e comunicar a chefia/médico responsável.",
  },
  {
    question:
      "Para garantir o seu respaldo legal, o registro no prontuário físico deve obrigatoriamente ser finalizado com:",
    options: [
      "Apenas o primeiro nome e um visto",
      "Assinatura e número do CPF",
      "Apenas a rubrica",
      "Identificação legível (nome, Coren e categoria), preferencialmente com carimbo",
    ],
    answerIndex: 3,
    explanation:
      "Segundo o COFEN, é obrigatório constar a identificação clara do profissional que executou a ação, contendo nome, categoria e número do COREN.",
  },
];

export type NursingProfile = "tecnico" | "estudante-tecnico" | "graduado" | "estudante-graduacao";

export const guiaProfileOptions: { id: NursingProfile; label: string }[] = [
  { id: "tecnico", label: "Técnico(a) de Enfermagem" },
  { id: "estudante-tecnico", label: "Estudante de Técnico" },
  { id: "graduado", label: "Enfermeiro(a) Graduado(a)" },
  { id: "estudante-graduacao", label: "Estudante de Enfermagem" },
];

export const guiaProfileMessages: Record<NursingProfile, { title: string; body: string }> = {
  tecnico: {
    title: "Respaldo e agilidade para o técnico",
    body: "Como Técnico, a Anotação de Enfermagem é o seu principal escudo legal. É o documento que prova o excelente cuidado que você prestou. Nossos roteiros garantem que você escreva os termos certos rapidamente, sem precisar pensar do zero no fim do plantão.",
  },
  "estudante-tecnico": {
    title: "Começando a carreira com segurança",
    body: 'Aprender a fazer Anotações corretas agora vai te poupar muitas broncas no estágio e garantir elogios no seu primeiro emprego. Com os nossos modelos em mãos, você não vai sofrer do "branco" na hora de escrever no prontuário.',
  },
  graduado: {
    title: "Direto ao ponto para o enfermeiro",
    body: "A sua Evolução direciona toda a conduta da equipe técnica e é o seu maior documento de defesa. Sabemos que a correria é enorme. Com os modelos pré-estruturados, você garante uma evolução impecável em minutos, poupando a sua mente para a clínica.",
  },
  "estudante-graduacao": {
    title: "Brilhe nos estágios de enfermagem",
    body: "Fazer Evoluções de Enfermagem costuma dar muito frio na barriga dos estudantes. Ter esses roteiros amigáveis salvos com você vai te dar a confiança necessária para escrever como um profissional experiente desde o primeiro dia de estágio.",
  },
};

/** Mensagem de desempenho exibida logo depois da última pergunta, antes de pedir o perfil. */
export function guiaQuizPerformanceMessage(score: number, total: number): string {
  if (score <= 2) {
    return "Sinal de alerta: vale reforçar a segurança teórica com urgência, para não comprometer o seu COREN.";
  }
  if (score < total) {
    return "Base boa, mas pequenos detalhes ainda podem dar dor de cabeça em uma auditoria. Os guias prontos ajudam bastante.";
  }
  return "Excelente desempenho! Agora o foco é padronizar as anotações para ganhar velocidade no plantão.";
}
