/**
 * RUBRICA do exercício-piloto "Desconforto ao respirar à noite" (anotação de enfermagem).
 *
 * É um arquivo de DADOS para revisão editorial: cada item diz o que o caso afirma (fatos), que regra de
 * registro se aplica (normas) e o que NÃO deve ser cobrado. Nada aqui é nota: serve para apontar o que o aluno
 * pode revisar. Fontes já conferidas em 01/11/2026 (ver docs/rubrica-anotacao-dispneia.md):
 *   - Guia de Recomendações para o Registro de Enfermagem (Res. Cofen 514/2016), seção 7 e 7.1, itens 1 a 18.
 *   - Res. Cofen 736/2024, arts. 6º a 8º (diagnóstico e prescrição privativos do enfermeiro; anotação pela equipe).
 *
 * O texto do caso abaixo (CASE_FACTS) PRECISA ser idêntico ao do app (src/app-enfermagem/data/practice.ts);
 * o teste `tests/rubric-sync.mjs` confere isso.
 */
export const EXERCISE_ID = "anotacao-dispneia-noite";
export const RUBRIC_VERSION = "2026-11-02.1";

export const CASE_FACTS: string[] = [
  "Pessoa fictícia, 62 anos, internada há 2 dias em clínica médica para tratamento de infecção respiratória. Plantão noturno de 14/05 (data fictícia).",
  "22h10 — Na ronda, a pessoa relata desconforto ao respirar e dificuldade para dormir. Está acordada, orientada e em decúbito dorsal. Refere dor no tórax de intensidade 3 (escala numérica de 0 a 10), que piora ao tossir.",
  "22h15 — Sinais vitais aferidos: PA 128x78 mmHg, FC 88 bpm, FR 22 irpm, SpO2 94% em ar ambiente, temperatura axilar 36,8 °C.",
  "22h17 — A cabeceira é elevada para 45° e a pessoa é orientada a respirar lentamente.",
  "22h20 — A enfermeira responsável é comunicada.",
  "22h40 — A pessoa refere melhora do desconforto e adormece.",
];

/** Horários que existem no caso (HH:MM). Qualquer outro horário citado pelo aluno não vem do caso. */
export const CASE_TIMES = ["22:10", "22:15", "22:17", "22:20", "22:40"];

/** Valores do caso usados nas conferências objetivas (deterministicas). */
export const CASE_VALUES = {
  paSys: 128, paDia: 78, fc: 88, fr: 22, spo2: 94, tax: "36,8", pain: 3, headDegrees: 45,
};

export type RubricKind = "fato" | "norma" | "extra";
export type Rubric = {
  id: string;
  kind: RubricKind;
  /** Falta deste item é falha factual (categoria "ausente") ou só sugestão opcional (categoria "clareza"). */
  essential: boolean;
  title: string;
  /** O que o caso/critério afirma. É o texto mostrado ao aluno como "evidência". */
  criterion: string;
  /** Formas diferentes que PRESERVAM o significado e devem ser aceitas. */
  accept: string;
  source: string;
  /** Texto curto de acerto, mostrado quando o trecho do aluno cumpre o item. */
  hitNote: string;
  /** Explicação padrão (usada se a da IA vier vazia ou inválida). */
  defaultExplanation: string;
};

const GUIA = "Guia de Recomendações para o Registro de Enfermagem (Cofen 514/2016)";

