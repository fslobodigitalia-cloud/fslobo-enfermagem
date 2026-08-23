import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Campo numérico das calculadoras — `inputMode="decimal"` abre teclado
 * numérico no celular; o valor fica como texto livre (aceita vírgula OU
 * ponto) e só é interpretado na hora de calcular, via
 * src/lib/toolsMath.ts#parseDecimal — nunca coagido a `type="number"`.
 * Redesign: unidade integrada visualmente DENTRO do campo (não mais um
 * texto solto ao lado do label), fundo levemente diferente do branco
 * principal (slate-50 → branco só no foco), altura 50px.
 */
export function CalcField({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-bold text-slate-600">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "h-[50px] w-full rounded-xl border bg-slate-50 px-4 text-[15.5px] text-slate-900 placeholder:text-slate-400 transition-colors",
            "focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20",
            unit && "pr-14",
            error ? "border-rose-300 focus:border-rose-500" : "border-slate-200 hover:border-teal-300 focus:border-teal-600",
          )}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[12.5px] font-semibold text-slate-400">
            {unit}
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Variante <select> — mesmo visual do CalcField, para campos de escolha
 * (ex.: fator do equipo, par de conversão). */
export function CalcSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-bold text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[50px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-[15.5px] text-slate-900 transition-colors focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      >
        {children}
      </select>
    </div>
  );
}
