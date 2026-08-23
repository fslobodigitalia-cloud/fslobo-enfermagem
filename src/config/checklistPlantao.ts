/**
 * Conteúdo fixo do Checklist de Plantão. Só texto — nenhum campo de
 * paciente, nenhuma coleta de dado sensível. Progresso e itens pessoais
 * (adicionados pela própria pessoa) vivem em src/lib/checklistStorage.ts,
 * só no localStorage do navegador.
 */

export interface ChecklistItemDef {
  id: string;
  label: string;
}

export interface ChecklistBlockDef {
  id: string;
  title: string;
  items: ChecklistItemDef[];
}

export const CHECKLIST_BLOCKS: ChecklistBlockDef[] = [
  {
    id: "inicio",
    title: "Início do plantão",
    items: [
      { id: "inicio-1", label: "Receber passagem de plantão" },
      { id: "inicio-2", label: "Conferir identificação dos pacientes" },
      { id: "inicio-3", label: "Verificar prescrições e pendências" },
      { id: "inicio-4", label: "Identificar exames/procedimentos programados" },
      { id: "inicio-5", label: "Organizar prioridades" },
    ],
  },
  {
    id: "avaliacao",
    title: "Avaliação e dispositivos",
    items: [
      { id: "avaliacao-1", label: "Conferir sinais vitais conforme rotina" },
      { id: "avaliacao-2", label: "Observar acessos e dispositivos" },
      { id: "avaliacao-3", label: "Verificar curativos e necessidades de cuidado" },
      { id: "avaliacao-4", label: "Conferir balanço/controles quando aplicável" },
    ],
  },
  {
    id: "medicacoes",
    title: "Medicações e procedimentos",
    items: [
      { id: "medicacoes-1", label: "Conferir horários" },
      { id: "medicacoes-2", label: "Revisar pendências" },
      { id: "medicacoes-3", label: "Registrar procedimentos realizados" },
      { id: "medicacoes-4", label: "Confirmar checagens necessárias" },
    ],
  },
  {
    id: "registros",
    title: "Registros",
    items: [
      { id: "registros-1", label: "Atualizar anotações" },
      { id: "registros-2", label: "Registrar intercorrências" },
      { id: "registros-3", label: "Registrar cuidados realizados" },
      { id: "registros-4", label: "Verificar pendências documentais" },
    ],
  },
  {
    id: "final",
    title: "Final do plantão",
    items: [
      { id: "final-1", label: "Revisar pendências" },
      { id: "final-2", label: "Organizar informações relevantes" },
      { id: "final-3", label: "Preparar passagem de plantão" },
      { id: "final-4", label: "Conferir se registros foram concluídos" },
    ],
  },
];
