/**
 * Conteúdo da aba Prática (Anotação e Evolução). TODO o conteúdo é DEMONSTRATIVO e fictício,
 * sujeito a revisão editorial antes de qualquer lançamento. Nenhuma pessoa, data ou número de
 * Coren é real. Os exemplos foram redigidos para esta simulação a partir das fontes listadas em
 * SOURCES; não são texto oficial nem a única redação possível.
 */
export type PracticeMode = "anotacao" | "evolucao";

export type Modality = {
  mode: PracticeMode;
  title: string;
  purpose: string;
  who: string;
  limits: string;
};

export type CaseTable = {
  caption: string;
  head: string[];
  rows: { label: string; cells: string[] }[];
};

export type ModelPart = { text: string; comment: string };

export type Exercise = {
  id: string;
  /** Versão do conteúdo do exercício. O texto salvo na conta fica vinculado a (id, versão); o servidor só aceita pares do catálogo (migration 0009). */
  version: number;
  mode: PracticeMode;
  title: string;
  setting: string;
  summary: string;
  /** Caso resumido (2 frases), mostrado antes dos detalhes. Só repete fatos do caso. */
  glance: string;
  /** Parágrafos do caso (cada um com seus horários). */
  facts: string[];
  /** Tabela opcional de dados ao longo do tempo (evolução). */
  table?: CaseTable;
  /** Parágrafos após a tabela. */
  after?: string[];
  task: string;
  /** Piloto de correção por IA: PAUSADO. O campo fica só para retomar depois; a interface não o usa. */
  aiPilot?: boolean;
  placeholder: string;
  modelIntro: string;
  model: ModelPart[];
  /** Exatamente 3 perguntas de autoavaliação, sem nota. */
  checklist: string[];
};

export type GuideStep = { label: string; hint: string };
export type Guide = { title: string; steps: GuideStep[]; note: string };

/** Roteiro curto de apoio ao lado do campo de escrita. Não é modelo de texto: só lembra o que um registro costuma cobrir. */
export const GUIDES: Record<PracticeMode, Guide> = {
  anotacao: {
    title: "Roteiro de apoio",
    steps: [
      { label: "Ocorrência e relato", hint: "O que **aconteceu** e o que a pessoa **relatou**, com o **horário**." },
      { label: "Observações e medidas", hint: "O que foi **visto** ou **medido**, com os **valores do caso**." },
      { label: "Cuidados e comunicação", hint: "O que foi **feito** ou **orientado** e a quem foi **comunicado**." },
      { label: "Resposta da pessoa", hint: "Como a pessoa **referiu** estar **depois**." },
    ],
    note: "Comece com **data e hora** e termine com **assinatura** (fictícia). Anotação **não traz diagnóstico nem prescrição de enfermagem**.",
  },
  evolucao: {
    title: "Roteiro de apoio",
    steps: [
      { label: "Comparação entre momentos", hint: "Como a pessoa estava **em cada dia** e se **melhorou, manteve ou piorou**." },
      { label: "Metas fornecidas", hint: "Para cada meta do caso: **alcançada ou não**, com o **número** que mostra isso." },
      { label: "Continuidade do acompanhamento", hint: "O que segue **nas próximas 24 horas**, a partir da **prescrição** e do que **não foi alcançado**." },
    ],
    note: "Comece com **data, hora e período avaliado** e termine com **assinatura** (fictícia). Você assume o papel de **enfermeiro(a)**, a quem cabe registrar a evolução (Res. 736/2024, art. 8º); **diagnósticos e prescrição já vêm no caso**, não crie outros.",
  },
};

export type Source = {
  id: string;
  title: string;
  detail: string;
  url: string;
  checked: string;
  limit: string;
};

export const MODALITIES: Modality[] = [
  {
    mode: "anotacao",
    title: "Treinar anotação",
    purpose:
      "Registrar com precisão o que foi observado, medido e feito em um momento do cuidado, com horário e em ordem cronológica.",
    who: "A anotação de enfermagem é feita pela equipe de enfermagem: enfermeiro, técnico e auxiliar (Resolução Cofen 736/2024, arts. 7º e 8º).",
    limits:
      "Anotação não traz diagnóstico de enfermagem nem prescrição de enfermagem: esses dois são privativos do enfermeiro (art. 6º).",
  },
  {
    mode: "evolucao",
    title: "Treinar evolução",
    purpose:
      "Avaliar os resultados alcançados ao longo do tempo: comparar como a pessoa estava e como está, dizer se as metas foram alcançadas e indicar o que segue.",
    who: "A evolução é uma etapa do Processo de Enfermagem (art. 4º, § 5º) e o registro formal das etapas cabe ao enfermeiro (art. 8º). Nesta simulação você assume o papel de enfermeiro(a).",
    limits:
      "Quem não é enfermeiro pode treinar a leitura e a comparação dos dados, mas não registra a evolução formal. Diagnóstico e prescrição de enfermagem são privativos do enfermeiro (art. 6º).",
  },
];

