/**
 * Quiz da oferta combo (/guia-evolucao-medicamentos): as quatro questões de
 * anotação e evolução do Guia (guiaQuiz.ts, reutilizadas sem alteração)
 * mais duas questões curtas de Medicamentos na Prática, baseadas nas
 * páginas reais do material (public/medicamentos-na-pratica/modulo-3.webp
 * e modulo-4.webp — seções 01 "Unidades, conversões e leitura de rótulo" e
 * 04 "Reconstituição e diluição"). Os números dos exemplos são os mesmos
 * exemplos resolvidos impressos nessas páginas.
 */
import { guiaQuizQuestions, type QuizQuestion } from "@/config/guiaQuiz";

export const medicamentosQuizQuestions: QuizQuestion[] = [
  {
    question: "Você precisa expressar 0,75 g em mg. Qual é o valor correto?",
    options: ["7,5 mg", "75 mg", "750 mg", "7.500 mg"],
    answerIndex: 2,
    explanation:
      "1 g = 1.000 mg, então 0,75 g × 1.000 = 750 mg. Ao descer um nível na escala g → mg → mcg, multiplica-se por 1.000. Esse exemplo está resolvido em Medicamentos na Prática, incluído no combo.",
  },
  {
    question:
      "Após reconstituir um frasco-ampola, ele contém 1.000 mg em volume final de 10 mL. A prescrição é de 600 mg. Quantos mL devem ser aspirados?",
    options: ["4 mL", "6 mL", "10 mL", "60 mL"],
    answerIndex: 1,
    explanation:
      "Concentração = 1.000 mg ÷ 10 mL = 100 mg/mL. Volume = 600 mg ÷ 100 mg/mL = 6 mL. Esse exemplo também está resolvido em Medicamentos na Prática, incluído no combo.",
  },
];

export const comboQuizQuestions: QuizQuestion[] = [...guiaQuizQuestions, ...medicamentosQuizQuestions];

/** Mensagem de desempenho do combo — cobre registro (Guia) e medicamentos. */
export function comboQuizPerformanceMessage(score: number, total: number): string {
  if (score <= total / 2) {
    return "Sinal de alerta: vale reforçar tanto a qualidade do registro quanto a segurança nos cálculos de medicação.";
  }
  if (score < total) {
    return "Base boa, mas pequenos detalhes ainda podem comprometer a clareza do registro ou a precisão de um cálculo.";
  }
  return "Excelente desempenho! Agora o foco é padronizar as anotações e ter os cálculos de medicação sempre à mão no plantão.";
}

export const COMBO_QUIZ_INCLUDED_NOTE =
  "No combo de R$ 17 você leva o Guia de Anotação e Evolução e também Medicamentos na Prática, que já está incluído.";
