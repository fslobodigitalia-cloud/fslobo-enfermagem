# Lote 01 — 25 questões (RASCUNHO, só homologação) — v2

Não é migration. Nada aqui é publicado nem aplicado até aprovação explícita.

| Arquivo | Função |
|---|---|
| `build.mjs` | Lê o Markdown editorial, valida limites do esquema e gera manifesto + os dois SQL (não acessa banco) |
| `lote-01.manifest.json` | Chave estável por questão (`FSLOBO-L01-Qnn`), hash, assunto, referências, notas editoriais, pendências |
| `lote-01.import.sql` | Importação em 1 transação; compara o banco com o conteúdo integral esperado ANTES do COMMIT |
| `lote-01.validate.sql` | Conferência somente leitura, com o mesmo conteúdo integral (não confia no hash) |
| `guards.mjs` | Travas de conexão (host, usuário, porta, banco, CA/TLS); funções puras |
| `apply.mjs` | Executor (`--validate-only` ou `--confirm`, ambos com `--ca`) |
| `test-local.mjs` | Teste em banco descartável (PGlite / PostgreSQL 17): 67 verificações |

## O que o importador garante
- Antes do COMMIT confere **exatamente** as chaves Q01–Q25 (sem faltante, extra ou duplicada) e, por chave: enunciado, 5 alternativas,
  gabarito, explicação, assunto, dificuldade, status `draft`, metadados (`source_note`) e campos de revisão/publicação/autoria vazios.
  Confere também nome e descrição dos 11 assuntos.
- Chave existente com conteúdo diferente (ou chave faltante/extra/duplicada) → exceção `lote 01 ABORTADO antes do COMMIT ... -> Qnn [campo]`,
  transação desfeita, **nada é sobrescrito**. O `apply.mjs` ainda dá `ROLLBACK` explícito e sai com código 2.
- Com tudo igual, repetir não insere nada. Assuntos novos entram inativos. Nenhuma permissão ou esquema é alterado.

## Execução (somente após aprovação)
1. Baixe a CA pública do banco (Supabase: Database › Settings › SSL Configuration › Download certificate) e guarde fora do repositório.
2. `node apply.mjs --validate-only --ca <ca.crt>` (transação somente leitura) e depois `node apply.mjs --confirm --ca <ca.crt>`.
3. O `apply.mjs` recusa rodar se: a CLI não estiver vinculada a `pmmxjohixttivxbmdnhp`; o host não for `aws-1-sa-east-1.pooler.supabase.com`;
   o usuário não for `postgres.pmmxjohixttivxbmdnhp`; faltar a CA (TLS sempre com `rejectUnauthorized: true`); o remoto não tiver 6 migrations.

Previsto: 11 assuntos (inativos), 25 questões `draft`, 125 alternativas, 25 gabaritos, 25 explicações.
Referências e rótulos de "estilo de banca" ficam só no manifesto. Publicação é etapa separada (revisor, atestado de ausência de paciente real, ativar assuntos).