export const SOURCES: Source[] = [
  {
    id: "cofen736",
    title: "Resolução Cofen nº 736/2024 — Processo de Enfermagem",
    detail:
      "Arts. 4º (cinco etapas; § 5º, Evolução), 6º (diagnóstico e prescrição privativos do enfermeiro), 7º (técnicos e auxiliares participam com anotações) e 8º (registro das etapas pelo enfermeiro; anotação pela equipe).",
    url: "https://www.cofen.gov.br/resolucao-cofen-no-736-de-17-de-janeiro-de-2024/",
    checked: "01/11/2026",
    limit:
      "Lida na página oficial. Os PDFs anexos não foram abertos. A resolução não define 'anotação' nem exige data, hora ou Coren; isso vem do Guia abaixo.",
  },
  {
    id: "guia514",
    title: "Guia de Recomendações para o Registro de Enfermagem (Resolução Cofen nº 514/2016)",
    detail:
      "Seção 7 e 7.1 (regras das anotações, itens 1 a 18) e seção 8 e 8.1 (evolução), páginas 14 a 19 do PDF do anexo.",
    url: "https://www.cofen.gov.br/resolucao-cofen-no-05142016/",
    checked: "01/11/2026",
    limit:
      "É anterior à Resolução 736/2024 e usa a terminologia da Resolução 358/2009. Aqui foram usadas só as regras de registro. As Resoluções Cofen 191/2009 e 448/2013, citadas no Guia, não foram abertas.",
  },
];

export const NOT_REAL_DATA =
  "Não escreva nomes, documentos, fotos ou informações de pessoas reais. Na assinatura, use dados fictícios.";

const SIGN_NOTE =
  "[Assinatura e identificação: nome, categoria profissional e número do Coren — fictícios nesta simulação.]";

