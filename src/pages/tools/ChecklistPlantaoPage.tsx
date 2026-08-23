import * as React from "react";
import { ClipboardCheck, Info, Plus, Trash2, X } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ToolsPageHero } from "@/components/tools/ToolsPageHero";
import { ToolsCta } from "@/components/tools/ToolsCta";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CHECKLIST_BLOCKS } from "@/config/checklistPlantao";
import { readChecklistState, writeChecklistState, type CustomChecklistItem } from "@/lib/checklistStorage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const CHECKBOX_CLASS =
  "mt-0.5 h-[18px] w-[18px] border-slate-300 bg-white hover:border-teal-500 data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600 data-[state=checked]:text-white";

/**
 * Checklist de Plantão — /ferramentas/checklist-plantao. Progresso e itens
 * pessoais vivem SOMENTE em localStorage (src/lib/checklistStorage.ts) —
 * nenhum dado sai do navegador, nenhum campo de identificação de paciente
 * existe aqui de propósito. Redesign: blocos viraram accordion (Radix, já
 * usado no resto do site) para dar sensação de grupos organizados em vez
 * de uma lista longa; card de progresso com leve gradiente/profundidade
 * no topo. Nenhuma mudança de comportamento/dados nesta etapa.
 */
export default function ChecklistPlantaoPage() {
  useDocumentMeta({
    title: "Checklist de Plantão | FSlobo Enfermagem",
    description:
      "Checklist interativo e gratuito para organizar o plantão de enfermagem por etapa — início, avaliação, medicações, registros e final do turno. Progresso salvo só no seu navegador.",
    path: "/ferramentas/checklist-plantao",
  });

  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [customItems, setCustomItems] = React.useState<CustomChecklistItem[]>([]);
  const [newItemText, setNewItemText] = React.useState("");
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    const state = readChecklistState();
    setChecked(state.checked);
    setCustomItems(state.customItems);
    loadedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (!loadedRef.current) return;
    writeChecklistState({ checked, customItems });
  }, [checked, customItems]);

  const allItems = React.useMemo(
    () => [...CHECKLIST_BLOCKS.flatMap((block) => block.items), ...customItems],
    [customItems],
  );
  const totalCount = allItems.length;
  const doneCount = allItems.filter((item) => checked[item.id]).length;
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  function toggleItem(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleAddCustomItem(event?: React.FormEvent) {
    event?.preventDefault();
    const label = newItemText.trim();
    if (label.length === 0) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCustomItems((prev) => [...prev, { id, label }]);
    setNewItemText("");
  }

  function removeCustomItem(id: string) {
    setCustomItems((prev) => prev.filter((item) => item.id !== id));
    setChecked((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // "Limpar checklist" reseta só o progresso (desmarca tudo) — os itens
  // pessoais cadastrados continuam existindo, para não precisar recadastrar
  // a cada plantão. Remover um item específico é feito pelo X ao lado dele.
  function handleClearChecklist() {
    setChecked({});
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />

      <main>
        <ToolsPageHero
          icon={ClipboardCheck}
          title="Checklist de Plantão"
          subtitle="Uma forma simples de organizar informações e pendências ao longo do turno."
          breadcrumbCurrent="Checklist de Plantão"
        />

        <section className="py-7 sm:py-8">
          <div className="mx-auto w-full max-w-[760px] px-5 sm:px-6">
            <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 sm:p-5">
              <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-teal-600" strokeWidth={1.9} aria-hidden="true" />
              <p className="text-[13px] leading-relaxed text-slate-700">
                Seu progresso fica salvo só neste navegador — nenhum dado é enviado para nenhum servidor.{" "}
                <span className="font-semibold text-slate-900">
                  Evite inserir nomes, prontuários ou outras informações identificáveis de pacientes.
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* Card de progresso — leve gradiente, mais profundidade que um card comum. */}
        <section className="pb-2">
          <div className="mx-auto w-full max-w-[760px] px-5 sm:px-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50/70 via-white to-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_18px_36px_-26px_rgba(15,23,42,0.28)]">
              <div className="p-5 sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Progresso do plantão</p>
                <div className="mt-1.5 flex items-end justify-between gap-3">
                  <span className="text-[2.3rem] font-extrabold leading-none text-teal-700 sm:text-[2.5rem]">{percent}%</span>
                  <span className="pb-1 text-[13px] font-semibold text-slate-500">
                    {doneCount} de {totalCount} concluídos
                  </span>
                </div>
                <div
                  className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-teal-600 transition-all duration-300" style={{ width: `${percent}%` }} />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleClearChecklist} className="mt-4">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                  Limpar checklist
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Blocos — accordion, abertos por padrão (dá pra recolher o que já concluiu). */}
        <section className="py-8">
          <div className="mx-auto w-full max-w-[760px] px-5 sm:px-6">
            <Accordion type="multiple" defaultValue={CHECKLIST_BLOCKS.map((b) => b.id)} className="flex flex-col gap-3">
              {CHECKLIST_BLOCKS.map((block) => {
                const blockDone = block.items.filter((item) => checked[item.id]).length;
                return (
                  <AccordionItem key={block.id} value={block.id}>
                    <AccordionTrigger>
                      <span className="flex w-full items-center justify-between gap-2 pr-1">
                        <span>{block.title}</span>
                        <span className="text-[12px] font-semibold text-slate-400">
                          {blockDone}/{block.items.length}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul role="list" className="flex flex-col gap-2.5">
                        {block.items.map((item) => {
                          const isChecked = Boolean(checked[item.id]);
                          return (
                            <li key={item.id}>
                              <label
                                htmlFor={`chk-${item.id}`}
                                className="flex cursor-pointer items-start gap-3 rounded-xl p-1.5 transition-colors hover:bg-slate-50"
                              >
                                <Checkbox
                                  id={`chk-${item.id}`}
                                  checked={isChecked}
                                  onCheckedChange={() => toggleItem(item.id)}
                                  className={CHECKBOX_CLASS}
                                />
                                <span className={`text-[14px] leading-snug ${isChecked ? "text-slate-400 line-through" : "text-slate-700"}`}>
                                  {item.label}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Itens pessoais */}
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-[0.98rem] font-extrabold text-slate-900">Itens pessoais</h2>
              {customItems.length > 0 && (
                <ul role="list" className="mt-3.5 flex flex-col gap-2.5">
                  {customItems.map((item) => {
                    const isChecked = Boolean(checked[item.id]);
                    return (
                      <li key={item.id} className="flex items-start gap-2">
                        <label htmlFor={`chk-${item.id}`} className="flex flex-1 cursor-pointer items-start gap-3 rounded-xl p-1.5 transition-colors hover:bg-slate-50">
                          <Checkbox
                            id={`chk-${item.id}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleItem(item.id)}
                            className={CHECKBOX_CLASS}
                          />
                          <span className={`text-[14px] leading-snug ${isChecked ? "text-slate-400 line-through" : "text-slate-700"}`}>
                            {item.label}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustomItem(item.id)}
                          aria-label={`Remover item pessoal "${item.label}"`}
                          className="mt-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <form onSubmit={handleAddCustomItem} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <label htmlFor="novo-item-pessoal" className="sr-only">
                  Adicionar item pessoal
                </label>
                <Input
                  id="novo-item-pessoal"
                  value={newItemText}
                  onChange={(event) => setNewItemText(event.target.value)}
                  placeholder="Ex.: Conferir material do carrinho de emergência"
                  maxLength={160}
                  className="h-[48px] flex-1 rounded-xl border-slate-200 bg-slate-50 text-[14.5px] text-slate-900 placeholder:text-slate-400 hover:border-teal-300 focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
                />
                <Button type="submit" className="sm:w-auto">
                  <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Adicionar
                </Button>
              </form>
              <p className="mt-2.5 text-[12px] text-slate-400">
                Itens pessoais ficam salvos só neste navegador, junto com o restante do checklist.
              </p>
            </div>
          </div>
        </section>

        <ToolsCta
          title="Continue se preparando para o plantão"
          body="Encontre materiais para consulta durante os estudos e preparação para o plantão."
        />
      </main>

      <SiteFooter />
    </div>
  );
}
