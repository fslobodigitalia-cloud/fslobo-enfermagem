/**
 * Biblioteca "Modelos de registros". Estes tipos descrevem o que a tela precisa de UM modelo e foram pensados para o acervo real vir do
 * BACKEND mais tarde (ver supabase-app/docs/biblioteca-modelos-proposta.md). Nesta entrega o acervo é só DEMONSTRATIVO e vem empacotado
 * no app (library/demoModels.ts). Os textos dos e-books NUNCA ficam no repositório: entram pelo backend, depois.
 */
export type RecordKind = "anotacao" | "evolucao";

export type ModelSourceRef = {
  title: string;
  url: string;
  /** Que parte da fonte sustenta o modelo. */
  detail: string;
  /** Data (AAAA-MM-DD) em que a fonte foi conferida. */
  checked: string;
};

export type RecordModel = {
  slug: string;
  kind: RecordKind;
  /** id de uma categoria de Library.categories */
  category: string;
  title: string;
  summary: string;
  /** Palavras-chave de busca (sem peso editorial: só ajudam a achar). */
  keywords: string[];
  /** Contexto de uso: parágrafos curtos. */
  context: string[];
  /** Exemplo: uma linha por item; **trecho** vira negrito semântico. */
  example: string[];
  exampleNote: string;
  /** Informações que quem usa o modelo precisa adaptar à sua situação real. */
  adapt: string[];
  /** Orientações curtas; **trecho** vira negrito. */
  guidance: string[];
  sources: ModelSourceRef[];
  /** Data (AAAA-MM-DD) da revisão editorial do modelo; null = ainda não revisado. */
  reviewedAt: string | null;
  /** Conteúdo fictício e demonstrativo (nunca é texto de e-book). */
  demo: boolean;
  /** Exercício da Prática parecido, se houver (só um atalho para treinar). */
  exerciseId?: string;
};

export type Category = { id: string; label: string };

/** Grupo de termos equivalentes na busca (ex.: "falta de ar" = "dispneia"). */
export type SynonymGroup = string[];

export type Library = {
  models: RecordModel[];
  categories: Category[];
  synonyms: SynonymGroup[];
};

export const KIND_LABEL: Record<RecordKind, string> = { anotacao: "Anotação", evolucao: "Evolução" };