export const EXERCISES: Exercise[] = [
  {
    id: "anotacao-dispneia-noite",
    version: 1,
    mode: "anotacao",
    title: "Desconforto ao respirar à noite",
    setting: "Clínica médica · plantão noturno",
    summary: "Na ronda, a pessoa relata desconforto ao respirar e dificuldade para dormir.",
    glance:
      "Das **22h10 às 22h40**, uma pessoa de 62 anos, internada por infecção respiratória, **relata desconforto ao respirar**. O caso traz os sinais vitais, um cuidado, a comunicação à enfermeira e a reavaliação.",
    facts: [
      "Pessoa fictícia, **62 anos**, internada há 2 dias em clínica médica para tratamento de **infecção respiratória**. **Plantão noturno de 14/05** (data fictícia).",
      "**22h10** — Na ronda, a pessoa **relata desconforto ao respirar e dificuldade para dormir**. Está acordada, orientada e **em decúbito dorsal**. **Refere dor no tórax de intensidade 3** (escala numérica de 0 a 10), que **piora ao tossir**.",
      "**22h15** — **Sinais vitais aferidos**: PA 128x78 mmHg, FC 88 bpm, FR 22 irpm, SpO2 94% **em ar ambiente**, temperatura axilar 36,8 °C.",
      "**22h17** — A cabeceira é **elevada para 45°** e a pessoa é **orientada a respirar lentamente**.",
      "**22h20** — A enfermeira responsável é **comunicada**.",
      "**22h40** — A pessoa **refere melhora** do desconforto e **adormece**.",
    ],
    task: "Você é quem acompanhou a pessoa neste plantão. Escreva a **anotação de enfermagem** desses fatos.",
    placeholder: "Escreva aqui a sua anotação, usando só as informações do caso.",
    modelIntro:
      "Uma possibilidade, não o único jeito certo. Cada informação está no caso.",
    model: [
      {
        text: "14/05 – 22h10: **Refere** desconforto ao respirar e dificuldade para dormir. Pessoa **acordada, orientada, em decúbito dorsal**. **Relata** dor no tórax 3/10 (escala numérica de 0 a 10), que piora ao tossir.",
        comment:
          "Começa com **data e hora** (Guia, 7.1, item 1). O que a pessoa conta aparece como **relato** ('refere', 'relata') e o que foi observado aparece como **observação** ('acordada, orientada'): o Guia pede para **distinguir os dois** (seção 7, 'Precisão'). A dor traz **intensidade, a escala usada e o fator que a piora**.",
      },
      {
        text: "22h15: **Sinais vitais**: PA 128x78 mmHg, FC 88 bpm, FR 22 irpm, SpO2 94% **em ar ambiente**, temperatura axilar 36,8 °C.",
        comment:
          "Os **valores exatos** e a **condição da medida** (ar ambiente), não só 'estável' ou 'normal' (Guia, seção 7, resumo sobre sinais e sintomas). Sem **termos de valor** (item 16).",
      },
      {
        text: "22h17: **Cabeceira elevada** a 45°. Pessoa **orientada** a respirar lentamente.",
        comment: "**Cuidado realizado** e **orientação dada**, cada um com o seu horário (itens 4 e 6; item 11, cronológicas).",
      },
      {
        text: "22h20: Enfermeira responsável **comunicada**.",
        comment:
          "A **comunicação** fica registrada como foi: o caso não diz o que foi dito nem a resposta da enfermeira, então o registro **não inventa isso** (item 12, 'observações efetuadas e cuidados prestados').",
      },
      {
        text: "22h40: **Refere melhora** do desconforto. **Adormece**.",
        comment:
          "A **resposta da pessoa** ao cuidado (item 13). 'Refere melhora' **atribui a informação à pessoa**, em vez de afirmar por conta própria que ela melhorou.",
      },
      {
        text: SIGN_NOTE,
        comment: "**Assinatura e identificação** com o número do Coren, ao final do registro (item 1).",
      },
    ],
    checklist: [
      "Comecei com data e hora, terminei com assinatura (fictícia) e pus o horário em cada fato, em ordem?",
      "Separei o que a pessoa relatou do que foi observado ou medido, com os valores exatos do caso?",
      "Registrei os cuidados, a comunicação à enfermeira e a resposta da pessoa, sem diagnóstico, prescrição nem informações que o caso não traz?",
    ],
  },
  {
    id: "anotacao-curativo-umido",
    version: 1,
    mode: "anotacao",
    title: "Curativo úmido no pós-operatório",
    setting: "Clínica cirúrgica · plantão diurno",
    summary: "Durante o banho no leito, o curativo da incisão abdominal está úmido.",
    glance:
      "Às **09h30**, no banho no leito, o **curativo da incisão abdominal** de uma pessoa no 1º dia de pós-operatório está úmido. Até as **10h00**: comunicação ao enfermeiro, troca do curativo e reavaliação.",
    facts: [
      "Pessoa fictícia, 54 anos, no **1º dia de pós-operatório** de cirurgia abdominal eletiva, internada em clínica cirúrgica. **Plantão diurno de 15/05** (data fictícia).",
      "**09h30** — Durante o banho no leito, você observa que o **curativo da incisão abdominal** tem uma **mancha úmida de cerca de 3 cm de diâmetro, de coloração amarelo-clara**. A pessoa está **acordada e orientada** e **refere dor 2** (escala numérica de 0 a 10) **ao se movimentar**.",
      "**09h35** — O enfermeiro responsável é **comunicado**, avalia a incisão e **orienta a troca do curativo**.",
      "**09h50** — O curativo é **trocado conforme a orientação do enfermeiro**. Depois da retirada, a incisão está com as **bordas aproximadas e sem sangramento visível**. Um curativo novo, limpo e seco, é colocado.",
      "**10h00** — A pessoa **refere dor 2** (escala numérica de 0 a 10) e **nenhuma queixa nova**. É **orientada a avisar a equipe** se o curativo molhar novamente.",
    ],
    task: "Você é quem realizou o banho e a troca do curativo. Escreva a **anotação de enfermagem** desses fatos.",
    placeholder: "Escreva aqui a sua anotação, usando só as informações do caso.",
    modelIntro:
      "Uma possibilidade, não o único jeito certo. Cada informação está no caso.",
    model: [
      {
        text: "15/05 – 09h30: Durante o banho no leito, **curativo da incisão abdominal com mancha úmida de cerca de 3 cm de diâmetro, de coloração amarelo-clara**. Pessoa **acordada e orientada**. **Refere dor 2/10** (escala numérica de 0 a 10) ao se movimentar.",
        comment:
          "**Tamanho mensurado e coloração**, em vez de 'muito molhado' (Guia, 7.1, itens 15 e 16). **Data e hora** no início (item 1). O **relato de dor** fica separado da **observação do curativo**.",
      },
      {
        text: "09h35: Enfermeiro responsável **comunicado**; avaliou a incisão e **orientou a troca do curativo**.",
        comment:
          "Registra **quem foi comunicado** e **o que foi orientado**, o que permite à equipe seguinte dar continuidade (Guia, seção 7, resumo sobre cuidados e encaminhamentos). O texto **não interpreta** o que a mancha significa: isso não está no caso.",
      },
      {
        text: "09h50: **Realizada a troca do curativo** conforme orientação do enfermeiro. Após a retirada, **incisão com bordas aproximadas e sem sangramento visível**. Colocado curativo novo, limpo e seco.",
        comment:
          "**Procedimento realizado**, com a **origem da orientação**, e a descrição do que foi visto na incisão (itens 6 e 12). 'Sem sangramento visível' descreve a **observação**, sem termo de valor.",
      },
      {
        text: "10h00: **Refere dor 2/10** e nenhuma queixa nova. **Pessoa orientada** a avisar a equipe se o curativo molhar novamente.",
        comment: "**Resposta da pessoa** e orientação dada (itens 4 e 13).",
      },
      {
        text: SIGN_NOTE,
        comment: "**Assinatura e identificação** com o número do Coren, ao final do registro (item 1).",
      },
    ],
    checklist: [
      "Comecei com data e hora, terminei com assinatura (fictícia) e pus o horário em cada fato, em ordem?",
      "Descrevi a mancha com tamanho e coloração e separei o relato de dor do que foi observado no curativo e na incisão?",
      "Registrei a comunicação ao enfermeiro, a troca conforme a orientação, a orientação dada e a resposta da pessoa, sem interpretar (por exemplo, sem escrever que há infecção)?",
    ],
  },
  {
    id: "evolucao-posoperatorio-3dias",
    version: 1,
    mode: "evolucao",
    title: "Dor e mobilização em 3 dias de pós-operatório",
    setting: "Clínica cirúrgica · plantão diurno",
    summary: "Compare os 3 primeiros dias de pós-operatório e diga se as metas foram alcançadas.",
    glance:
      "Pessoa no **3º dia de pós-operatório**, com 2 diagnósticos e **3 metas** definidos no 1º dia. A tabela traz os dados dos três dias; você escreve a **evolução de 18/05, às 18h00**.",
    facts: [
      "Pessoa fictícia, 68 anos, internada desde 14/05 em clínica cirúrgica. Cirurgia abdominal eletiva em 15/05, então **16/05 é o 1º dia** de pós-operatório e **18/05 é o 3º** (datas fictícias).",
      "Já definidos no 1º dia pelo enfermeiro: **diagnósticos de enfermagem** — dor aguda; mobilidade física prejudicada. **Metas** — (1) **dor de no máximo 3** (escala numérica de 0 a 10) ao se movimentar, **até o 3º dia**; (2) **sentar na poltrona**, com auxílio, **até o 2º dia**; (3) **caminhar 30 m** no corredor, com auxílio, **até o 3º dia**.",
      "**Prescrição de enfermagem** — **avaliar a dor** com a escala numérica de 0 a 10, em repouso e ao se movimentar, **a cada plantão**; **estimular a mobilização progressiva**, com auxílio.",
    ],
    table: {
      caption: "Dados registrados nos três dias",
      head: ["", "1º dia 16/05", "2º dia 17/05", "3º dia 18/05"],
      rows: [
        { label: "Dor em repouso (0 a 10)", cells: ["3", "2", "1"] },
        { label: "Dor ao se movimentar (0 a 10)", cells: ["7", "5", "3"] },
        {
          label: "Mobilização",
          cells: [
            "Permaneceu no leito; mudou de decúbito com auxílio",
            "Sentou na poltrona por 20 min, com auxílio",
            "Caminhou 10 m no corredor, com auxílio; pediu para parar por cansaço e voltou ao leito",
          ],
        },
        { label: "Dieta e aceitação", cells: ["Líquida; aceitou 1/2", "Pastosa; aceitou 3/4", "Branda; aceitou toda"] },
        { label: "Curativo da incisão", cells: ["Limpo e seco", "Limpo e seco", "Limpo e seco"] },
        { label: "Temperatura axilar", cells: ["36,6 °C", "36,8 °C", "36,5 °C"] },
      ],
    },
    after: ["Em 18/05, não surgiram queixas nem **problemas novos**."],
    task: "Você é o(a) enfermeiro(a) responsável. Escreva a **evolução de enfermagem de 18/05, às 18h00**, referente às **últimas 24 horas**, **comparando os três dias**.",
    placeholder: "Escreva aqui a sua evolução, comparando os dias e usando só as informações do caso.",
    modelIntro:
      "Uma possibilidade, não o único jeito certo. Cada informação está no caso.",
    model: [
      {
        text: "18/05 – 18h00 – **Evolução de enfermagem** (últimas 24 horas). Pessoa internada desde 14/05; 3º dia de pós-operatório de cirurgia abdominal eletiva.",
        comment:
          "**Data, hora, período avaliado e tempo de internação**, que o Guia lista entre os itens da evolução (seção 8.1).",
      },
      {
        text: "**Diagnósticos de enfermagem** em acompanhamento: dor aguda; mobilidade física prejudicada.",
        comment:
          "Os diagnósticos vêm do caso: o **diagnóstico de enfermagem é privativo do enfermeiro** (Res. 736/2024, art. 6º) e o exemplo **não cria diagnósticos novos**.",
      },
      {
        text: "Dor: em repouso **3, 2 e 1** (1º, 2º e 3º dias); ao se movimentar **7, 5 e 3** (escala numérica de 0 a 10). Meta de dor de no máximo 3 ao se movimentar até o 3º dia: **alcançada**.",
        comment:
          "**Compara os três dias** em vez de descrever só hoje e **julga a meta com o número do caso**. Evolução é a **avaliação dos resultados alcançados** (Res. 736/2024, art. 4º, § 5º) e reúne dados anteriores e atuais para dizer se houve **melhora, manutenção, piora ou problema novo** (Guia, seção 8).",
      },
      {
        text: "Mobilização: permaneceu no leito no 1º dia; sentou na poltrona por 20 min, com auxílio, no 2º (**meta alcançada**); no 3º caminhou 10 m, com auxílio, e pediu para parar por cansaço (**meta de 30 m ainda não alcançada**).",
        comment:
          "Diz com clareza **qual meta foi alcançada e qual não foi**. O motivo da parada é o que a pessoa pediu, **sem explicação que o caso não traz**.",
      },
      {
        text: "Dieta: líquida (aceitou 1/2), pastosa (3/4) e branda (aceitou toda). Curativo da incisão limpo e seco nos três dias. Temperatura axilar 36,6, 36,8 e 36,5 °C. **Sem queixas nem problemas novos em 18/05**.",
        comment:
          "Outros dados do acompanhamento e o registro de que **não há problema novo**, que o Guia pede que conste (seção 8.1). O texto **não conclui mais do que os dados mostram**.",
      },
      {
        text: "Plano para as próximas 24 horas: **manter a avaliação da dor** com a escala numérica, em repouso e ao se movimentar; **manter o estímulo à mobilização progressiva**, com auxílio, e **reavaliar a caminhada**, cuja meta não foi alcançada.",
        comment:
          "O **plano parte da prescrição** do caso e do **resultado que não foi alcançado**. O Guia pede um resumo dos resultados e os problemas a abordar nas 24 horas seguintes (seção 8.1). **Não há conduta nova** que o caso não traga.",
      },
      {
        text: "[Assinatura e identificação: nome, Enfermeiro(a) e número do Coren — fictícios nesta simulação.]",
        comment:
          "O Guia pede **assinatura e número do Coren** na evolução (seção 8.1) e a Res. 736/2024 atribui ao **enfermeiro** o registro das etapas (art. 8º).",
      },
    ],
    checklist: [
      "Comparei os três dias (dor e mobilização), e não só o último, dizendo se houve melhora, manutenção ou piora?",
      "Para cada meta do caso, disse se foi alcançada ou não, apoiado nos números do caso?",
      "Indiquei a continuidade do acompanhamento a partir da prescrição e do que não foi alcançado, registrei que não há problema novo, e coloquei data, hora, período e assinatura (fictícia)?",
    ],
  },
];

export const exerciseById = (id: string | undefined) => EXERCISES.find((e) => e.id === id);