export const RUBRIC: Rubric[] = [
  {
    id: "F1", kind: "fato", essential: true,
    title: "Queixa respiratória e dificuldade para dormir (22h10)",
    criterion: "Às 22h10 a pessoa relata desconforto ao respirar e dificuldade para dormir.",
    accept: "‘falta de ar’, ‘dispneia’, ‘dificuldade para respirar’ e ‘não consegue dormir’ preservam o sentido. Não exigir as palavras do caso.",
    source: "Caso, 22h10", hitNote: "Registrou o relato de desconforto ao respirar e de dificuldade para dormir.",
    defaultExplanation: "O caso informa o relato da pessoa às 22h10; ele faz parte do registro.",
  },
  {
    id: "F2", kind: "fato", essential: false,
    title: "Estado geral e posição (22h10)",
    criterion: "Às 22h10 a pessoa está acordada, orientada e em decúbito dorsal.",
    accept: "‘consciente’, ‘lúcida’, ‘deitada de costas’, ‘DD’ preservam o sentido.",
    source: "Caso, 22h10; " + GUIA + ", seção 7.1, item 3", hitNote: "Descreveu o estado geral e a posição da pessoa.",
    defaultExplanation: "O caso descreve o estado geral e a posição; incluir ajuda quem lê a seguir.",
  },
  {
    id: "F3", kind: "fato", essential: true,
    title: "Dor torácica: local, intensidade e fator de piora (22h10)",
    criterion: "A pessoa refere dor no tórax de intensidade 3 na escala numérica de 0 a 10, que piora ao tossir.",
    accept: "‘3/10’, ‘nível 3’, ‘dor torácica’, ‘dor no peito’ preservam o sentido. Mencionar a escala é desejável, não obrigatório.",
    source: "Caso, 22h10; " + GUIA + ", seção 7.1, itens 3g e 13", hitNote: "Registrou a dor com local, intensidade e o que a piora.",
    defaultExplanation: "O caso traz o local, a intensidade (3/10) e o fator de piora da dor.",
  },
  {
    id: "F4", kind: "fato", essential: true,
    title: "Sinais vitais com valores exatos (22h15)",
    criterion: "Às 22h15: PA 128x78 mmHg, FC 88 bpm, FR 22 irpm, SpO2 94% em ar ambiente, temperatura axilar 36,8 °C.",
    accept: "Abreviações usuais (SSVV, PA, FC, FR, SpO2, Tax, mmHg, bpm, irpm, ‘ar ambiente’/AA) são aceitas. A ordem dos valores não importa.",
    source: "Caso, 22h15; " + GUIA + ", seção 7 (sinais vitais com os valores exatos)", hitNote: "Registrou os sinais vitais com os valores aferidos.",
    defaultExplanation: "O Guia pede os valores exatos aferidos, e não só termos como ‘estável’.",
  },
  {
    id: "F5", kind: "fato", essential: true,
    title: "Cuidados realizados (22h17)",
    criterion: "Às 22h17 a cabeceira é elevada para 45° e a pessoa é orientada a respirar lentamente.",
    accept: "‘cabeceira a 45 graus’, ‘elevei a cabeceira’, ‘orientei respiração lenta/devagar’ preservam o sentido.",
    source: "Caso, 22h17; " + GUIA + ", seção 7.1, itens 4 e 6", hitNote: "Registrou o cuidado realizado e a orientação dada.",
    defaultExplanation: "O caso traz um cuidado e uma orientação; o Guia pede que os cuidados realizados sejam registrados.",
  },
  {
    id: "F6", kind: "fato", essential: true,
    title: "Comunicação à enfermeira responsável (22h20)",
    criterion: "Às 22h20 a enfermeira responsável é comunicada.",
    accept: "‘avisei a enfermeira’, ‘enfermeira ciente’, ‘Enf. comunicada’ preservam o sentido. O caso não diz o que foi dito nem o que a enfermeira respondeu: não exigir esses detalhes.",
    source: "Caso, 22h20; " + GUIA + ", seção 7.1, item 12", hitNote: "Registrou a comunicação à enfermeira responsável.",
    defaultExplanation: "O caso informa que a enfermeira responsável foi comunicada; isso deve constar.",
  },
  {
    id: "F7", kind: "fato", essential: true,
    title: "Resposta da pessoa (22h40)",
    criterion: "Às 22h40 a pessoa refere melhora do desconforto e adormece.",
    accept: "‘melhorou’, ‘referiu alívio’, ‘dormindo’, ‘adormeceu’ preservam o sentido.",
    source: "Caso, 22h40; " + GUIA + ", seção 7.1, item 13", hitNote: "Registrou a resposta da pessoa após o cuidado.",
    defaultExplanation: "O Guia pede a resposta da pessoa diante dos cuidados; o caso traz a melhora referida às 22h40.",
  },
  {
    id: "N1", kind: "norma", essential: false,
    title: "Data e hora no início do registro",
    criterion: "O registro é precedido de data e hora (o caso informa 14/05 como data fictícia e os horários de cada fato).",
    accept: "Data no cabeçalho e horários antes de cada fato; ‘14/05 – 22h10’ ou ‘22:10’ valem.",
    source: GUIA + ", seção 7.1, item 1", hitNote: "Começou o registro com data e hora.",
    defaultExplanation: "O Guia pede que a anotação seja precedida de data e hora.",
  },
  {
    id: "N2", kind: "norma", essential: false,
    title: "Assinatura e identificação ao final",
    criterion: "Ao final há assinatura e identificação do profissional com o número do Coren (nesta simulação, dados fictícios ou um espaço indicado).",
    accept: "Qualquer indicação clara de assinatura/identificação fictícia (por exemplo ‘[assinatura e Coren]’) vale. Não pedir dados reais.",
    source: GUIA + ", seção 7.1, item 1", hitNote: "Indicou assinatura e identificação ao final.",
    defaultExplanation: "O Guia pede assinatura e identificação com o número do Coren ao final de cada registro.",
  },
  {
    id: "N3", kind: "norma", essential: false,
    title: "Ordem cronológica e horário de cada fato",
    criterion: "Os fatos aparecem em ordem cronológica, cada um com o seu horário.",
    accept: "Agrupar fatos do mesmo minuto sob um horário vale. Registro corrido sem quebra de linha vale se os horários estiverem presentes.",
    source: GUIA + ", seção 7.1, item 11", hitNote: "Organizou os fatos em ordem cronológica.",
    defaultExplanation: "O Guia pede registros cronológicos e pontuais; indicar o horário de cada fato ajuda a continuidade do cuidado.",
  },
  {
    id: "N4", kind: "norma", essential: false,
    title: "Separar o que a pessoa relatou do que foi observado ou medido",
    criterion: "O relato da pessoa (‘refere’, ‘relata’) fica distinto do que foi observado ou medido.",
    accept: "Qualquer marcação clara do relato (‘refere’, ‘queixa-se de’, ‘segundo a paciente’) vale.",
    source: GUIA + ", seção 7 (Precisão)", hitNote: "Distinguiu o relato da pessoa do que foi observado.",
    defaultExplanation: "O Guia pede que se distinga o que foi observado do que foi relatado pela pessoa.",
  },
  {
    id: "N6", kind: "norma", essential: false,
    title: "Evitar termos de valor",
    criterion: "Evitar termos que deem conotação de valor (bem, mal, muito, pouco…); preferir o dado observado ou medido.",
    accept: "‘Refere melhora’ é relato da pessoa e não é termo de valor do profissional. Só apontar quando o profissional emite o juízo.",
    source: GUIA + ", seção 7.1, item 16", hitNote: "Descreveu os dados sem termos de valor.",
    defaultExplanation: "O Guia pede para evitar termos como ‘bem’, ‘mal’, ‘muito’ e ‘pouco’; descreva o que foi observado ou medido.",
  },
  {
    id: "N7", kind: "norma", essential: false,
    title: "Abreviaturas",
    criterion: "Usar apenas abreviaturas previstas em literatura. São aceitas, sem apontamento: SSVV, PA, FC, FR, SpO2/SatO2, Tax/T. ax., mmHg, bpm, irpm, AA (ar ambiente), DD (decúbito dorsal), Enf., cab.",
    accept: "Só apontar abreviatura desconhecida ou ambígua, com certeza baixa ou média.",
    source: GUIA + ", seção 7.1, item 17", hitNote: "Usou apenas abreviaturas usuais.",
    defaultExplanation: "O Guia pede apenas abreviaturas previstas em literatura; na dúvida, escreva por extenso.",
  },
  {
    id: "N8", kind: "norma", essential: false,
    title: "Anotação não traz diagnóstico nem prescrição de enfermagem",
    criterion: "A anotação registra dados simples (observações, cuidados e respostas). Diagnóstico de enfermagem e prescrição de enfermagem são privativos do enfermeiro e não constam do caso.",
    accept: "Descrever sinais e sintomas observados é adequado; nomear um diagnóstico ou prescrever condutas, não.",
    source: "Res. Cofen 736/2024, art. 6º; " + GUIA + ", seção 7.1, item 18", hitNote: "Manteve a anotação nos dados observados.",
    defaultExplanation: "Diagnóstico e prescrição de enfermagem são privativos do enfermeiro; a anotação registra dados simples.",
  },
  {
    id: "X1", kind: "extra", essential: true,
    title: "Informação que não consta do caso",
    criterion: "O caso não traz essa informação. Use apenas o que o caso informa: não acrescente sinais, valores, cuidados, medicamentos, falas, exames, respostas da pessoa nem horários que ele não menciona.",
    accept: "Parafrasear fatos do caso não é acrescentar. Interpretações ‘gerais’ (por exemplo ‘paciente estável’) sem dado do caso também contam como não fornecidas.",
    source: "Caso; orientação do exercício (‘use somente as informações do caso’)", hitNote: "",
    defaultExplanation: "Essa informação não aparece no caso; na simulação, registre só o que o caso informa.",
  },
];

export const RUBRIC_BY_ID: Record<string, Rubric> = Object.fromEntries(RUBRIC.map((r) => [r.id, r]));
export const FACT_IDS = RUBRIC.filter((r) => r.kind === "fato").map((r) => r.id);
export const ALL_IDS = RUBRIC.map((r) => r.id);
export const HIT_IDS = RUBRIC.filter((r) => r.id !== "X1").map((r) => r.id);

/** Abreviaturas aceitas (normalizadas, sem acento e em minúsculas). Apontamento só de abreviatura aceita é descartado. */
export const ACCEPTED_ABBREVIATIONS = [
  "ssvv", "pa", "fc", "fr", "spo2", "sato2", "sat", "tax", "t", "mmhg", "bpm", "irpm", "aa", "dd", "enf", "enfa", "cab",
  "ar", "ambiente",
];
