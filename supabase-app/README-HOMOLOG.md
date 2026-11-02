> **Histórico da v2.1.** A visão atual e a fonte oficial do backend estão em [README.md](README.md). Os caminhos abaixo valem a partir de `supabase-app/`; há 8 migrations, não 4.

# FSLOBO Enfermagem App — pacote de homologação do backend (v2.1)

Conteúdo SQL idêntico ao `fslobo-app-backend-proposta-v2.zip` (mesmos SHA-256). O que mudou é
o **empacotamento**: formato da Supabase CLI, trava de destino, testes que rodam nesta pasta e
um ZIP de verdade (os anteriores eram arquivos *tar* com extensão `.zip`).

```
supabase/config.toml              configuração da CLI desta pasta (project_id próprio; confirmação de e-mail ligada)
supabase/migrations/2026103112000{1..4}_*.sql   as 4 migrations, na ordem
supabase-seed-dev/                seed DEMONSTRATIVO — fora de supabase/ de propósito: NUNCA roda sozinho
scripts/check-target.mjs          trava: recusa seguir se a CLI não estiver no projeto esperado
tests/                            suítes local (PGlite) e de concorrência (PostgreSQL real descartável)
docs/                             README técnico e CHANGELOG da v2
```

## Regras de ouro
1. Esta pasta **não é** o repositório da loja. Nunca copie estes arquivos para `supabase/` da loja
   e nunca rode `supabase link` aqui com o ref de outro projeto.
2. Antes de **qualquer** `db push`: `node scripts/check-target.mjs <ref-de-homologacao>` deve imprimir `OK`.
3. `db push` sempre com `--dry-run` primeiro; só aplicar de fato com autorização explícita.
4. Dados 100% fictícios. Nenhum comprador, pedido ou e-mail real.
5. Senhas e tokens: nunca em arquivo, nunca em relatório (use o cofre da CLI / variável de ambiente da sessão).

## Passos previstos (só depois de autorização para cada operação remota)
```
# 1) criar o projeto (remoto, pode gerar custo) — ver README do relatório
# 2) vincular exclusivamente ao projeto novo
npx supabase link --project-ref <REF_HOMOLOG>
node scripts/check-target.mjs <REF_HOMOLOG>
# 3) simulação (não altera nada)
npx supabase db push --dry-run
# 4) aplicar (somente após aprovação do resultado da simulação)
npx supabase db push
# 5) configuração de Auth (painel ou `supabase config push`, após revisar o diff)
```

## Configuração de Auth pretendida (config.toml)
e-mail e senha; **confirmação de e-mail ligada**; senha mínima 10 com maiúscula, minúscula e dígito;
cadastro anônimo desligado; troca de e-mail com dupla confirmação; API REST só no schema `public`
(GraphQL desligado). Pendentes no painel: URLs de redirecionamento, SMTP próprio, CAPTCHA (Turnstile).

## Atenção: e-mail de confirmação na homologação
O SMTP padrão da Supabase só entrega a endereços de membros da organização e tem limite baixo de
envios por hora. Para testar a confirmação com mais de uma conta há duas opções: (a) SMTP próprio
(ex.: Resend) no projeto de homologação, ou (b) usar o e-mail do dono para **uma** conta e criar as
demais contas de teste pela API administrativa já confirmadas. Os testes de RLS e de pontuação
não dependem de e-mail.

## Como rodar os testes locais (opcional)
```
npm i -D @electric-sql/pglite embedded-postgres pg     # só em máquina de desenvolvimento
node tests/run-local.mjs                               # 247 verificações (PGlite)
node tests/run-concurrency.mjs                         # 27 verificações (PostgreSQL real local, várias conexões)
```

---

## Estado após a homologação (v2.3)
- As **6 migrations** de `supabase/migrations/` (a 6ª é a 0006, abaixo) estão aplicadas no projeto de homologação. A 5ª
  (`20261031130001_fix_admin_deletion_and_indexes.sql`) corrige a exclusão de contas de administrador,
  adiciona a trilha de auditoria opaca (`created_by_ref` / `reviewed_by_ref`, sem FK, preenchidas por trigger,
  imutáveis após publicar, sem GRANT) e os índices apontados pelo Performance Advisor.
- Testes: `tests/run-local.mjs` (264), `tests/run-concurrency.mjs` (27, PostgreSQL 17 real local) e
  `tests/run-remote-homolog.mjs` (109, contra o projeto de homologação real via Auth + PostgREST; exige
  `FSL_EXPECTED_REF=<ref>`, usa dados @example.test, apaga os usuários de teste e arquiva as questões de teste).
- A senha do banco e as chaves NÃO estão neste pacote.
- Não incluir `supabase/.temp/` em nenhum ZIP (guarda o vínculo local).

## Política de senha (PROPOSTA — NÃO APLICADA)
`supabase-proposed/config-password-policy/supabase/config.toml` declara só: senha mínima de 10 caracteres,
com maiúscula, minúscula e número, e confirmação de e-mail ligada. O `config push` só altera o que o arquivo declara.
Resultado de `supabase config diff --project-ref <ref>` (somente leitura) contra o projeto de homologação:

| Propriedade | Remoto hoje | Depois do push |
|---|---|---|
| `auth.minimum_password_length` | 6 | **10** |
| `auth.password_requirements` | (vazio) | **lower_upper_letters_digits** |
| `auth.email.enable_confirmations` | true | true (sem mudança) |

