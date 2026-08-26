/**
 * Conteúdo do quiz de autoavaliação exibido em BalancoHidricoPage
 * (/balanco-hidrico). Arquivo INDEPENDENTE de src/config/guiaQuiz.ts e de
 * src/config/mapasMentaisQuiz.ts — não importa nem é importado por eles,
 * não os altera.
 *
 * Mesma estrutura de src/config/mapasMentaisQuiz.ts (perguntas de
 * autoavaliação, sem resposta certa/errada — cada opção aponta para um
 * perfil, nunca para uma nota), adaptada aos quatro eixos do balanço
 * hídrico pedidos: segurança para registrar entradas e saídas, cálculo do
 * saldo, interpretação de balanço positivo/negativo e organização dos
 * registros no plantão.
 *
 * Nunca formular como orientação clínica individual, promessa de
 * resultado ou certificação — sempre em termos de organização e apoio ao
 * registro/estudo.
 */

export type HydricProfile = "revisar-fundamentos" | "organizar-registro" | "consulta-rapida";

export interface QuizOption {
  label: string;
  profile: HydricProfile;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

export const balancoHidricoQuizQuestions: QuizQuestion[] = [
  {
    question: "Como você se sente ao registrar entradas e saídas durante o plantão?",
    options: [
      { label: "Ainda tenho dúvida sobre o que exatamente entra em cada categoria", profile: "revisar-fundamentos" },
      { label: "Sei o que registrar, mas perco tempo organizando tudo no papel", profile: "organizar-registro" },
      { label: "Já registro bem, só quero um modelo rápido para consultar", profile: "consulta-rapida" },
    ],
  },
  {
    question: "Na hora de calcular o saldo, qual é a sua situação?",
    options: [
      { label: "Preciso rever como calcular o saldo parcial e o de 24 horas", profile: "revisar-fundamentos" },
      { label: "Sei calcular, mas às vezes erro por falta de um roteiro claro", profile: "organizar-registro" },
      { label: "Calculo com segurança, quero só confirmar com exemplos práticos", profile: "consulta-rapida" },
    ],
  },
  {
    question: "E quando o balanço dá positivo ou negativo, como você interpreta o resultado?",
    options: [
      { label: "Ainda não tenho segurança para interpretar o que isso indica", profile: "revisar-fundamentos" },
      { label: "Interpreto, mas gostaria de mais exemplos para comparar", profile: "organizar-registro" },
      { label: "Interpreto bem, só quero uma referência visual rápida", profile: "consulta-rapida" },
    ],
  },
  {
    question: "Como estão organizados os seus registros ao longo do plantão hoje?",
    options: [
      { label: "Sem um roteiro fixo — cada plantão eu registro de um jeito", profile: "revisar-fundamentos" },
      { label: "Tenho uma rotina, mas sem um checklist para conferir tudo", profile: "organizar-registro" },
      { label: "Já sigo uma rotina organizada, quero um checklist para agilizar", profile: "consulta-rapida" },
    ],
  },
];

export const balancoHidricoProfileMessages: Record<HydricProfile, { title: string; body: string }> = {
  "revisar-fundamentos": {
    title: "Vamos revisar os fundamentos com você",
    body: "Nesta fase, o mais importante é entender com clareza o que conta como entrada, o que conta como saída, e como isso vira um cálculo confiável. O Balanço Hídrico Ilustrado explica cada etapa de forma visual, para você registrar com mais segurança desde a base.",
  },
  "organizar-registro": {
    title: "Hora de organizar o seu registro",
    body: "Você já entende o processo — agora o ganho está em ter um roteiro claro para seguir durante o plantão, sem perder tempo nem se perder nos cálculos. O material reúne modelos e exemplos práticos para deixar o seu registro mais rápido e consistente.",
  },
  "consulta-rapida": {
    title: "Uma consulta rápida para o seu dia a dia",
    body: "Você já registra e calcula bem — o Balanço Hídrico Ilustrado funciona como uma referência visual e um checklist de plantão para conferir rapidamente cada etapa, sem precisar recorrer a anotações soltas.",
  },
};

/**
 * Resolve o perfil a partir das respostas dadas (uma por pergunta, na
 * ordem de balancoHidricoQuizQuestions) — o perfil mais escolhido vence;
 * empate é resolvido pela resposta MAIS RECENTE entre os empatados. Mesmo
 * algoritmo de resolveMapasMentaisProfile (não importado — cópia
 * deliberada, arquivo independente).
 */
export function resolveBalancoHidricoProfile(answers: HydricProfile[]): HydricProfile {
  const counts: Record<HydricProfile, number> = {
    "revisar-fundamentos": 0,
    "organizar-registro": 0,
    "consulta-rapida": 0,
  };
  for (const profile of answers) counts[profile] += 1;

  let winner: HydricProfile = answers[answers.length - 1] ?? "organizar-registro";
  let best = -1;
  for (const profile of answers) {
    if (counts[profile] >= best) {
      best = counts[profile];
      winner = profile;
    }
  }
  return winner;
}
