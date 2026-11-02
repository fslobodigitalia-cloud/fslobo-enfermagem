/**
 * Questões DEMONSTRATIVAS do app. Conteúdo ilustrativo, sujeito a revisão
 * editorial antes de qualquer lançamento — não usar como material de estudo.
 */
export type DemoOption = { id: "A" | "B" | "C" | "D"; text: string };

export type DemoQuestion = {
  id: string;
  topic: string;
  statement: string;
  options: DemoOption[];
  correct: DemoOption["id"];
  explanation: string;
};

export const TRAINING_AREA = "Clínica Médica";

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: "q1",
    topic: "Registros de enfermagem",
    statement: "Quando o registro de um procedimento realizado deve ser feito?",
    options: [
      { id: "A", text: "Logo após a realização, com data e horário." },
      { id: "B", text: "Somente no fim da semana, reunindo todos os plantões." },
      { id: "C", text: "Antes de realizar, para adiantar o trabalho." },
      { id: "D", text: "Apenas quando houver intercorrência." },
    ],
    correct: "A",
    explanation:
      "O registro deve ser feito logo após o cuidado, com data e horário, para refletir fielmente o que foi realizado e garantir a continuidade da assistência. Registrar antes de fazer ou muito depois compromete a fidelidade das informações.",
  },
  {
    id: "q2",
    topic: "Registros de enfermagem",
    statement: "Qual característica torna um registro de enfermagem mais claro?",
    options: [
      { id: "A", text: "Linguagem objetiva e informações relevantes." },
      { id: "B", text: "Opiniões pessoais sobre o paciente." },
      { id: "C", text: "Abreviações sem padronização." },
      { id: "D", text: "Informações que não foram observadas." },
    ],
    correct: "A",
    explanation:
      "Um registro claro descreve fatos observados, com linguagem objetiva e dados relevantes ao cuidado. Opiniões pessoais, abreviações fora de padrão e informações não observadas dificultam a leitura e podem induzir a erros.",
  },
  {
    id: "q3",
    topic: "Sinais vitais",
    statement: "O que deve acompanhar o registro de um sinal vital alterado?",
    options: [
      { id: "A", text: "Apenas a expressão “paciente mal”." },
      { id: "B", text: "O valor aferido, o horário e a conduta ou comunicação realizada." },
      { id: "C", text: "Um diagnóstico médico presumido." },
      { id: "D", text: "Nada, pois a equipe percebe a alteração sem registro." },
    ],
    correct: "B",
    explanation:
      "Registrar o valor, o horário e o que foi feito (conduta, comunicação à equipe) torna a alteração rastreável e permite acompanhar a evolução. Expressões vagas ou diagnósticos presumidos não substituem dados objetivos.",
  },
  {
    id: "q4",
    topic: "Queixa de dor",
    statement: "Ao registrar a queixa de dor de uma pessoa, o mais adequado é:",
    options: [
      { id: "A", text: "Registrar o julgamento do profissional sobre exagero da queixa." },
      { id: "B", text: "Omitir a queixa se ela não for repetida na ronda seguinte." },
      { id: "C", text: "Descrever o relato com as palavras da pessoa, a localização e a intensidade." },
      { id: "D", text: "Registrar somente a medicação administrada." },
    ],
    correct: "C",
    explanation:
      "O relato da pessoa, a localização e a intensidade (por exemplo, em escala numérica) compõem uma descrição fiel da dor. Julgamentos pessoais e omissões prejudicam a avaliação e o acompanhamento do quadro.",
  },
  {
    id: "q5",
    topic: "Identificação do profissional",
    statement: "A anotação de enfermagem deve ser identificada com:",
    options: [
      { id: "A", text: "Uma rubrica ilegível, para agilizar." },
      { id: "B", text: "O nome da pessoa atendida." },
      { id: "C", text: "Nenhuma identificação, se for plantão noturno." },
      { id: "D", text: "Nome legível, categoria profissional e número de inscrição no Coren." },
    ],
    correct: "D",
    explanation:
      "Assinatura legível, categoria profissional e número de inscrição no Coren permitem identificar quem realizou o cuidado e o registro. Rubricas ilegíveis ou ausência de identificação tiram a validade do registro.",
  },
];
