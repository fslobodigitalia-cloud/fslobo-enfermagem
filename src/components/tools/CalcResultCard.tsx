import { cn } from "@/lib/utils";

/**
 * Painel de resultado — redesenhado em 2 áreas: o RESULTADO como elemento
 * principal (número grande, elegante, fundo com leve gradiente teal) e,
 * separada por uma borda, uma área secundária discreta "Como foi
 * calculado" com a fórmula já substituída pelos valores usados (fundo
 * slate, texto monoespaçado pequeno). `value === null` mostra um estado
 * neutro ("—"), nunca "NaN"/"Infinity".
 */
export function CalcResultCard({
  label = "Resultado",
  value,
  unit,
  formula,
}: {
  label?: string;
  value: string | null;
  unit?: string;
  formula?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className={cn("p-5 text-center transition-colors sm:p-6", value !== null ? "bg-gradient-to-b from-teal-50 to-white" : "bg-slate-50")}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={cn("mt-2 text-[2.4rem] font-extrabold leading-none sm:text-[2.6rem]", value !== null ? "text-teal-800" : "text-slate-300")}>
          {value ?? "—"}
        </p>
        {value !== null && unit && (
          <p className="mt-1.5 text-[12.5px] font-bold uppercase tracking-wide text-teal-600">{unit}</p>
        )}
      </div>
      {formula && value !== null && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Como foi calculado</p>
          <p className="mt-1 break-words font-mono text-[12px] leading-relaxed text-slate-600">{formula}</p>
        </div>
      )}
    </div>
  );
}
