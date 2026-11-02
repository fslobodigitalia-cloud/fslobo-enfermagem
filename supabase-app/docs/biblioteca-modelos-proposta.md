# Biblioteca "Modelos de registros" — proposta de backend (NÃO aplicada)

**Status: proposta para a etapa seguinte. Nenhuma migration foi criada e o banco remoto não foi alterado.** Hoje a biblioteca usa 3 modelos
DEMONSTRATIVOS empacotados no app (`src/app-enfermagem/library/demoModels.ts`), reaproveitados dos exercícios fictícios da Prática.

## Regra de conteúdo
Os textos dos e-books **não entram no repositório** (público). O conteúdo real será carregado **pelo backend**, por importação administrativa
(mesmo padrão do lote de questões: RPC `SECURITY DEFINER`, exige administrador ativo e MFA, simulação antes de aplicar). Arquivos de origem
ficam fora do git (`.gitignore` bloqueia `content-private/`, `*.epub`, `*.mobi`).

## Forma dos dados (espelha `library/types.ts`)
| Campo do app | Coluna proposta | Observação |
|---|---|---|
| `slug` | `slug text unique` | endereço do modelo |
| `kind` | `kind text check in ('anotacao','evolucao')` | |
| `category` | `category_id` → `study_record_categories(id, label, position)` | |
| `title`, `summary` | `text` com limites | |
| `keywords` | `text[]` | só ajudam a achar |
| `context`, `example`, `adapt`, `guidance` | `text[]` | `**trecho**` = negrito semântico (o app renderiza com `<strong>`, nunca HTML) |
| `sources` | `jsonb` (título, url, detalhe, data de conferência) | validado no servidor |
| `reviewedAt` | `reviewed_at date null` + `reviewed_by` | `null` = não revisado: a tela diz "ainda não revisado" |
| `demo` | `is_demo boolean` | selo "Demonstrativo" |
| sinônimos | `study_record_synonyms(group_id, term)` | grupos de termos equivalentes |

Versionamento como em `study_questions` (`external_key` + `version`, só a última publicada aparece). Estado: `draft` → `in_review` → `published`.
Só modelos **publicados e revisados** chegam ao aluno.

## Segurança proposta
- Tabelas sem GRANT; leitura só por RPC `study_library_list()` / `study_library_get(slug)` (`authenticated`, `auth.uid()` obrigatório), devolvendo apenas `published`.
- Escrita só por RPCs administrativas (`study_admin_*`), com MFA aal2 e trilha de auditoria (como na 0007).
- Sem texto do aluno nem dados de pacientes nesta biblioteca: é conteúdo editorial.
- Favoritos (etapa seguinte): tabela própria por usuário, mesmo padrão da 0009 (sem GRANT, RPCs por `auth.uid()`).

## Busca no servidor (quando o acervo crescer)
A busca atual (cliente) normaliza caixa e acentos e expande sinônimos. Com acervo grande, mover para o servidor com `unaccent` + índice
de texto (`tsvector` em português) e a mesma tabela de sinônimos, mantendo a mesma API da tela (`LibrarySource.load()`).

## Como o app já está preparado
`library/source.ts` define `LibrarySource { initial?, load() }`. Hoje existe só a origem empacotada (demonstrativa). A origem remota
terá a mesma forma e não exige mudar as telas (carregando / erro / pronto já são tratados).
