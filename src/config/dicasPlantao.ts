/**
 * Conteúdo fixo das Dicas de Plantão. Orientações gerais de organização e
 * rotina — deliberadamente NUNCA conduta clínica individualizada, protocolo
 * institucional ou recomendação de dose/via/tratamento (ver instrução da
 * tarefa: não virar protocolo clínico).
 */

export const DICAS_CATEGORIAS = [
  "Organização",
  "Comunicação",
  "Registros",
  "Medicações",
  "Segurança",
  "Passagem de plantão",
] as const;

export type DicaCategoria = (typeof DICAS_CATEGORIAS)[number];

export interface Dica {
  id: string;
  categoria: DicaCategoria;
  texto: string;
}

export const DICAS: Dica[] = [
  { id: "d1", categoria: "Organização", texto: "Comece identificando o que possui horário definido e o que pode ser priorizado ao longo do turno." },
  { id: "d2", categoria: "Organização", texto: "Separe mentalmente as tarefas por urgência antes de iniciar a rotina do plantão." },
  { id: "d3", categoria: "Organização", texto: "Revise sua lista de pendências em intervalos regulares, não só no início e no fim do turno." },
  { id: "d4", categoria: "Registros", texto: "Registre o cuidado de forma objetiva, cronológica e compatível com aquilo que foi realizado." },
  { id: "d5", categoria: "Registros", texto: "Evite abreviações que possam gerar dúvida para quem for ler o registro depois." },
  { id: "d6", categoria: "Registros", texto: "Atualize as anotações assim que possível, em vez de depender só da memória mais tarde." },
  { id: "d7", categoria: "Comunicação", texto: "Na passagem de plantão, destaque mudanças clínicas, pendências e informações que realmente interferem na continuidade do cuidado." },
  { id: "d8", categoria: "Comunicação", texto: "Confirme se a informação foi compreendida por quem está recebendo a passagem, não só transmitida." },
  { id: "d9", categoria: "Comunicação", texto: "Priorize objetividade ao comunicar intercorrências para o restante da equipe." },
  { id: "d10", categoria: "Medicações", texto: "Antes da administração, confira prescrição, identificação, apresentação e informações necessárias para execução segura." },
  { id: "d11", categoria: "Medicações", texto: "Separe um momento só para conferência de horários de medicação, sem interrupções, quando possível." },
  { id: "d12", categoria: "Medicações", texto: "Guarde o registro de checagem assim que a administração for concluída." },
  { id: "d13", categoria: "Segurança", texto: "Sempre confirme a identificação do paciente antes de qualquer procedimento." },
  { id: "d14", categoria: "Segurança", texto: "Reporte qualquer situação de risco assim que identificada, sem esperar o fim do plantão." },
  { id: "d15", categoria: "Segurança", texto: "Mantenha dispositivos e acessos visíveis e organizados para facilitar a checagem." },
  { id: "d16", categoria: "Passagem de plantão", texto: "Estruture a passagem sempre na mesma ordem, para reduzir a chance de esquecer algum ponto." },
  { id: "d17", categoria: "Passagem de plantão", texto: "Anote os pontos-chave da passagem antes de repassar, em vez de confiar só na memória." },
  { id: "d18", categoria: "Passagem de plantão", texto: "Reserve um tempo para que a equipe que está chegando possa tirar dúvidas antes de assumir." },
];
