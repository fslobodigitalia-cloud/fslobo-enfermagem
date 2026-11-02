import { MODALITIES, SOURCES, exerciseById } from "../data/practice";
import type { Library, ModelSourceRef, RecordModel } from "./types";

/**
 * ACERVO DEMONSTRATIVO (3 modelos). Nada aqui vem de e-book: cada exemplo é o texto fictício que JÁ existia nos exercícios da Prática
 * (data/practice.ts), reaproveitado por referência (não é copiado, para não divergir). Os demais campos (contexto, o que adaptar,
 * orientações) são frases curtas que só repetem o que os exercícios e as fontes já conferidas dizem. O acervo real será carregado
 * pelo backend depois. Os 3 modelos são identificados como "Demonstrativo" na tela.
 */
const isoOf = (br: string) => br.split("/").reverse().join("-"); // "01/11/2026" -> "2026-11-01"
const SOURCE_REFS: ModelSourceRef[] = SOURCES.map((s) => ({ title: s.title, url: s.url, detail: s.detail, checked: isoOf(s.checked) }));
const modality = (kind: "anotacao" | "evolucao") => MODALITIES.find((m) => m.mode === kind)!;
const exampleOf = (id: string) => exerciseById(id)!.model.map((m) => m.text);

const BASE_ANOTACAO = [
  "Separe o que a pessoa **relatou** do que foi **observado ou medido** (Guia 514/2016, seção 7, “Precisão”).",
  "Use **valores exatos** e a condição da medida, sem termos de valor como “muito” ou “pouco” (item 16).",
  "Registre o **horário de cada fato**, em ordem cronológica (item 11).",
  "A anotação **não traz diagnóstico nem prescrição de enfermagem** (Res. Cofen 736/2024, art. 6º).",
];

const dispneia = exerciseById("anotacao-dispneia-noite")!;
const curativo = exerciseById("anotacao-curativo-umido")!;
const evolucao = exerciseById("evolucao-posoperatorio-3dias")!;

