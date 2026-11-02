# Backend do app FSLOBO Enfermagem — fonte oficial

**Esta pasta (`supabase-app/`) é a única fonte oficial do backend do app** (banco, funções e testes).
Não existe outra cópia para editar. O `supabase/` da raiz deste repositório é da **loja**: nunca ponha
arquivos do app lá e nunca rode `supabase db push` na raiz esperando atingir o app.

Projeto remoto de homologação: `fslobo-enfermagem-app-homolog` (ref `pmmxjohixttivxbmdnhp`), separado da loja.

## Estrutura
```
supabase-app/
  supabase/config.toml                  config da CLI (project_id próprio)
  supabase/migrations/                  9 migrations (0001-0008 aplicadas na homologação — não editar; 0009 = Prática na conta)
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
9. `20261103120001_practice_progress` (persistência da Prática na conta: tabelas sem GRANT, 3 RPCs por `auth.uid()`, conflito por revisão)

Migration já aplicada **nunca** é editada: correções entram como migration nova.

## Regras de ouro
1. Rode a CLI **dentro de `supabase-app/`** (é onde está o `supabase/config.toml` do app).
2. Depois de clonar: `npx supabase link --project-ref pmmxjohixttivxbmdnhp` (o estado fica em `supabase/.temp/`, ignorado pelo git).
3. Antes de qualquer `db push` ou `functions deploy`: `node scripts/check-target.mjs pmmxjohixttivxbmdnhp 9` deve imprimir `OK`.
4. `db push` sempre com `--dry-run` primeiro; aplicar e publicar só com autorização explícita.
5. Segredos (senha do banco, chaves, `ANTHROPIC_API_KEY`) ficam fora do repositório, no cofre da CLI ou nos Secrets do Supabase.

## Testes (locais; nunca tocam o banco remoto)
Pré-requisitos: **Node 20+** e **npm** para as suítes SQL; **Deno 2.x** só para o teste da função. Tudo roda a partir de `supabase-app/`.
```
npm ci                      # instala as dependências FIXADAS em package-lock.json (pglite, embedded-postgres, pg) dentro de supabase-app/node_modules
npm run test:sql            # 5 suítes em PGlite (banco em memória): run-local, run-0006, run-0007, run-0009 (Prática na conta) e importador do lote (lote artificial)
npm run test:concurrency    # corridas em PostgreSQL real DESCARTÁVEL (embedded-postgres: baixa o binário do npm, sobe em porta local e apaga no fim)
npm run test:function       # função practice-feedback (Deno); lê o caso do app em ../src/app-enfermagem/data/practice.ts
npm test                    # as três acima
```
- Não há conexão com o Supabase remoto, nem leitura de segredos. `tests/run-remote-homolog.mjs` é um script **separado, remoto**, que só deve ser rodado de propósito (não faz parte de `npm test`).
- Os testes de importação usam um **lote ARTIFICIAL** (`tests/fixtures/artificial-batch.mjs`): 25 questões genéricas geradas em pasta temporária pelo mesmo `build.mjs` do lote real. Nenhum arquivo editorial é necessário.
- Migrations: as suítes aplicam as 9 migrations de `supabase/migrations` num banco vazio, com o stub de `auth` em `tests/stubs/`.

## Correção por IA: pausada
A função `practice-feedback` está implantada na homologação, mas sem chave (`ANTHROPIC_API_KEY`): responde "não configurada". O app não chama a função.
O modelo padrão no código é `claude-sonnet-5-5`; a função implantada ainda tem o padrão anterior (republicar exige autorização).
Detalhes e rubrica: `docs/rubrica-anotacao-dispneia.md`.

## Conteúdo (questões)
Os dados editoriais REAIS do lote 01 (`content-batches/lote-01/lote-01.*.json` e `*.sql`) são rascunho, **sem revisão clínica e sem confirmação de origem/direitos**, e o
repositório é público. Por isso **não são versionados aqui** (estão no `.gitignore`; ficam só no computador do responsável). Os testes não dependem deles.
Para importar o lote real na homologação (`apply.mjs`) é preciso gerá-lo localmente com `build.mjs <markdown-editorial>` e ter autorização explícita.
