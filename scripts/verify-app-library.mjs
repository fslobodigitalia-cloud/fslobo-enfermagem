// Verifica a lógica de busca da biblioteca "Modelos de registros" (funções puras de src/app-enfermagem/library/search.ts).
// Usa uma biblioteca ARTIFICIAL mínima; não lê conteúdo nenhum do app. Roda com Node 22.18+/24 (remoção de tipos nativa):
//   node scripts/verify-app-library.mjs
import { fold, expandQuery, searchModels } from "../src/app-enfermagem/library/search.ts";

let pass = 0; const fails = [];
const ok = (c, n, x) => { if (c) pass++; else { fails.push(n); console.log("FAIL", n, x ?? ""); } };

const mk = (slug, kind, category, title, summary, keywords, body = []) => ({
  slug, kind, category, title, summary, keywords, context: body, example: [], exampleNote: "", adapt: [], guidance: [], sources: [], reviewedAt: null, demo: true,
});
const lib = {
  categories: [{ id: "resp", label: "Queixa respiratória" }, { id: "ferida", label: "Feridas e curativos" }, { id: "pos", label: "Pós-operatório e metas" }],
  synonyms: [
    ["falta de ar", "dispneia", "desconforto ao respirar", "dificuldade para respirar"],
    ["curativo", "curativo úmido", "troca de curativo"],
    ["pós-operatório", "pós-cirúrgico"],
    ["sinais vitais", "SSVV"],
  ],
  models: [
    mk("a", "anotacao", "resp", "Desconforto ao respirar à noite", "Plantão noturno: sinais vitais e comunicação.", ["queixa respiratória", "SpO2"], ["Cabeceira elevada"]),
    mk("b", "anotacao", "ferida", "Curativo úmido no pós-operatório", "Banho no leito: troca do curativo.", ["incisão"], ["Mancha úmida"]),
    mk("c", "evolucao", "pos", "Dor e mobilização em 3 dias", "Evolução comparando os dias e as metas.", ["metas", "mobilização"], ["Caminhada de 30 m"]),
  ],
};
const S = (q, kind = "todos", category = "todas") => searchModels(lib, { q, kind, category });
const slugs = (r) => r.hits.map((h) => h.model.slug).join();

// normalização
ok(fold("Pós-Operatório  ÚMIDO!") === "pos operatorio umido", "fold: caixa, acento, hífen e pontuação");
ok(fold("") === "" && fold("   ") === "", "fold: vazio");
// sem busca = tudo, na ordem do acervo
ok(slugs(S("")) === "a,b,c" && !S("").hasQuery, "sem busca lista tudo na ordem do acervo");
// maiúsculas e acentos
ok(slugs(S("CURATIVO")) === "b" && slugs(S("curativo")) === "b", "maiúsculas não importam");
// "pós-operatório" está no título do modelo b (peso 5) e na CATEGORIA do modelo c (peso 3): os dois aparecem, o do título primeiro
ok(slugs(S("pos operatorio")) === "b,c" && slugs(S("PÓS-OPERATÓRIO")) === "b,c" && slugs(S("pos-operatorio")) === "b,c", "acento, caixa e hífen não importam (título antes de categoria)");
ok(slugs(S("mobilizacao")) === "c" && slugs(S("mobilização")) === "c", "mobilizacao = mobilização");
// sinônimos
ok(slugs(S("falta de ar")) === "a", "sinônimo: 'falta de ar' acha 'Desconforto ao respirar'");
ok(slugs(S("dispneia")) === "a" && slugs(S("DISPNEIA")) === "a", "sinônimo: 'dispneia' acha o mesmo");
ok(slugs(S("dificuldade para respirar")) === "a", "sinônimo em frase");
ok(S("falta de ar").alsoSearched.includes("dispneia") && S("dispneia").alsoSearched.includes("falta de ar"), "informa os sinônimos usados na busca");
ok(slugs(S("ssvv")) === "a" && slugs(S("sinais vitais")) === "a", "SSVV = sinais vitais");
ok(slugs(S("troca de curativo")) === "b", "frase cadastrada inteira");
// várias palavras: todas precisam aparecer (E)
ok(slugs(S("dispneia noite")) === "a", "duas palavras: sinônimo + palavra do título");
ok(slugs(S("dispneia curativo")) === "", "duas palavras de modelos diferentes não casam (E, não OU)");
ok(slugs(S("mancha umida")) === "b", "palavra do corpo do texto");
// início de palavra (não no meio)
ok(slugs(S("resp")) === "a", "prefixo: 'resp' acha 'respirar/respiratória'");
ok(slugs(S("ar")) === "", "'ar' sozinho não acha 'cabeceira' etc. (só início de palavra)");
// palavras vazias e muito curtas
ok(slugs(S("de da do")) === "a,b,c" || S("de da do").hits.length === 3, "só palavras vazias = sem filtro de texto");
ok(slugs(S("curativo de")) === "b", "palavra vazia no meio é ignorada");
// filtros
ok(slugs(S("", "anotacao")) === "a,b" && slugs(S("", "evolucao")) === "c", "filtro por tipo");
ok(slugs(S("", "todos", "ferida")) === "b" && slugs(S("", "todos", "pos")) === "c", "filtro por categoria");
ok(slugs(S("", "evolucao", "ferida")) === "", "filtros que não se cruzam = vazio");
ok(slugs(S("curativo", "anotacao", "ferida")) === "b" && slugs(S("curativo", "evolucao")) === "", "busca + filtros");
// vazio
ok(S("zzzxyz").hits.length === 0 && S("zzzxyz").hasQuery, "busca sem resultado");
// ordem por relevância (título > resumo)
const lib2 = { ...lib, models: [mk("x", "anotacao", "resp", "Outro assunto", "fala de curativo no resumo", []), mk("y", "anotacao", "ferida", "Curativo no título", "texto", [])] };
ok(searchModels(lib2, { q: "curativo", kind: "todos", category: "todas" }).hits.map((h) => h.model.slug).join() === "y,x", "relevância: título vem antes de resumo");
// robustez
ok(S("<script>alert(1)</script>").hits.length === 0 && S("%$#@").hits.length === 3, "entrada estranha não quebra (símbolos viram nada)");
ok(S("x".repeat(500)).hits.length === 0, "entrada longa não quebra");
const e = expandQuery("falta de ar urgente", lib.synonyms);
ok(e.terms.length === 2 && e.terms[0].includes("dispneia") && e.terms[1][0] === "urgente", "expansão: frase cadastrada + palavra solta");

console.log(`${pass} verificações ok, ${fails.length} falhas`);
process.exit(fails.length ? 1 : 0);
