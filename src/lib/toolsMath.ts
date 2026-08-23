/**
 * Helpers de parse/format e funções de cálculo puras usadas por
 * src/components/tools/calculators/*.tsx (Calculadora de Enfermagem).
 *
 * Único lugar que sabe interpretar "1.234,56" ou "1234.56" (vírgula OU
 * ponto decimal, as duas convenções brasileiras comuns em teclado
 * numérico de celular) e formatar de volta em pt-BR.
 *
 * Puramente matemático — nenhuma função aqui recomenda dose, via,
 * velocidade clínica, diluente ou qualquer decisão assistencial; elas só
 * executam a conta que o profissional informou. Ver aviso de segurança em
 * src/pages/tools/CalculadoraEnfermagemPage.tsx.
 */

/** Aceita "12,5", "12.5", "1.234,56", "1234.56" — o ÚLTIMO separador
 * encontrado (vírgula ou ponto) é tratado como decimal; separadores
 * anteriores são tratados como milhar e removidos. `null` se o texto não
 * for um número válido (nunca lança, nunca devolve NaN). */
export function parseDecimal(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = trimmed;
  } else if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = trimmed.replace(/,/g, "");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Type guard: número finito e ESTRITAMENTE positivo — a maioria dos
 * campos das calculadoras (volume, tempo, dose, fator do equipo) não faz
 * sentido como zero ou negativo. */
export function isPositiveFinite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Divisão seguro: NUNCA devolve NaN/Infinity — `null` se o divisor for
 * zero, não finito, ou o resultado não for finito (impede divisão por
 * zero silenciosa em qualquer calculadora). */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** Formata em pt-BR com no máximo `maxDecimals` casas, sem zeros à
 * direita inúteis (12 em vez de 12,00; 12,5 em vez de 12,50). */
export function formatDecimal(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/* ─────────────────────────── Conversões de unidade ─────────────────────────── */

export type ConversionUnitPair = "g-mg" | "mg-g" | "mg-mcg" | "mcg-mg" | "l-ml" | "ml-l";

export interface ConversionDefinition {
  label: string;
  fromUnit: string;
  toUnit: string;
  factor: number; // valor_destino = valor_origem * factor
}

export const CONVERSION_DEFINITIONS: Record<ConversionUnitPair, ConversionDefinition> = {
  "g-mg": { label: "Gramas → Miligramas", fromUnit: "g", toUnit: "mg", factor: 1000 },
  "mg-g": { label: "Miligramas → Gramas", fromUnit: "mg", toUnit: "g", factor: 1 / 1000 },
  "mg-mcg": { label: "Miligramas → Microgramas", fromUnit: "mg", toUnit: "mcg", factor: 1000 },
  "mcg-mg": { label: "Microgramas → Miligramas", fromUnit: "mcg", toUnit: "mg", factor: 1 / 1000 },
  "l-ml": { label: "Litros → Mililitros", fromUnit: "L", toUnit: "mL", factor: 1000 },
  "ml-l": { label: "Mililitros → Litros", fromUnit: "mL", toUnit: "L", factor: 1 / 1000 },
};

/* ───────────────────────── Horas/minutos (tempo de infusão) ───────────────────────── */

/** Converte um número decimal de horas em "Xh" ou "Xh Ymin" — nunca "0h
 * 60min" (arredonda o carry de minutos para a hora seguinte). */
export function formatHoursAndMinutes(decimalHours: number): string {
  if (!Number.isFinite(decimalHours) || decimalHours < 0) return "—";
  let horas = Math.floor(decimalHours);
  let minutos = Math.round((decimalHours - horas) * 60);
  if (minutos === 60) {
    horas += 1;
    minutos = 0;
  }
  if (horas === 0 && minutos === 0) return "menos de 1 min";
  const partes: string[] = [];
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}min`);
  return partes.join(" ");
}