const MODELS: RecordModel[] = [
  {
    slug: "desconforto-ao-respirar-a-noite",
    kind: "anotacao",
    category: "respiratorio",
    title: dispneia.title,
    summary: "Plantão noturno: queixa respiratória, sinais vitais, um cuidado, comunicação à enfermeira e a resposta da pessoa.",
    keywords: ["queixa respiratória", "sinais vitais", "SSVV", "cabeceira elevada", "dor no tórax", "plantão noturno", "comunicação à enfermeira", "SpO2"],
    context: [
      "Referência para registrar, em um plantão, uma queixa de desconforto ao respirar: o que a pessoa relatou, o que foi observado e medido, o cuidado feito, a comunicação à enfermeira responsável e como a pessoa ficou depois.",
      modality("anotacao").who,
      modality("anotacao").limits,
    ],
    example: exampleOf(dispneia.id),
    exampleNote: "Uma possibilidade, não o único jeito certo. O caso é fictício; cada informação do exemplo está no caso do exercício.",
    adapt: [
      "**Data e hora** do início e de cada fato (no exemplo: 14/05, de 22h10 a 22h40).",
      "**Queixa e dor**, com a intensidade e a escala usada.",
      "**Valores medidos** e a condição da medida (no exemplo: PA, FC, FR, SpO2 em ar ambiente, temperatura axilar).",
      "**Cuidados e orientações** que você de fato realizou, cada um com o horário.",
      "**Quem foi comunicado** e quando. Não registre o que não foi dito nem respondido.",
      "**Resposta da pessoa** depois do cuidado.",
      "**Assinatura e identificação** (nome, categoria e número do Coren: fictícios neste exemplo).",
    ],
    guidance: BASE_ANOTACAO,
    sources: SOURCE_REFS,
    reviewedAt: null,
    demo: true,
    exerciseId: dispneia.id,
  },
  {
    slug: "curativo-umido-no-pos-operatorio",
    kind: "anotacao",
    category: "feridas",
    title: curativo.title,
    summary: "Durante o banho no leito: curativo da incisão úmido, comunicação ao enfermeiro, troca do curativo e resposta da pessoa.",
    keywords: ["curativo", "incisão abdominal", "troca de curativo", "banho no leito", "mancha úmida", "pós-operatório", "plantão diurno"],
    context: [
      "Referência para registrar a observação de um curativo úmido: o que foi visto (tamanho e coloração), a comunicação ao enfermeiro, o procedimento feito conforme a orientação e como a pessoa ficou depois.",
      modality("anotacao").who,
      modality("anotacao").limits,
    ],
    example: exampleOf(curativo.id),
    exampleNote: "Uma possibilidade, não o único jeito certo. O caso é fictício; cada informação do exemplo está no caso do exercício.",
    adapt: [
      "**Data e hora** do início e de cada fato (no exemplo: 15/05, de 09h30 a 10h00).",
      "**Tamanho e coloração** do que foi observado no curativo (no exemplo: cerca de 3 cm, amarelo-clara).",
      "**Dor**, com a intensidade, a escala e quando ocorre.",
      "**Quem orientou** e o que foi orientado.",
      "**Procedimento realizado**, conforme a orientação, e o aspecto da incisão depois.",
      "**Orientação dada à pessoa** e a resposta dela.",
      "**Assinatura e identificação** (nome, categoria e número do Coren: fictícios neste exemplo).",
    ],
    guidance: [
      "Descreva **tamanho e coloração**, sem interpretar (por exemplo, sem escrever que há infecção).",
      ...BASE_ANOTACAO,
    ],
    sources: SOURCE_REFS,
    reviewedAt: null,
    demo: true,
    exerciseId: curativo.id,
  },
  {
    slug: "dor-e-mobilizacao-em-3-dias-de-pos-operatorio",
    kind: "evolucao",
    category: "pos-operatorio",
    title: evolucao.title,
    summary: "Evolução do enfermeiro: compara os três dias, avalia as metas já definidas e indica a continuidade do acompanhamento.",
    keywords: ["metas", "mobilização", "dor", "escala numérica", "plano", "24 horas", "prescrição de enfermagem", "diagnóstico de enfermagem", "pós-operatório"],
    context: [
      "Referência para registrar a evolução de enfermagem: comparar os momentos, dizer se as metas já definidas foram alcançadas e indicar o que segue no acompanhamento.",
      modality("evolucao").who,
      modality("evolucao").limits,
    ],
    example: exampleOf(evolucao.id),
    exampleNote: "Uma possibilidade, não o único jeito certo. O caso é fictício; cada informação do exemplo está no caso do exercício.",
    adapt: [
      "**Data, hora e período avaliado**, e o tempo de internação ou de pós-operatório.",
      "**Os dados de cada dia** (no exemplo: dor em repouso e ao se movimentar, mobilização, dieta, curativo, temperatura).",
      "**As metas e a prescrição** definidas para a pessoa. Não crie metas nem diagnósticos novos.",
      "**Se cada meta foi alcançada ou não**, com os números que mostram isso.",
      "**O plano** para as próximas horas, a partir da prescrição e do que não foi alcançado.",
      "**Assinatura e identificação** de quem registra (enfermeiro; número do Coren fictício neste exemplo).",
    ],
    guidance: [
      "**Compare** os momentos, e não só o último.",
      "Para cada meta do caso, diga se foi **alcançada ou não**, com os números (Guia 514/2016, seção 8).",
      "Registre se **surgiram problemas novos**.",
      "O plano parte da **prescrição** e do que não foi alcançado, **sem condutas novas** que o caso não traga.",
    ],
    sources: SOURCE_REFS,
    reviewedAt: null,
    demo: true,
    exerciseId: evolucao.id,
  },
];

export const DEMO_LIBRARY: Library = {
  models: MODELS,
  categories: [
    { id: "respiratorio", label: "Queixa respiratória" },
    { id: "feridas", label: "Feridas e curativos" },
    { id: "pos-operatorio", label: "Pós-operatório e metas" },
  ],
  // Sinônimos cadastrados (demonstrativos). O acervo real terá os seus, cadastrados pelo backend.
  synonyms: [
    ["falta de ar", "dispneia", "desconforto ao respirar", "dificuldade para respirar", "desconforto respiratório"],
    ["curativo úmido", "curativo molhado"],
    ["pós-operatório", "pós-cirúrgico", "pós cirurgia"],
    ["sinais vitais", "SSVV"],
    ["metas", "objetivos"],
  ],
};

