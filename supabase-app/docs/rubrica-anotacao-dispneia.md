# Correção assistida por IA — piloto "Desconforto ao respirar à noite"

Exercício `anotacao-dispneia-noite` (anotação de enfermagem, caso totalmente fictício). Versão da rubrica: `2026-11-02.1`.
Código: `supabase/functions/practice-feedback/` (rubrica em `rubric.ts`). Homologação apenas.

**É feedback educativo, não avaliação.** Não gera nota, pontos, conquista nem classificação. Pode errar. Não declara
precisão clínica validada: a rubrica e os testes abaixo ainda precisam de revisão editorial e de teste com o provedor real.

## Fontes (conferidas em 01/11/2026)
- Guia de Recomendações para o Registro de Enfermagem (Res. Cofen 514/2016), seção 7 e 7.1 (itens 1 a 18). Lido no PDF do anexo.
- Res. Cofen 736/2024, arts. 6º a 8º. Lida na página oficial (PDFs anexos não abertos).
- O próprio caso (única fonte de fatos).

## Fatos do caso (o que a IA pode cobrar)
| Id | Essencial | Fato |
|---|---|---|
| F1 | sim | 22h10: relata desconforto ao respirar e dificuldade para dormir |
| F2 | não | 22h10: acordada, orientada, em decúbito dorsal |
| F3 | sim | dor torácica, intensidade 3 (escala 0–10), piora ao tossir |
| F4 | sim | 22h15: PA 128x78 mmHg, FC 88 bpm, FR 22 irpm, SpO2 94% em ar ambiente, Tax 36,8 °C |
| F5 | sim | 22h17: cabeceira elevada a 45°; orientada a respirar lentamente |
| F6 | sim | 22h20: enfermeira responsável comunicada |
| F7 | sim | 22h40: refere melhora do desconforto e adormece |

## Normas de registro (sugestões opcionais quando faltam)
N1 data e hora no início (Guia 7.1, item 1) · N2 assinatura e identificação ao final (item 1) · N3 ordem cronológica e horário de
cada fato (item 11) · N4 separar relato de observação (seção 7, Precisão) · N6 evitar termos de valor (item 16) ·
N7 abreviaturas previstas em literatura (item 17) · N8 anotação sem diagnóstico nem prescrição de enfermagem (Res. 736/2024, art. 6º; item 18).
X1 = informação que o caso não traz.

## Categorias
| Categoria | Tipo | Quando |
|---|---|---|
| Informação ausente | factual | falta um fato **essencial** (F1, F3–F7). Nunca traz citação do aluno. |
| Contradição com o caso | factual | o texto conflita com um fato do caso (horário, valor, cuidado). Exige trecho exato. |
| Informação não fornecida | factual | o texto afirma algo que o caso não traz (sinal, valor, cuidado, medicamento, fala, resposta, horário, diagnóstico). Exige trecho exato. |
| Sugestão de clareza | opcional | omissão de F2 ou das normas N1–N4, termo de valor, abreviatura não padronizada. |

## O que NÃO se cobra
- Cópia do exemplo: formas diferentes que preservam o significado são aceitas (`accept` de cada item na rubrica).
- Detalhes que o caso não informa (o que foi dito à enfermeira, o que ela respondeu).
- Abreviaturas aceitas, que nunca viram apontamento: SSVV, PA, FC, FR, SpO2/SatO2, Tax, mmHg, bpm, irpm, AA, DD, Enf., cab.
- Nenhum julgamento clínico (se o cuidado do caso foi adequado).

## Como o servidor trata a saída da IA (tudo verificado no código, não confiado)
1. O texto do aluno vai só no campo JSON `registro_do_aluno` (string escapada), nunca no prompt do sistema.
2. Saída estruturada validada por esquema (Zod). Recusa, `max_tokens` ou saída inválida = indisponibilidade; nunca resposta inventada.
3. Todo trecho citado é procurado no texto do aluno (ignora caixa, acento e espaço) e devolvido como o texto original; se não existe, o apontamento é descartado.
4. A **evidência** mostrada ao aluno vem da rubrica, não da IA. Só a explicação curta vem da IA (limpa e limitada a 300 caracteres).
5. "Ausente" só para fato essencial; quote forçado a `null`; descartado se o texto traz o fato (pistas de presença) ou se a própria IA registrou acerto nele.
6. Apontamento só de abreviatura aceita é descartado.
7. Regras objetivas (sem IA): horário fora do caso, valores de PA/FC/FR/SpO2/Tax/dor/cabeceira diferentes do caso, e trechos que parecem instrução ao sistema.
8. Incerteza: `certainty` por apontamento (alta/média/baixa, mostrada ao aluno) e `assessable=false` com motivo quando não dá para avaliar.
9. Limites: 20 a 2.000 caracteres; corpo ≤ 12 KB; saída ≤ 6.000 tokens; 3 pedidos/10 min e 15/dia por usuário; 150/dia no total.
10. Logs só com metadados (contagens, tokens, motivo). Nenhuma persistência do texto ou do resultado no servidor.

## Configuração (nenhum segredo no código nem no chat)
A função responde `ai_not_configured` (503) até existir o segredo `ANTHROPIC_API_KEY` **exclusivo do app**.
1. Crie, no console do provedor, uma chave nova só para este app (workspace próprio, com limite de gasto). Não reutilize chave de outro serviço.
2. Pelo painel: Supabase → projeto `pmmxjohixttivxbmdnhp` → Edge Functions → Secrets → adicionar `ANTHROPIC_API_KEY`.
   Ou pela CLI, sem colar no chat: salve `ANTHROPIC_API_KEY=...` em um arquivo `.env` dentro de `C:\Users\usuario\.fslobo-homolog\`
   e rode, na pasta do backend: `npx supabase secrets set --env-file <arquivo> --project-ref pmmxjohixttivxbmdnhp`.
3. Opcionais: `AI_MODEL` (padrão `claude-sonnet-5-5`; o Opus só é usado se você trocar este segredo de propósito) e `AI_EFFORT` (`low`, `medium` ou `high`; padrão `medium`). Não existe fallback automático para outro modelo.
4. Teste com a sua conta no Preview: escrever e clicar em "Corrigir meu registro". Confira o consumo no console do provedor.

## Testes
- `tests/practice-feedback.test.ts` (Deno, 24 testes): rubrica, validação, regras objetivas, HTTP, e o SDK real contra um servidor Anthropic **simulado**.
- `tests/ai-dev-server.ts`: roda o mesmo manipulador com um "modelo" simulado por regras, para o teste de navegador do app.
- Banco real (homologação): `study_ai_acquire`/`study_ai_release` testadas dentro de transação desfeita (nenhum evento gravado).
- **Não testado:** chamada real ao provedor (não há chave exclusiva do app); comportamento do modelo real diante de injeção, de textos ambíguos ou de abreviaturas raras.
