/**
 * Persistência do Checklist de Plantão — SOMENTE localStorage do
 * navegador, nunca enviado a nenhum servidor. Mesma disciplina defensiva
 * do resto do projeto (try/catch em toda leitura/escrita, ver
 * src/context/CartContext.tsx) — indisponibilidade de localStorage nunca
 * quebra a página, só faz o progresso não sobreviver a um reload.
 *
 * Deliberadamente NÃO guarda nenhum dado de paciente — só o estado
 * marcado/desmarcado de itens fixos (por id) e os itens pessoais que a
 * própria pessoa cadastrar (texto livre, aviso explícito na página para
 * nunca incluir nome/prontuário).
 */

const STORAGE_KEY = "fslobo:checklist-plantao:v1";

export interface CustomChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistStorageState {
  checked: Record<string, boolean>;
  customItems: CustomChecklistItem[];
}

const EMPTY_STATE: ChecklistStorageState = { checked: {}, customItems: [] };

function isCustomChecklistItem(value: unknown): value is CustomChecklistItem {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.label === "string";
}

function isChecklistStorageState(value: unknown): value is ChecklistStorageState {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.checked === null || typeof record.checked !== "object" || Array.isArray(record.checked)) return false;
  if (!Object.values(record.checked as Record<string, unknown>).every((v) => typeof v === "boolean")) return false;
  if (!Array.isArray(record.customItems)) return false;
  return record.customItems.every(isCustomChecklistItem);
}

export function readChecklistState(): ChecklistStorageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed: unknown = JSON.parse(raw);
    return isChecklistStorageState(parsed) ? parsed : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

export function writeChecklistState(state: ChecklistStorageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage indisponível — o checklist segue funcionando em
    // memória durante esta sessão da página, só não sobrevive a um reload.
  }
}
