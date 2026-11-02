# Migration 0007 — contrato das RPCs administrativas (PROPOSTA, não aplicada)

Todas as RPCs vivem no banco do **app** (nunca no da loja), são `SECURITY DEFINER` com `search_path` fixo e **não têm acesso para `anon`**.
O CRM chama só estas RPCs com o JWT da sessão do app; as tabelas continuam sem nenhum acesso para `anon`/`authenticated`.

## Autorização (validada no servidor, em toda chamada)
1. `forbidden` (42501): sem sessão, ou conta que não está em `study_admins` com `active = true`.
2. `mfa_required` (42501): escrita sem JWT com claim `aal = "aal2"` (MFA/TOTP verificado). **Leitura** exige só administrador.
3. Não existe RPC que conceda, altere ou retire papel de administrador. A concessão é inserção manual em `study_admins` (service_role/SQL).
4. A conta do CRM da loja **não** vale aqui: os usuários e IDs do Auth do app são outros.

## Erros (mensagem = código; detalhe em `detail`)
`forbidden`, `mfa_required`, `not_found` (P0002), `invalid_payload` (detalhe: campo/mensagem; em lista JSON quando são vários), `invalid_filter`,
`invalid_status`, `not_editable`, `stale_write`, `key_taken`, `slug_taken`, `slug_immutable`, `not_latest_version`, `no_external_key`,
`draft_already_open`, `patient_data_confirmation_required`, `options_incomplete`, `answer_key_missing`, `explanation_missing`,
`invalid_batch`, `empty_batch`, `batch_too_large`, `payload_too_large`.

## RPCs
| RPC | Escrita/MFA | Resumo |
|---|---|---|
| `study_admin_list_subjects()` | não | Todos os assuntos (inclui inativos) com contagens por status |
| `study_admin_save_subject(id, slug, name, description, position, active)` | **sim** | `id` nulo cria (nasce **inativo** salvo `active=true`); com `id` edita (slug imutável) |
| `study_admin_list_questions(status[], subject_id, search, limit, offset, latest_only)` | não | `{total, limit, offset, items[]}`; limite máx. 200; busca literal em enunciado e chave |
| `study_admin_get_question(id)` | não | Questão completa: alternativas, **gabarito**, explicação, metadados, auditoria, versões |
| `study_admin_save_draft_question(payload)` | **sim** | Cria (sem `id`) ou edita rascunho. Troca atômica de alternativas/gabarito/explicação. `expected_updated_at` evita edição concorrente |
| `study_admin_save_question_meta(id, meta)` | **sim** | Corrige referências/origem/notas em qualquer status (não faz parte do que o aluno vê) |
| `study_admin_delete_draft(id)` | **sim** | Só `draft`; apaga questão e filhos |
| `study_admin_import_questions(batch, dry_run=true)` | só se `dry_run=false` | Simula ou grava, tudo ou nada, **sempre como rascunho** |
| `study_admin_publish_questions(ids[], confirm)` | **sim** | 1–100 questões, tudo ou nada; `reviewed_by` = quem chamou; arquiva a versão anterior substituída |
| `study_admin_publish_question(id, confirm)` | **sim** | Já existia; agora delega à anterior (assinatura e GRANTs preservados) |
| `study_admin_archive_question(id, reason)` | **sim** | `published → archived`, motivo de 3 a 300 caracteres |
| `study_admin_create_new_version(id)` | **sim** | Cria o rascunho da próxima versão (copia conteúdo e meta); a versão publicada nunca muda |
| `study_admin_list_audit(question_id?, limit)` | não | Trilha append-only (máx. 200) |

## Payload do rascunho (`study_admin_save_draft_question`)
```json
{ "id": "uuid (omitir para criar)", "expected_updated_at": "ts (opcional, na edição)",
  "subject_id": "uuid" , "subject_slug": "alternativa ao subject_id",
  "external_key": "opcional ao criar (gerada se faltar); imutável depois",
  "stem": "10–2000", "difficulty": 1, "options": { "A": "1–600", "B": "", "C": "", "D": "", "E": "" },
  "correct": "A..E", "explanation": "10–4000",
  "meta": { "technical_references": [{ "title": "1–200", "url": "http(s)://…", "note": "≤500", "verified": false }],
            "origin_status": "not_proven|author_original|licensed|public_domain", "origin_note": "≤500", "editorial_note": "≤2000" } }
```
As referências técnicas têm limite de **20 itens e 12.000 bytes** (`octet_length` do JSONB em texto, a mesma conta da constraint da tabela; bytes, não caracteres): passar disso é `invalid`/`invalid_payload` no campo `meta.technical_references`, antes de gravar.
Campo desconhecido → `invalid_payload`. `origin_status` **não aceita** nome de banca: origem é `not_proven` até o responsável comprovar.

## Contrato de importação (`fslobo.study-import/1`)
Exemplo pequeno: `supabase-proposed/examples/import-example.json`.
```json
{ "format": "fslobo.study-import/1", "batch_id": "lote-02",
  "questions": [ { "external_key": "…", "version": 1, "subject_slug": "…", "stem": "…", "difficulty": 2,
                   "options": { "A": "…", "B": "…", "C": "…", "D": "…", "E": "…" }, "correct": "C",
                   "explanation": "…", "meta": { … } } ] }
```
- Limites: até 200 questões e 2 MB por lote; `batch_id` 2–60 caracteres; `external_key` obrigatória (3–64: letras, números, `.` `-` `_`).
- Opcionais: `version` (padrão 1), `difficulty` (padrão 2), `meta`. O assunto **precisa existir** (importar não cria assuntos).
- Resultado **por item**: `new` | `equal` | `divergent` | `invalid`, mais `problems[]` (campo e mensagem), `diffs[]` (campos que diferem), `warnings[]` (ex.: `duplicate_stem`).
- `equal`: a chave+versão já existe com **todo** o conteúdo igual (assunto, enunciado, dificuldade, 5 alternativas, gabarito, explicação, referências, origem, notas) — em qualquer status.
- `divergent`: a chave+versão existe com conteúdo diferente. **Nunca sobrescreve**: para corrigir, edite o rascunho ou use `version` maior.
- `version > 1` exige a versão anterior no banco e nenhum rascunho aberto para a chave; a nova linha aponta `supersedes_id`.
- `dry_run = true` (padrão): nada é gravado, nem auditoria. `dry_run = false`: só grava se `invalid = 0` e `divergent = 0` (senão `applied:false`, sem gravar nada);
  grava tudo ou nada, como `draft`, `no_real_patient_data_confirmed = false`, sem revisor, com `created_by` = quem importou.
- Resposta: `{ format, batch_id, dry_run, applied, can_apply, counts:{total,new,equal,divergent,invalid}, items:[…] }`.

## Versões
`external_key` identifica a questão ao longo do tempo; `(external_key, version)` é único e há no máximo um rascunho aberto por chave.
Corrigir questão publicada = `study_admin_create_new_version` → editar o rascunho → publicar. Ao publicar a versão N+1, a N é arquivada na mesma
transação. `external_key` e `version` ficam imutáveis depois de publicar. As 25 questões do lote 01 recebem `external_key` (FSLOBO-L01-Qnn), versão 1.
**Limitação conhecida:** revisões pendentes de alunos apontam para o ID da versão antiga (arquivada) e deixam de ser elegíveis; não são migradas para a nova versão nesta etapa.
