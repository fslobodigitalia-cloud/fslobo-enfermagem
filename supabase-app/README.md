# Backend do app FSLOBO Enfermagem — fonte oficial

**Esta pasta (`supabase-app/`) é a única fonte oficial do backend do app** (banco, funções e testes).
Não existe outra cópia para editar. O `supabase/` da raiz deste repositório é da **loja**: nunca ponha
arquivos do app lá e nunca rode `supabase db push` na raiz esperando atingir o app.

Projeto remoto de homologação: `fslobo-enfermagem-app-homolog` (ref `pmmxjohixttivxbmdnhp`), separado da loja.

## Estrutura
```
supabase-app/
  supabase/config.toml                  config da CLI (project_id próprio)
  supabase/migrations/                  8 migrations, APLICADAS na homologação — não editar
  supabase/functions/practice-feedback/ Edge Function da correção por IA (PAUSADA, ver abaixo)
  tests/                                suítes locais (PGlite / PostgreSQL descartável) e testes Deno da função
  scripts/                              check-target.mjs (trava de destino), check-smtp-handshake.mjs
  content-batches/lote-01/              scripts de importação do lote 01 (dados editoriais: ver "Conteúdo")
  supabase-proposed/                    propostas de config (Auth/SMTP) e contrato do admin; só aplicar com autorização
  supabase-seed-dev/                    seed DEMONSTRATIVO, nunca roda sozinho
  docs/                                 README técnico, CHANGELOG da v2 e rubrica da correção por IA
  README-HOMOLOG.md                     histórico do empacotamento v2.1
```

## Migrations (ordem)
1. `20261031120001_study_foundation` · 2. `…120002_study_content` · 3. `…120003_study_attempts` · 4. `…120004_study_rpcs`
5. `20261031130001_fix_admin_deletion_and_indexes` · 6. `20261031140001_complete_attempts_and_review_scope`
7. `20261101120001_admin_rpcs_and_versioning` · 8. `20261102120001_practice_ai_feedback_usage`

Migration já aplicada **nunca** é editada: correções entram como migration nova.

## Regras de ouro
1. Rode a CLI **dentro de `supabase-app/`** (é onde está o `supabase/config.toml` do app).
2. Depois de clonar: `npx supabase link --project-ref pmmxjohixttivxbmdnhp` (o estado fica em `supabase/.temp/`, ignorado pelo git).
3. Antes de qualquer `db push` ou `functions deploy`: `node scripts/check-target.mjs pmmxjohixttivxbmdnhp 8` deve imprimir `OK`.
4. `db push` sempre com `--dry-run` primeiro; aplicar e publicar só com autorização explícita.
5. Segredos (senha do banco, chaves, `ANTHROPIC_API_KEY`) ficam fora do repositório, no cofre da CLI ou nos Secrets do Supabase.

## Testes
```
# função practice-feedback (Deno; lê o caso do app em ../src/app-enfermagem/data/practice.ts)
deno test --config supabase/functions/practice-feedback/deno.json -A tests/practice-feedback.test.ts
# SQL local: tests/run-local.mjs, run-0006.mjs, run-0007.mjs, run-concurrency.mjs (dependências `pg` e `@electric-sql/pglite`, instaladas à parte)
```

## Correção por IA: pausada
A função `practice-feedback` está implantada na homologação, mas sem chave (`ANTHROPIC_API_KEY`): responde "não configurada". O app não chama a função.
O modelo padrão no código é `claude-sonnet-5-5`; a função implantada ainda tem o padrão anterior (republicar exige autorização).
Detalhes e rubrica: `docs/rubrica-anotacao-dispneia.md`.

## Conteúdo (questões)
Os dados editoriais do lote 01 (`content-batches/lote-01/*.json` e `*.sql`) estão marcados como rascunho, **sem revisão clínica e sem
confirmação de origem/direitos**. Por isso não são enviados a um repositório público; ficam no histórico local até a decisão do responsável.
Os testes `run-0007.mjs` e `content-batches/lote-01/test-local.mjs` precisam desses arquivos presentes.
