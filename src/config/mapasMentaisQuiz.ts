/**
 * Conteúdo do quiz de autoavaliação exibido em MapasMentaisPage
 * (/produto/concursos-enfermagem). Arquivo INDEPENDENTE de
 * src/config/guiaQuiz.ts — não importado por ele, não o altera.
 *
 * Estrutura análoga à de guiaQuiz.ts (perguntas + tipo de perfil +
 * mensagens por perfil + função auxiliar), adaptada ao conteúdo: aqui as
 * perguntas são de AUTOAVALIAÇÃO (momento de preparação, dificuldade,
 * método de revisão, tempo disponível) em vez de perguntas de "certo ou
 * errado" — não existe resposta objetivamente incorreta, então cada opção
 * aponta para um perfil de estudo, nunca para uma nota. O resultado final
 * é o perfil mais apontado pelas respostas (empate resolvido pela última
 * pergunta respondida).
 *
 * Nunca formular como promessa de aprovação, nem como orientação
 * individual — sempre em termos de organização e apoio à revisão.
 */

export type StudyProfile = "base-em-construcao" | "revisao-estrategica" | "reta-final";

export interface QuizOption {
  label: string;
  profile: StudyProfile;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

export const mapasMentaisQuizQuestions: QuizQuestion[] = [
  {
    question: "Em qual momento da preparação você está?",
    options: [
      { label: "Ainda estou organizando o conteúdo e revisando o básico", profile: "base-em-construcao" },
      { label: "Já revisei boa parte e quero fixar os pontos principais", profile: "revisao-estrategica" },
      { label: "A prova está próxima e preciso revisar rápido", profile: "reta-final" },
    ],
  },
  {
    question: "Qual é sua maior dificuldade durante os estudos?",
    options: [
      { label: "Organizar tanto conteúdo disperso em um só lugar", profile: "base-em-construcao" },
      { label: "Lembrar dos pontos-chave na hora de revisar", profile: "revisao-estrategica" },
      { label: "Falta de tempo para revisar tudo antes da prova", profile: "reta-final" },
    ],
  },
  {
    question: "Como você costuma revisar conteúdos extensos?",
    options: [
      { label: "Releio o material de estudo praticamente do zero", profile: "base-em-construcao" },
      { label: "Faço resumos próprios para fixar o conteúdo", profile: "revisao-estrategica" },
      { label: "Busco atalhos visuais para revisar o mais rápido possível", profile: "reta-final" },
    ],
  },
  {
    question: "Quanto tempo você possui para revisar durante o dia?",
    options: [
      { label: "Bastante tempo — estou construindo a base com calma", profile: "base-em-construcao" },
      { label: "Um tempo moderado, dá para revisar com estratégia", profile: "revisao-estrategica" },
      { label: "Pouco tempo — preciso ser direto(a) ao ponto", profile: "reta-final" },
    ],
  },
];

export const mapasMentaisProfileMessages: Record<StudyProfile, { title: string; body: string }> = {
  "base-em-construcao": {
    title: "Sua base está em construção",
    body: "Nesta fase, o mais importante é ter os conteúdos organizados em um só lugar, sem precisar montar tudo do zero. Os mapas mentais ilustrados ajudam a visualizar a estrutura de cada tema antes de entrar nos detalhes, para você construir a base com mais clareza e menos sensação de estar estudando sem direção.",
  },
  "revisao-estrategica": {
    title: "Hora de revisar com mais estratégia",
    body: "Você já tem o conteúdo revisado — agora o ganho está em fixar os pontos principais rapidamente, sem reler tudo de novo. Os mapas mentais funcionam como um resumo visual para consultar antes de cada nova rodada de estudo, direto pelo celular.",
  },
  "reta-final": {
    title: "Reta final: revisão rápida e direta",
    body: "Com a prova próxima, o tempo é o recurso mais importante. Os mapas mentais ilustrados foram pensados para revisão visual e objetiva, ajudando a localizar rapidamente os pontos que você mais precisa relembrar nesta fase.",
  },
};

/**
 * Resolve o perfil a partir das respostas dadas (uma por pergunta, na
 * ordem de mapasMentaisQuizQuestions) — o perfil mais escolhido vence;
 * empate é resolvido pela resposta MAIS RECENTE entre os empatados (
 * reflete melhor o momento atual da pessoa do que a primeira resposta).
 */
export function resolveMapasMentaisProfile(answers: StudyProfile[]): StudyProfile {
  const counts: Record<StudyProfile, number> = {
    "base-em-construcao": 0,
    "revisao-estrategica": 0,
    "reta-final": 0,
  };
  for (const profile of answers) counts[profile] += 1;

  let winner: StudyProfile = answers[answers.length - 1] ?? "revisao-estrategica";
  let best = -1;
  for (const profile of answers) {
    if (counts[profile] >= best) {
      best = counts[profile];
      winner = profile;
    }
  }
  return winner;
}
