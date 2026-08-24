/**
 * Conteúdo do quiz de enfermagem exibido em GuiaEvolucaoEnfermagemPage.
 * Perguntas baseadas em situações reais de documentação (qualidade do
 * registro, não "cola" de legislação) — trocadas na rodada de redesign de
 * 2026-08 para forçar reflexão em vez de resposta óbvia. Nunca formular
 * como orientação médica individual nem como promessa de proteção
 * jurídica/COREN — sempre em termos de qualidade e segurança do registro.
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
    question: "Após um cuidado, qual registro apresenta maior qualidade documental?",
    options: [
      "Paciente bem, medicado e confortável.",
      "Paciente refere dor 8/10. Realizada intervenção conforme prescrição. Reavaliado após o cuidado, refere dor 3/10, mantendo-se consciente e comunicativo.",
      "Paciente medicado sem intercorrências.",
      "Paciente está melhor.",
    ],
    answerIndex: 1,
    explanation:
      "Um registro forte descreve situação observada, intervenção realizada e resposta do paciente, evitando termos genéricos.",
  },
  {
    question:
      "Durante o plantão ocorre uma mudança importante no estado do paciente. Qual registro é mais útil para continuidade da assistência?",
    options: [
      "Paciente passou mal.",
      "Paciente apresentou alteração, médico avisado.",
      "Registrar os achados objetivos observados, horário, condutas realizadas, comunicação à equipe e resposta apresentada pelo paciente.",
      "Registrar somente no final do plantão para reunir todas as informações.",
    ],
    answerIndex: 2,
    explanation:
      "Informações objetivas, cronológicas e relacionadas às condutas e respostas tornam o registro mais útil para quem dará continuidade à assistência.",
  },
  {
    question: "Qual anotação transmite MENOS informação clínica, apesar de parecer suficiente?",
    options: [
      "Paciente tranquilo.",
      "Paciente em leito, consciente, comunicativo, refere ausência de dor no momento.",
      "Curativo avaliado, sem sinais visíveis de sangramento no momento da observação.",
      "Paciente aceitou dieta ofertada, sem queixas após a refeição.",
    ],
    answerIndex: 0,
    explanation:
      'Expressões vagas como "tranquilo", "bem" ou "sem alterações" podem esconder informações que seriam importantes para compreender a situação.',
  },
  {
    question:
      "Você terminou um procedimento e, minutos depois, percebe que uma informação relevante não entrou na anotação. Qual é o maior problema em simplesmente ignorar essa informação?",
    options: [
      "O prontuário fica visualmente menor.",
      "A equipe seguinte pode receber um registro incompleto do que realmente aconteceu.",
      "Não existe problema se o paciente estiver estável.",
      "Somente informações sobre medicação precisam ser registradas.",
    ],
    answerIndex: 1,
    explanation:
      "O registro também serve para comunicar a assistência realizada e ajudar na continuidade do cuidado.",
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
  if (score <= total / 2) {
    return "Sinal de alerta: vale reforçar a segurança teórica com urgência, para elevar a qualidade e segurança do seu registro profissional.";
  }
  if (score < total) {
    return "Base boa, mas pequenos detalhes ainda podem comprometer a clareza do registro. Os guias prontos ajudam bastante.";
  }
  return "Excelente desempenho! Agora o foco é padronizar as anotações para ganhar velocidade no plantão.";
}
