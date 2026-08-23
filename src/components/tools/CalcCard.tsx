import type { ReactNode } from "react";

/** Superfície premium da calculadora ativa — header interno separado por
 * borda (título + fórmula em texto monoespaçado), radius 22px, sombra com
 * profundidade real, bastante respiro no corpo. */
export function CalcCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_24px_48px_-30px_rgba(15,23,42,0.28)]">
      <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/70 to-white px-6 py-5 sm:px-7">
        <h3 className="text-[1.1rem] font-extrabold text-slate-900">{title}</h3>
        {description && <p className="mt-1 font-mono text-[11.5px] text-slate-500">{description}</p>}
      </div>
      <div className="p-6 sm:p-7">{children}</div>
    </div>
  );
}
