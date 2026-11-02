// Gera lote-01.editorial.json: resultado da revisão editorial, SEPARANDO referência técnica de origem da questão.
// Não acessa banco. Não registra aprovação de ninguém. Uso: node make-editorial.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(fs.readFileSync(path.join(here, "lote-01.manifest.json"), "utf8"));

const READY_ADJUST = { 3: "ajuste de redação (exercício de cálculo)", 21: "ajuste da explicação (2 frases sem respaldo na fonte)" };
const HOLD = { 24: "referência encontrada é só material didático institucional, sem fonte primária; o enunciado cita 'comunicação aberta', que a fonte não cobre" };

const verifiedRef = {
  21: { status: "verificada nesta revisão", detail: "Portaria GM/MS nº 11.211, de 13/05/2026 (cópia Saúde Legis; não substitui o DOU). Anexo I: item 55 (Sarampo/Rubéola) marcado em MS, SES e SMS (imediata, até 24 h); itens 30 (hanseníase), 32 (hepatites virais), 56 (sífilis), 64 (tuberculose) marcados só em 'Semanal'. Conferido pela estrutura das células do HTML.", not_supported_by_source: ["a suspeita de sarampo já requer notificação", "estados e municípios podem estabelecer exigências adicionais"] },
  24: { status: "fonte localizada, fraca", candidates: [
    { title: "Liderança Transformacional (slides, serviço de educação em enfermagem do HC-UFTM/Ebserh, 2017)", url: "https://www.gov.br/hubrasil/pt-br/hospitais-universitarios/regiao-sudeste/hc-uftm/painel/gas/denf/servico-de-educacao-em-enfermagem/aulas-e-material-didatico/educacao-continuada/educacao-continuada-2017-1/lideran-oa-transformacional-2017.pdf", supports: "democrática = líder estimula a participação do grupo, decisões tomadas após debate e em conjunto", limits: "material didático institucional, sem revisão por pares e sem citar fonte primária; não menciona comunicação aberta" },
    { title: "Galvão et al. Liderança situacional: um modelo para aplicação na enfermagem brasileira. Rev Esc Enferm USP 1997;31(2). DOI 10.1590/S0080-62341997000200005", url: "https://www.scielo.br/j/reeusp/a/R4CsyT3mbzMg7sRv7Bdsmgr/?lang=pt", supports: "apenas NOMEIA os estilos autocrático, democrático e liberal", limits: "não define o estilo democrático: NÃO serve como referência da definição" } ] },
};

const out = {
  batch: m.batch, generated_by: "make-editorial.mjs", note: "Resultado de revisão editorial assistida. NÃO é revisão clínica nem aprovação: ninguém aprovou nada ainda.",
  rule_separation: "technical_references = fontes do CONTEÚDO (não provam de onde a questão veio). question_origin = proveniência da questão; está NÃO comprovada e nunca deve ser exibida ao aluno nem atribuída a banca.",
  questions: m.questions.map((q) => {
    const n = q.number;
    const group = HOLD[n] ? "manter_em_rascunho" : READY_ADJUST[n] ? "pronta_apos_ajuste" : "pronta_para_sua_aprovacao";
    return {
      number: n, key: q.key, subject_slug: q.subject_slug, group,
      pending: HOLD[n] || READY_ADJUST[n] || null,
      technical_references: {
        listed_in_batch: q.references,
        verification: verifiedRef[n] || { status: n === 3 || n === 24 ? "sem referência no lote (cálculo com dados do enunciado)" : "indicada no lote; não aberta nesta revisão" },
      },
      question_origin: { status: "não comprovada", received_label_not_for_students: q.received_meta_not_for_students, never_attribute_to_exam_board: true },
      clinical_review: { done: false, by: null, at: null },
    };
  }),
};
fs.writeFileSync(path.join(here, "lote-01.editorial.json"), JSON.stringify(out, null, 2) + "\n");
const c = {}; out.questions.forEach((q) => { (c[q.group] ||= []).push(q.number); });
console.log(JSON.stringify(c));