As outras 9 diferenças que o diff lista são "só remoto" (não declaradas), portanto o push **não as altera**
(ex.: `site_url` = http://localhost:3000, redirecionamentos, MFA, limites do pooler).
Para aplicar (interativo, mostra o diff e pede confirmação antes de gravar):
```
cd supabase-proposed/config-password-policy
npx supabase config push --project-ref <ref-de-homologacao>
```
**Pendência antes de ligar a interface:** o `site_url` remoto ainda é http://localhost:3000, então os links de
confirmação e de redefinição de senha apontam para localhost. Defina `site_url` e as URLs de redirecionamento do
Preview/domínio do app quando houver endereço.

---

## Migration 0006 (APLICADA em 31/10/2026, só na homologação): "treino completo" e escopo da revisão
`supabase/migrations/20261031140001_complete_attempts_and_review_scope.sql` — só `CREATE OR REPLACE` de 4 funções
(`study_start_attempt`, `study_complete_attempt`, `study_my_progress`, `study_list_my_review_items`) e uma função interna nova
(`study__answered_count`, sem EXECUTE para anon/authenticated). Nenhuma tabela, índice ou permissão de tabela mudou; as 5 migrations
anteriores não foram reescritas (hashes conferidos antes de aplicar). Antes do push: `node scripts/check-target.mjs <ref> 6`.

1. **Treino completo:** só conclui quem respondeu TODAS as questões (`attempt_incomplete` caso contrário). `attempts_completed` e
   `week_completed` contam só concluídos com todas respondidas (conclusão parcial antiga deixa de contar, sem ser apagada).
   Parcial pode ser retomada, abandonada ou expirar; não pontua e não preenche a meta semanal.
2. **Revisão:** elegível = erro pendente de questão PUBLICADA em assunto ATIVO — mesmo critério para nova revisão, `pending_review`
   e lista de revisão. `study_review_items` não é tocada (histórico preservado; reativar/republicar volta a ser elegível).
   Revisão já aberta continua de onde parou.

Testes: `tests/run-0006.mjs` (51 verificações; `FSL_WITHOUT_0006=1` roda o controle negativo: 17 falham sem a migration).
Expectativas antigas atualizadas na promoção: `run-local.mjs` (seção 5/6: parcial é recusada e encerrada sem pontos; totais 50/60/70 recalculados) e
`run-concurrency.mjs` (C: as duas tentativas respondem tudo; E: `attempt_incomplete` é desfecho válido da corrida).

---

## Migration 0007 (APLICADA em 01/11/2026, só na homologação): administração do conteúdo, versionamento e auditoria
`supabase/migrations/20261101120001_admin_rpcs_and_versioning.sql` (inclui a validação do limite de 12.000 bytes das referências técnicas). Contrato completo: `supabase-proposed/docs/0007-admin-contract.md`; exemplo de importação: `supabase-proposed/examples/import-example.json`.
- **Muda:** `study_questions` ganha `external_key` e `version` (preenchidas só para as 25 questões do lote 01; `updated_at` preservado) e duas chaves únicas; o guard trava as duas colunas após publicar;
  tabelas novas `study_question_meta` (referências técnicas, origem, notas) e `study_admin_audit` (append-only), ambas sem acesso para anon/authenticated; 13 RPCs `study_admin_*` (11 novas + a publicação antiga, que passa a delegar) e 6 funções internas.
- **Autorização no servidor:** administrador ativo em toda RPC; escrita exige JWT `aal2` (MFA). Nenhuma RPC concede papel de administrador.
- **Não muda:** dados existentes, tabelas e RPCs de aluno, GRANT/POLICY existentes (comparados antes/depois nos testes). Não reimporta o lote 01.
- **Testes:** `tests/run-0007.mjs` (212 verificações; PGlite e PostgreSQL 17.11). Com `FSL_INCLUDE_PROPOSED=1`, `run-local` (303) e `run-concurrency` (27) também passam.
- **Promoção feita:** `check-target ... 7` e dry-run (só a 0007) antes do push; a partir de agora `check-target <ref> 7`; a suíte remota (`run-remote-homolog.mjs`) usa tokens aal1 e precisará de MFA/ajuste para o caminho de publicação.

---

## SMTP do Resend na homologação (APLICADO)
Causa do erro de recuperação: `POST /recover` → HTTP 429 `over_email_send_rate_limit` (cota do SMTP padrão da Supabase).
- Aplicado só em `auth.email.smtp.*`: host smtp.resend.com, porta 465, usuário resend, remetente FSLOBO Enfermagem App <app@fsloboenfermagem.com.br>. A senha é a chave exclusiva do app, enviada como segredo e nunca gravada em arquivo do repositório.
- Chave Resend `fslobo-enfermagem-app-homolog-smtp`: permissão Sending access, restrita ao domínio fsloboenfermagem.com.br. Guardada em `~/.fslobo-homolog/resend-app-key` (acesso só do usuário). As 4 chaves existentes não foram tocadas.
- Verificação sem envio: `scripts/check-smtp-handshake.mjs` (AUTH 235 e MAIL FROM 250, sem DATA). `config diff`: nenhum campo declarado diverge; os 7 campos não declarados originais intactos; confirmação de e-mail obrigatória, política de senha e redirecionamentos intactos.
- Limite de e-mails do Auth: segue `email_sent = 2` por hora (protege a cota diária compartilhada do Resend, plano Free: 100/dia e 3000/mês). Alterar só com aprovação.
