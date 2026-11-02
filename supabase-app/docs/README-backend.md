# Backend do app FSLOBO Enfermagem — proposta e SQL para revisão

> **Status: rascunho para revisão. Nada foi aplicado em nenhum banco.**
> Esta pasta fica fora de `supabase/` de propósito: `supabase/migrations/` é da
> loja, e um `supabase db push` ali aplicaria este SQL no projeto de produção.

## 1. O que a inspeção (somente leitura) encontrou

| Tema | Achado |
|---|---|
| Projetos Supabase | Existe **um só**: o projeto atual da loja (Postgres 17), que é a **produção da loja** (milhares de pedidos, pagamentos, CRM, financeiro, e-mails). Não há projeto de teste nem *branches*. |
| Autenticação hoje | **Não há login de cliente.** A loja é anônima (`verify_jwt = false` nas funções públicas). O Supabase Auth só serve ao painel administrativo (`admin_users` + `is_admin()`). |
| Cliente no navegador | `src/lib/supabase.ts`: chave pública, sem sessão de usuário. Só lê `packages`/`products` ativos. Todo o resto passa por Edge Functions. |
| Tabelas (public) | 22, todas com RLS ligado: `packages, orders, questions` (**perguntas de tarô**), `tarot_cards, drawn_cards, readings, payment_events, order_events, admin_users, checkout_rate_limit_*, products, order_items, product_files, crm_order_flags, finance_expenses, debts, debt_payments, enfermagem_email_*`. |
| Políticas | Quase todas `*_admin_*` (via `is_admin()`); leitura pública apenas de `packages` e `products` ativos. 9 tabelas operacionais têm RLS sem política (só `service_role`). |
| Grants | `authenticated` tem GRANT amplo em várias tabelas (protegidas só por RLS de admin). `anon` só lê `packages`/`products`. |
| Grants residuais | Por padrão da Supabase, `anon`/`authenticated` também têm `TRUNCATE`, `TRIGGER` e `REFERENCES` em várias tabelas da loja (ex.: `anon` em `packages`, `products`, `crm_order_flags`). A API REST não expõe TRUNCATE, então não é explorável por ela, mas é higiene a revogar numa etapa própria da loja. **Não foi tocado.** |
| Funções | Padrão do projeto: `SECURITY DEFINER`, `search_path` fixo, `REVOKE` de `anon/public`. **23 funções `SECURITY DEFINER` (CRM, finanças, dívidas) são executáveis por `authenticated`** — o linter da Supabase marca como alerta. |
| Auth (alerta) | "Leaked password protection" **desligada** no projeto. |
| Migrations | O banco tem **39** migrations aplicadas; o repositório tem **16**. 23 aplicadas não estão no repo. Logo `db reset`/*branching* a partir do repo **não reproduz** a produção. |
| Ferramentas locais | Sem Docker e sem Supabase CLI instalado → não há stack Supabase local. |
| Não consegui ler | Configuração do Auth (cadastro público aberto? confirmação de e-mail? SMTP?). Precisa ser conferida no painel. |

**Colisão de nome:** já existe `public.questions` (tarô). Por isso tudo do app usa o prefixo `study_`.

### Conclusão sobre o ambiente
**Não existe hoje um ambiente isolado.** Abrir cadastro de alunos no projeto da
loja faria cada aluno virar `authenticated` ao lado de 23 RPCs administrativas e de
tabelas com GRANT amplo, dependendo só de checagens internas estarem perfeitas — e
misturaria alunos com o cadastro administrativo e com os dados de compradores.

**Recomendação:** um **projeto Supabase novo e separado para o app**
(`fslobo-app`), com Auth próprio. Primeiro como desenvolvimento/teste; depois
decidimos se vira a produção do app ou se criamos um segundo para isso.
O que isso garante: nenhum pedido, pagamento, e-mail ou comprador está no mesmo
banco; usuários do app não existem na loja; comprador **nunca** vira conta
automaticamente (não há ponte entre os bancos).

## 2. Estrutura proposta

```
auth.users (Supabase Auth, projeto do app)
  ├─ study_profiles        1:1  nome, foco de prova, meta semanal (SEM pontos, SEM papel, SEM e-mail)
  ├─ study_admins          1:1  quem administra conteúdo (sem GRANT: só SQL direto/service_role)
  ├─ study_attempts        1:N  tentativa (modo practice|review, status, pontos finais)
  │    ├─ study_attempt_items    questões sorteadas PELO SERVIDOR no início
  │    └─ study_attempt_answers  resposta única por item; is_correct calculado no servidor
  ├─ study_points_ledger   1:N  livro-razão (único por tentativa+motivo); pontos = soma
  └─ study_review_items    1:N  erros pendentes/resolvidos por questão

study_subjects (assuntos) ── study_questions ──┬─ study_question_options  (sem coluna de gabarito)
   conteúdo administrativo                     ├─ study_answer_keys       (gabarito, sem GRANT)
                                               └─ study_explanations      (explicação, sem GRANT)
```

### Regras que o SQL impõe
- **Pontos só no servidor.** Não há coluna de pontos no perfil; o navegador não tem
  INSERT/UPDATE em nenhuma tabela. `study_complete_attempt()` grava no livro-razão
  (regra completa na seção 2b). Idempotente por índices únicos parciais.
- **Gabarito nunca antecipado.** Gabarito e explicação estão em tabelas sem GRANT.
  O payload de uma tentativa só inclui `correct_option_id` e `explanation` dos itens
  **já respondidos**. Resposta única por item (`already_answered`).
- **Quem escolhe as questões é o servidor.** O cliente não envia ids de questão;
  só `item_id` e `option_id`, validados contra o dono da tentativa e a questão do item.
  Id alheio responde `not_found`, igual a id inexistente (sem enumeração).
- **Cada usuário vê só o seu.** RLS `user_id = (select auth.uid())` nas 5 tabelas
  de histórico (somente SELECT). Nenhuma RPC recebe `user_id` do cliente.
- **Conteúdo não público.** Nenhum GRANT/política para `anon`/`authenticated` em
  assuntos, questões, alternativas, gabaritos e explicações. Só `status = 'published'`
  entra em tentativas. Questão inédita (draft/in_review) nunca é servida.
- **Conteúdo publicado é imutável** (triggers, valem também para SQL direto):
  correção = arquivar e criar nova versão; o histórico do aluno continua apontando
  para o texto que ele viu.
- **Sem paciente real:** publicar exige `p_confirm_no_real_patient_data = true`
  (grava `no_real_patient_data_confirmed`, `reviewed_by`, `published_at`; constraint
  no banco). Nenhuma tabela guarda dado de paciente.
- **Campos administrativos protegidos:** `study_admins` sem GRANT; perfil só editável
  por RPC com lista branca (nome, foco, meta); `source_note`, `created_by`,
  `reviewed_by` nunca saem nas RPCs do aluno.
- **Anti-varredura:** uma tentativa aberta por modo (retoma), no máx. **20 tentativas
  novas e 200 questões entregues por dia** (seção 2c), 20 questões por tentativa. Como pontuar só na 1ª vez que cada questão é acertada
  (seção 2b), varrer o banco não rende pontos extras. *Risco residual:* um aluno autenticado pode,
  com paciência, ver as questões que o sorteio lhe entrega; o limite diário e o
  sorteio priorizando inéditas só tornam isso lento. Se o banco virar ativo valioso,
  acrescentar rate limit por IP na borda e monitorar volume por usuário.
- **Segurança das funções:** `SECURITY DEFINER` com `search_path = pg_catalog, public, pg_temp`,
  `REVOKE` de `public/anon`, EXECUTE só `authenticated` (e `service_role`); a função
  interna de payload não é executável por ninguém além das RPCs.
- **Sem gatilho em `auth.users` e sem vínculo com pedidos:** o perfil é criado
  explicitamente por `study_upsert_my_profile()` depois do login.

### 2b. Pontuação: treino livre x competitiva (`scoring_version = 1`)

Problema corrigido: na primeira versão, repetir as mesmas questões em novas
tentativas somava pontos sem limite (até 30 tentativas por dia). Agora:

| Modo | O que é | Pontos |
|---|---|---|
| `practice` | treino pontuado; o servidor entrega primeiro questões ainda não respondidas | **10 por questão, só na 1ª vez que o usuário a acerta** |
| `review` | revisão dos erros pendentes | mesma regra (pontua se a questão ainda nunca foi acertada) |
| `free` | treino livre: qualquer questão, quantas vezes quiser | **nunca pontua** (a questão continua disponível para pontuar depois) |

- **Bônus de conclusão: 20**, uma vez por tentativa pontuada, se **todas** as questões
  foram respondidas **e** a tentativa rendeu **pelo menos 3 pontuações de questão novas**.
  Repetir questões antigas não gera bônus.
- Pontos só entram ao **concluir** (abandonar não pontua).
- **Teto finito por usuário:** `10 x Q + 20 x floor(Q/3)`, em que Q = nº de questões
  **distintas que o usuário chegou a acertar** (no máximo as já publicadas, inclusive as
  arquivadas depois). Cada bônus exige pelo menos 3 pontuações novas, por isso existem no
  máximo `floor(Q/3)` bônus. (A versão anterior do comentário dizia "30 x nº de questões",
  que estava errado.) Acabou o conteúdo novo, a pontuação para; o treino livre continua
  disponível, mas sem pontos e sem valer ranking.
- Garantia no banco, não só na RPC: índice único parcial `(user_id, question_id)`
  para `question_first_correct` e `(attempt_id)` para `attempt_completion`.
- O payload da tentativa traz `awards_points` e `scored_questions`, para a interface
  dizer "treino livre não pontua" e "N questões novas pontuaram".
- **Efeito na interface aprovada:** a demonstração calcula pontos de outra forma
  (320 iniciais, 10 por acerto, 25 por comparação de prática). Ao ligar o backend a
  regra do servidor passa a valer, a base de 320 desaparece e "ranking" só será real
  em etapa própria (não implementada aqui).

### 2c. Tentativas: expiração, retomada e limites diários — decisões que afetam o aluno

| Situação | O que acontece | Efeito para o aluno |
|---|---|---|
| Parou no meio e voltou em **até 7 dias** | a mesma tentativa é **retomada** (`resumable = true`) | continua de onde parou; nada se perde |
| Voltou **depois de 7 dias sem atividade**, e ainda havia questões sem resposta | a tentativa vira `expired`; uma nova é criada | as respostas já dadas ficam no histórico e os **erros seguem para a revisão**; **não há pontos** daquela tentativa; as questões que ficaram sem resposta voltam a ser sorteadas |
| Voltou depois de 7 dias, mas **todas já estavam respondidas** e esqueceu de "Concluir" | a tentativa é **concluída automaticamente** (ao iniciar outra, ao concluir ou na varredura) | **pontua normalmente** — nada se perde por esquecer o botão |
| Tenta responder uma tentativa vencida | erro `attempt_expired` | a interface deve oferecer "começar nova tentativa" |
| Desistiu pelo botão | `abandoned` | sem pontos; respostas e erros ficam |

- **Prazo:** 7 dias desde a última atividade (início ou resposta) — `attempt_ttl_hours = 168`.
  Escolha de produto: longo o bastante para estudar em dias alternados, curto o bastante
  para não deixar sessões penduradas e questões "travadas" para sempre.
- **Expiração preguiçosa:** acontece quando o aluno inicia outra tentativa ou quando
  `study_expire_stale_attempts()` roda. Agendar essa varredura (pg_cron) é opcional e
  **não** é feito pela migration; sem agendamento nada quebra, só ficam linhas `in_progress`
  antigas até o aluno voltar.
- **Recomendação de interface:** chamar `study_complete_attempt` logo que a última
  questão for respondida (é idempotente), em vez de esperar o aluno.
- **Limites diários** (dia = America/Sao_Paulo; ajustáveis em `study_settings` sem nova migration):

| Limite | Padrão | Observação |
|---|---|---|
| Tentativas novas por dia | **20** (antes 30) | retomar não conta; vale para todos os modos |
| Questões entregues por dia | **200** | soma de todos os modos; abandonar/expirar não devolve saldo |

  **Por que mudei de "30 tentativas" para "20 tentativas + 200 questões":** limitar só o
  número de tentativas deixava uma conta pedir 30 x 20 = 600 questões por dia. O teto em
  questões é o que realmente protege o banco; 20 tentativas cobre confortavelmente quem
  estuda em blocos de 5 a 10 questões. Um aluno muito dedicado (100 a 150 questões/dia) não
  é afetado.
- **Saldo menor que o pedido:** a tentativa vem **menor** (`question_count` < pedido);
  saldo zero devolve `daily_limit_reached` com `detail = 'questions'`; sem tentativas,
  `detail = 'attempts'`. `study_my_progress` informa `attempts_left_today` e
  `questions_left_today` para a interface avisar antes.
- **O que este limite não faz:** não impede quem cria várias contas; isso é do Turnstile no
  cadastro e de rate limit na borda (etapa de autenticação).

### 2d. Endurecimento do conteúdo e do histórico (auditoria)
- Questão publicada: **nenhum** campo de conteúdo **nem de auditoria** muda (antes só enunciado,
  assunto e dificuldade); só `published → archived`. INSERT já publicado é recusado; publicar
  por UPDATE direto exige 2–5 alternativas, gabarito e explicação (trigger, não só a RPC).
- Alternativas, gabarito e explicação não podem ser **movidos** entre questões (antes dava para
  tirar uma alternativa de uma questão publicada movendo-a para um rascunho).
- A checagem trava a questão (`FOR SHARE`): fecha a corrida em que apagar uma alternativa ao
  mesmo tempo que se publica deixava questão publicada com menos de 2 alternativas
  (reproduzida no teste de mutação, seção 4).
- `TRUNCATE` bloqueado nas tabelas de conteúdo e de histórico; `service_role` perdeu
  `TRUNCATE/TRIGGER/REFERENCES` (privilégios padrão da Supabase) e ficou só com
  `SELECT/INSERT/UPDATE/DELETE`.
- Respostas e livro-razão são **append-only** (UPDATE e DELETE diretos recusados, até para o dono
  do banco); apagar a conta do aluno (LGPD) continua apagando tudo em cascata.

### RPCs (superfície do navegador)
`study_upsert_my_profile`, `study_list_subjects`, `study_start_attempt`,
`study_get_attempt`, `study_submit_answer`, `study_complete_attempt`,
`study_abandon_attempt`, `study_my_progress`, `study_list_my_attempts`,
`study_list_my_review_items`; admin: `study_admin_publish_question`; manutenção
(só `service_role`): `study_expire_stale_attempts`.

## 3. Arquivos

| Arquivo | Conteúdo |
|---|---|
| `migrations/0001_study_foundation.sql` | tipos, admins, perfil, assuntos |
| `migrations/0002_study_content.sql` | questões, alternativas, gabarito, explicação, congelamento |
| `migrations/0003_study_attempts.sql` | tentativas, itens, respostas, livro-razão, revisão |
| `migrations/0004_study_rpcs.sql` | RPCs e permissões de execução |
| `seed/dev_demo_questions.sql` | 5 questões **demonstrativas** — só no projeto de teste |
| `tests/stubs/supabase_stub.sql` | papéis, `auth.uid()` e privilégios padrão do Supabase (só local) |
| `tests/run-local.mjs` | 247 verificações de segurança e regra em PGlite (uma conexão; sem concorrência) |
| `tests/run-concurrency.mjs` | 27 verificações de concorrência em PostgreSQL real local e descartável (várias conexões) |
| `CHANGELOG-v2.md` | o que mudou nesta revisão e por quê |

## 4. Estratégia de testes

1. **Local, sem custo e sem rede** (feito): PGlite aplica as 4 migrations sobre um stub
   do Supabase **com os privilégios padrão que concedem tudo a `anon`/`authenticated`/`service_role`**,
   para provar que os `REVOKE` explícitos funcionam. Resultado: **247 passaram, 0 falharam.** Cobre:
   - **Permissões (auditoria exata):** para as 13 tabelas e os 7 privilégios, `anon` sem nada;
     `authenticated` só `SELECT` nas 6 tabelas do próprio histórico; `service_role` sem
     `TRUNCATE/TRIGGER/REFERENCES`. 6 políticas RLS, todas SELECT/authenticated e amarradas a
     `auth.uid()`. Funções internas e a varredura não executáveis por `authenticated`; toda
     `SECURITY DEFINER` com `search_path` fixo (`pg_temp` por último); RLS ligado em todas as tabelas.
   - **Acesso entre usuários:** ler/responder/concluir/abandonar tentativa alheia → `not_found`;
     `select` direto só devolve linhas próprias; progresso e pontos independentes.
   - **Pontos:** resposta repetida recusada sem gravar nem pontuar; conclusão repetida idempotente;
     anti-acúmulo (repetir questões: 0 ponto, 0 bônus); treino livre: 0 ponto; pontuado e revisão
     seguem 10/questão na 1ª vez + bônus 20 com ≥ 3 novas.
   - **Conteúdo publicado:** enunciado, auditoria, id, alternativas, gabarito e explicação
     imutáveis (inclusive para `service_role`); mover alternativa; INSERT já publicado; publicar sem
     gabarito por UPDATE direto; `TRUNCATE`; arquivar uma vez, sem voltar.
   - **Histórico:** append-only; exclusão da conta em cascata funciona.
   - **Expiração:** 6 dias retoma; 8 dias não aceita resposta, não conclui incompleta, cria nova e
     marca a antiga `expired` sem pontos, preservando respostas e erros; vencida mas toda respondida
     conclui com pontos (ao concluir, ao iniciar outra e pela varredura); varredura idempotente e
     restrita a `service_role`; prazo configurável e validado.
   - **Limites:** tentativas por dia, questões por dia (tentativa menor quando o saldo é menor),
     `detail` do erro, saldo no progresso; retomar não consome limite.
   **Este teste usa PGlite (uma única conexão): NÃO demonstra concorrência.**
1b. **Concorrência real, local** (`tests/run-concurrency.mjs`): servidor PostgreSQL de
   verdade (embedded-postgres, descartável, 127.0.0.1) e **várias conexões simultâneas**.
   **27 verificações passaram, 0 falharam:**
   - 8 respostas simultâneas ao mesmo item → 1 aceita, 7 `already_answered`, 1 linha, `miss_count` = 1;
   - 10 conclusões simultâneas da mesma tentativa → todas veem os mesmos 70 pontos; livro-razão com 6 linhas;
   - pontuado + revisão concluídos ao mesmo tempo com a mesma questão → a questão pontua uma vez só;
   - 12 inícios simultâneos → a mesma tentativa, 1 linha;
   - limite de tentativas: com 1 vaga e 6 disputas em 3 modos → exatamente 1 criada, total do dia ≤ 20;
   - limite de questões: saldo 6 e 3 pedidos simultâneos (5+5+1) → nunca mais de 6 entregues;
   - 6 inícios simultâneos sobre tentativa vencida → todos recebem a mesma nova; a antiga expira uma vez;
   - 3 varreduras simultâneas sobre 8 tentativas vencidas e completas → cada uma processada uma vez,
     8 x 50 pontos, 32 linhas no livro-razão, sem duplicidade;
   - resposta x conclusão simultâneas (15 rodadas) → `correct_count` sempre igual às respostas gravadas;
   - publicar x apagar alternativa ao mesmo tempo (25 rodadas) → nunca sobra questão publicada com < 2 alternativas.
   **Verificação do próprio teste (mutação):** em cópias descartáveis removi, uma por vez, as travas
   (`pg_advisory_xact_lock` no início, `FOR UPDATE` na conclusão, `FOR UPDATE` na resposta,
   `FOR SHARE` no guard das alternativas). Cada remoção fez falhar o teste correspondente. Sem o
   `FOR SHARE`, o teste I **produziu de fato** questões publicadas com menos de 2 alternativas.
   **Limites desta evidência:** servidor PostgreSQL **18.6** local (produção Supabase está na
   **17**), um único host, algumas dezenas de conexões, sem PostgREST/pooler da Supabase e sem
   carga. As travas usadas (`FOR UPDATE`, `FOR SHARE`, advisory lock de transação, índices únicos)
   são recursos padrão e funcionam igual na 17, e cada chamada RPC da Supabase roda em uma
   transação própria — mas isso **deve ser reconfirmado no projeto de teste** com chamadas
   reais em paralelo (item 2).
2. **Projeto de teste do app** (após aprovação): aplicar as migrations, rodar o
   advisor de segurança (esperado: sem alertas de RLS/GRANT nas `study_*`), criar 2
   usuários de teste e repetir os cenários pela API real (JWT de cada um), incluindo
   tentar `select` direto, `rpc` de outro usuário e chamar `study_complete_attempt`
   duas vezes.
3. **Navegador (Preview):** Playwright com 2 contas de teste, tracking e pedidos
   bloqueados, como nas etapas anteriores.
4. **Regressão da loja:** `/app` continua lazy; o chunk `supabase` da loja não muda;
   as páginas de venda não carregam o cliente do app.

### Como rodar (opcional, só em máquina de desenvolvimento)
```
npm i -D @electric-sql/pglite embedded-postgres pg   # não são dependências do site
node supabase-app/tests/run-local.mjs
node supabase-app/tests/run-concurrency.mjs          # FSL_PG_PORT=54330 para trocar a porta
```
Nenhum dos dois usa rede nem credenciais reais; a senha em `run-concurrency.mjs` é de um
servidor que existe só durante a execução.

## 5. Mudanças previstas depois da aprovação (nada feito ainda)

Backend (projeto novo): aplicar `0001`–`0004`; seed só no teste.

Front-end (worktree `feat/app-enfermagem-interface`, só dentro de `src/app-enfermagem/`):
- `lib/appSupabase.ts` — cliente próprio (`VITE_APP_SUPABASE_URL`,
  `VITE_APP_SUPABASE_PUBLISHABLE_KEY`; nomes distintos dos da loja), sessão com chave de storage própria.
- `auth/AuthProvider.tsx`, `screens/AuthScreen.tsx` (cadastro, login, recuperar senha), guarda de rota em `index.tsx`.
- `data/repository.ts` com duas implementações: a atual de demonstração e a Supabase;
  telas passam a falar com a interface; `demoState.tsx` permanece para o modo demo.
- `ProfileScreen`/`AppShell`: sair da conta; estados de carregando/erro/sem questões.
- `.env.example` (somente **nomes** das variáveis).
- **Configuração sensível, só com sua aprovação explícita:** `vercel.json` — o `connect-src`
  da CSP precisa liberar o domínio do novo projeto Supabase; variáveis de ambiente no
  Vercel (só Preview no começo).

Dependências novas: nenhuma obrigatória. `@supabase/supabase-js` já existe. `@electric-sql/pglite`
só como `devDependency` opcional para os testes locais (não entra no site).

## 6. Recursos com custo (valores aproximados — confirmar no painel antes de criar)

| Recurso | Custo |
|---|---|
| Novo projeto Supabase na organização atual (plano Pro) | acima do crédito de computação incluído: **~US$ 10/mês por projeto** (instância Micro). Um para teste agora; outro se quiser separar teste e produção do app. |
| Alternativa sem custo para só desenvolver | projeto numa organização **Free** (sem backups, pausa por inatividade). Serve para teste; não para produção. |
| Supabase *Branching* | cobrado por hora de branch e **inviável agora** (repo desalinhado da produção). Não recomendado. |
| E-mail de autenticação em produção | o SMTP padrão da Supabase é limitado e não serve para produção → SMTP próprio (a conta já tem Resend; verificar o plano/limites). |
| Proteção contra senhas vazadas | disponível no Pro; hoje **desligada** no projeto da loja. |
| CAPTCHA no cadastro (Turnstile) | sem custo adicional; já usado na loja. |
| MAU (usuários ativos) | Pro inclui 100 mil; irrelevante nesta fase. |
| Backups/PITR | diários incluídos no Pro; PITR é complemento pago e **não** é necessário agora. |
| Vercel | sem custo adicional (variáveis e Preview). |
| Conteúdo | revisão editorial/técnica das questões reais (esforço humano, não de plataforma). |

## 6b. Riscos e limitações conhecidas (v2)

1. **Concorrência provada só em PostgreSQL 18.6 local**, sem PostgREST/pooler da Supabase e sem carga. Reconfirmar no projeto de teste (Postgres 17) com chamadas paralelas reais antes de qualquer lançamento.
2. **Os testes locais simulam o Supabase** (papéis, `auth.uid()`, privilégios padrão), mas não são o Supabase: não exercitam GoTrue, PostgREST nem o linter. Falta rodar o advisor de segurança no projeto de teste.
3. **Expiração é preguiçosa.** Sem a varredura agendada, tentativas vencidas ficam `in_progress` até o aluno iniciar outra (a interface vê `resumable = false`). Não é agendada por esta migration.
4. **Quem deixa uma tentativa incompleta por mais de 7 dias perde os pontos dela** (as respostas e os erros ficam). É decisão de produto (seção 2c); o prazo é ajustável em `study_settings`.
5. **Varredura do banco de questões** continua possível, só lenta: 200 questões/dia por conta. Não há proteção contra várias contas (Turnstile e rate limit por IP ficam para a etapa de autenticação).
6. **Um administrador pode criar e publicar a mesma questão** (não exigimos revisor diferente). O atestado de "sem paciente real" é declaração humana, não validação automática do texto.
7. **O dono do banco ainda pode desligar os triggers** (`ALTER TABLE ... DISABLE TRIGGER`). Os triggers protegem contra qualquer papel de aplicação, inclusive `service_role`, não contra o superusuário.
8. **Fuso fixo** (America/Sao_Paulo) para "dia" e "semana".
9. **Ranking real, direito de acesso por compra e interface ligada ao backend continuam fora do escopo.** A demonstração aprovada calcula pontos de outro jeito (seção 2b).
10. **Limites padrão (20 tentativas, 200 questões, 7 dias) são estimativas**, sem dados de uso real; ajustáveis sem migration, mas só por SQL/`service_role`.

## 7. Decisões que precisam de você
1. Projeto separado para o app (recomendado) — Pro (~US$ 10/mês) ou organização Free só para teste?
2. Cadastro: e-mail + senha com confirmação por e-mail, ou link mágico? (recomendo e-mail+senha, confirmação obrigatória, Turnstile e senhas vazadas bloqueadas)
3. Acesso ao app depende de ter comprado algo? **Fora deste escopo**: exigiria uma tabela de direitos (*entitlement*) criada por ação explícita do usuário (ex.: código de acesso), nunca por cruzar e-mails de pedidos.
4. Quem revisa as questões antes de publicar (o SQL exige um administrador; dá para exigir revisor diferente do autor).
5. Retenção e exclusão: política para apagar a conta e o histórico (LGPD) — o SQL já usa `on delete cascade` a partir de `auth.users`.
