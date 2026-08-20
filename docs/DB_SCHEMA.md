# Esquema do banco

> ⚠️ **Pendência registrada:** este documento ainda descreve o schema
> herdado do projeto de tarô, incluindo a tabela `tarot_cards`. Essa tabela
> (e qualquer outro resíduo de tarô no banco) será analisada e decidida
> diretamente no Supabase em uma etapa futura — nada foi alterado em
> migrations ou no banco nesta limpeza. Este documento não foi reescrito
> ainda para refletir só o schema em uso pela FSLobo Enfermagem.

Este documento explica, em português simples, o que cada tabela guarda, o
que cada status significa e como a segurança (GRANT e RLS) funciona.
Corresponde a duas migrations, já aplicadas ao projeto Supabase:

- `supabase/migrations/20260804_001_initial_schema.sql` — esquema inicial
  (Fase 1: tabelas, enums, RLS, GRANTs, seed dos pacotes).
- `supabase/migrations/20260805_002_harden_database_functions.sql` —
  reforço pontual de segurança em duas funções (ver seção de segurança).

---

## Visão geral do fluxo

```
Cliente escolhe pacote e escreve perguntas
        │
        ▼
   pedido (orders) criado — status "pending_payment"
   (só uma Edge Function validada pode criar isso — ver seção de segurança)
        │
        ▼
   Checkout Pro do Mercado Pago
        │
        ▼
   Webhook confirma pagamento ──► payment_events (log bruto, à prova de duplicidade)
        │
        ▼
   orders.status = "paid"
        │
        ▼
   orders.status = "drawing_cards" — sorteio de 3 cartas por pergunta no servidor
        │                                   │
        │                                   ▼
        │                            drawn_cards (3 por pergunta)
        ▼
   orders.status = "generating" — rascunho sendo gerado pela IA (Anthropic)
        │
        ▼
   readings.draft_json preenchido
        │
        ▼
   orders.status = "awaiting_review" — rascunho pronto, aguardando um
   administrador abrir a revisão
        │
        ▼
   orders.status = "in_review" — administrador revisando agora,
   edita se precisar ──► readings.edited_json
        │
        ▼
   Administrador aprova ──► readings.status = "approved" / orders.status = "approved"
        │
        ▼
   Administrador libera manualmente ──► readings.final_json / status = "released"
        │
        ▼
   Cliente acessa a página privada (com token) e vê a leitura final
```

Em nenhum momento desse fluxo uma resposta é liberada automaticamente — a
aprovação e a liberação são **sempre** um clique manual de um administrador.
Nenhum rascunho gerado pela IA (`readings.draft_json`) é, por si só, visível
ao cliente: só `final_json`, e só depois que `readings.status` chega em
`released`.

Se qualquer etapa falhar (sorteio, geração da IA), o pedido vai para
`orders.status = "failed"` em vez de travar silenciosamente — fica visível
no painel para um administrador investigar.

---

## Tabelas

### `packages` — pacotes comerciais
Os pacotes que aparecem no site (quantidade de perguntas, preço). É a fonte
única de verdade sobre o valor cobrado — diferente do site atual, onde o
preço vive só no código do front e não pode ser confiado para cobrança real.

### `orders` — pedidos
Um pedido por cliente. Guarda o pacote escolhido, o valor, o status do
pagamento e os identificadores do Mercado Pago. O acesso à leitura pelo
cliente **não usa login** — usa um token enviado por link. Por segurança,
o banco guarda só o **hash** desse token (`access_token_hash`), nunca o
token em texto puro — o mesmo princípio de uma senha: se alguém tivesse
acesso ao banco, não conseguiria reconstruir o token original.

`terms_version` e `privacy_version` registram qual versão dos Termos de Uso
e da Política de Privacidade o cliente aceitou no momento da compra —
importante para auditoria caso os textos mudem no futuro.

**`customer_email` agora é obrigatório.** O site atual só coleta o primeiro
nome no formulário — quando a Edge Function de criação de pedido for
construída, o formulário público vai precisar de um campo de e-mail novo
(isso é trabalho de uma fase futura; nada no site foi alterado agora). A
validação no banco é propositalmente simples (até 254 caracteres e presença
de "@") — só uma barreira mínima; validação completa de formato acontece
antes, no formulário ou na Edge Function.

Outras validações agora garantidas pelo próprio banco: nome e e-mail não
podem ser vazios, o valor cobrado (`amount_cents`) precisa ser maior que
zero, e a moeda precisa ter exatamente 3 letras maiúsculas (`BRL`, por
exemplo) — o mesmo vale para `packages.price_cents` e `packages.currency`.

`mercado_pago_preference_id` e `mercado_pago_payment_id` são únicos quando
preenchidos — dois pedidos nunca podem apontar para a mesma preferência ou
o mesmo pagamento do Mercado Pago. Os dois continuam opcionais (ficam
`NULL` até o Checkout Pro ser iniciado/confirmado): em Postgres, `UNIQUE`
não gera conflito entre linhas com `NULL`, então isso não impede vários
pedidos existirem antes de qualquer um deles ter um pagamento associado.

### `questions` — perguntas do pedido
Cada linha é uma pergunta que o cliente escreveu, numerada por posição
dentro do pedido (1ª, 2ª, 3ª...). Cada pergunta tem seu próprio sorteio de
cartas e sua própria geração de rascunho — perguntas diferentes do mesmo
pedido são tratadas de forma independente. O texto não pode ser vazio e
tem limite de 2000 caracteres. A combinação `(order_id, position)` é única
— não é possível ter duas "perguntas número 2" no mesmo pedido.

### `tarot_cards` — catálogo das 78 cartas
Tabela de referência com o significado de cada carta (arcano maior/menor,
naipe, significados em posição normal e invertida). **Esta migration não
cadastra nenhuma carta** — fica para uma migration futura dedicada só a
isso.

### `drawn_cards` — sorteio
As 3 cartas sorteadas **no servidor** (nunca no navegador do cliente) para
uma pergunta específica. Duas regras garantidas pelo próprio banco:
- a mesma carta não pode sair duas vezes na mesma pergunta;
- duas cartas não podem ocupar a mesma posição do sorteio (ex.: duas cartas
  como "1ª carta" ao mesmo tempo).

### `readings` — documento da leitura
O conteúdo em si, em três camadas:
- `draft_json` — o que a IA (Anthropic) gerou primeiro. **Nunca é mostrado
  ao cliente diretamente.**
- `edited_json` — o que um administrador ajustou durante a revisão.
- `final_json` — a versão que, depois de aprovada e liberada, o cliente vê.

Também guarda qual modelo de IA foi usado, quantos tokens consumiu e
quantas tentativas de geração foram necessárias (`generation_attempts`) —
útil para acompanhar custo e detectar falhas. `input_tokens` e
`output_tokens` podem ficar em branco (antes da geração), mas nunca podem
ser negativos quando preenchidos.

### `payment_events` — log bruto de pagamento (append-only)
Cada notificação (webhook) recebida de um provedor de pagamento é
registrada aqui antes de qualquer processamento. A combinação
`(provider, provider_event_id)` é única: se o Mercado Pago reenviar a mesma
notificação (o que é comum e esperado em qualquer integração de
pagamento), ela é reconhecida e não processada duas vezes — evita cobrar ou
liberar a mesma leitura duas vezes por erro de rede. A unicidade é por
*par* (provedor + id do evento), não só pelo id — assim, se um segundo
provedor de pagamento for adicionado no futuro, os IDs de eventos de um não
podem colidir com os do outro.

**Permite atualização só pelo backend, não permite exclusão por
ninguém.** Depois que um evento chega, os campos de processamento
(`status`, `attempts`, `error_message`, `processed_at`) podem ser
atualizados conforme a Edge Function do webhook avança no processamento —
mas só o `service_role` tem esse `GRANT` de `UPDATE`. `authenticated` (ou
seja, o painel administrativo) tem só `SELECT` e `INSERT`: a política de
`UPDATE` para administradores existe no banco (reservada para um uso
futuro), mas sem o `GRANT` correspondente ela é inalcançável hoje pela
Data API. Em nenhum caso a linha em si pode ser apagada — `DELETE` não
existe nem como `GRANT`, nem como política de RLS, para nenhum papel.

### `order_events` — auditoria de pedidos (imutável)
Um histórico de "o que aconteceu com este pedido e quando": mudanças de
status, quem realizou a ação (`actor_user_id`, quando foi uma ação humana)
e detalhes extras em `metadata`. Serve para investigar problemas e para
prestar contas do processo.

**É um histórico verdadeiramente imutável depois de inserido** — mais
restrito que `payment_events`. Só existem privilégios e políticas de
`SELECT` e `INSERT`; não há `UPDATE` nem `DELETE` em lugar nenhum (nem
`GRANT`, nem política de RLS), para nenhum papel. Se um evento foi
registrado errado, a correção é **inserir um novo evento** explicando a
correção — o registro original permanece exatamente como foi gravado. Essa
é a diferença de propósito entre as duas tabelas: `payment_events` reflete
o estado mais atual do processamento de um pagamento (por isso aceita
`UPDATE`); `order_events` é a linha do tempo em si, e uma linha do tempo
que pode ser reescrita deixa de servir como auditoria confiável.

**Nenhum registro de auditoria pode ser apagado pela aplicação** — nem pelo
painel administrativo, nem pelas Edge Functions. Isso vale para as duas
tabelas.

### `admin_users` — quem tem acesso ao painel
Lista de administradores. Note que **conceder acesso de administrador não é
uma ação disponível dentro do próprio painel** — só um administrador pode
*ler* essa lista; inserir ou remover alguém dela precisa ser feito por fora
(SQL direto no Supabase, ou um processo separado e controlado). Isso evita
que uma conta comprometida consiga se autopromover ou promover outra conta.

**Diferença entre `admin` e `supervisor`:** a coluna `role` só aceita esses
dois valores. Nesta etapa, porém, **o banco não trata os dois de forma
diferente** — a função `is_admin()` libera acesso para qualquer linha ativa
em `admin_users`, seja `admin` ou `supervisor`. O campo existe para permitir
uma distinção de permissões *dentro do painel* (por exemplo: supervisor
revisa e sugere edições, mas só admin aprova e libera) — mas essa regra
ainda não está implementada em nenhuma política de RLS. Ela é trabalho de
uma fase futura, quando o painel administrativo for construído.

---

## O que cada status significa

### Status do pedido (`order_status`)
Os valores seguem a ordem lógica do pipeline, do pedido criado até a
leitura liberada (ou um dos desfechos alternativos, ao final da tabela):

| Status | Significado |
|---|---|
| `pending_payment` | Pedido criado, aguardando confirmação do Mercado Pago |
| `paid` | Pagamento confirmado pelo webhook |
| `drawing_cards` | Sorteio das cartas em andamento no servidor |
| `generating` | Rascunho sendo gerado pela IA (Anthropic) |
| `awaiting_review` | Rascunho(s) pronto(s), aguardando um administrador abrir a revisão |
| `in_review` | Um administrador está revisando agora |
| `approved` | Revisão humana aprovou o conteúdo |
| `released` | Leitura liberada — cliente já pode ver |
| `failed` | Alguma etapa (sorteio ou geração) falhou e precisa de atenção humana |
| `cancelled` | Pedido cancelado antes de pagar |
| `refunded` | Reembolsado depois de pago |
| `expired` | Prazo de pagamento do Mercado Pago venceu sem confirmação |

### Geração da pergunta (`question_generation_status`)
`pending` → `generating` → `generated` (ou `failed`, se a chamada à IA
falhar — pode ser tentada novamente).

### Aprovação da pergunta (`question_approval_status`)
`pending` → `approved`, `needs_edit` (revisor precisa ajustar antes de
aprovar) ou `rejected` (não será liberada).

### Orientação da carta (`card_orientation`)
`upright` (normal) ou `reversed` (invertida).

### Status da leitura (`reading_status`)
`pending` → `draft_ready` → `in_review` → `approved` → `released` (ou
`failed`, se a geração falhar repetidamente).

---

## GRANT e RLS são camadas diferentes

Este projeto Supabase foi criado com **"Expor automaticamente novas
tabelas" desativado**. Na prática, isso significa que criar uma tabela e
ativar RLS nela **não é suficiente** para que ela funcione pela Data API
(a API que o Supabase gera automaticamente, usada por `supabase-js` no
navegador e nas Edge Functions) — é preciso também um `GRANT` explícito.

As duas camadas respondem perguntas diferentes, nesta ordem:

1. **`GRANT`** — "este papel (anon, authenticated, service_role) pode
   *tentar* este comando (SELECT/INSERT/UPDATE/DELETE) nesta tabela?" Se a
   resposta for não, a Data API rejeita o pedido antes mesmo de olhar para
   o conteúdo da tabela.
2. **RLS** — já dentro do comando permitido pelo `GRANT`, "quais *linhas*
   este papel efetivamente vê ou altera?"

Nenhuma das duas camadas sozinha é suficiente: um `GRANT` amplo sem RLS
exporia a tabela inteira; RLS sem `GRANT` simplesmente bloqueia tudo pela
Data API (mas não impede acesso feito com a chave `service_role` a partir
do servidor, que ignora RLS — ver abaixo).

### O que cada papel pode tentar (GRANT) — e o que RLS realmente libera

| Papel | GRANT (o que pode tentar) | RLS (o que realmente acontece) |
|---|---|---|
| `anon` (visitante, sem login) | `SELECT` só em `packages` | Só enxerga pacotes com `active = true` — é só isso que o site público precisa. Nas outras 8 tabelas, `anon` não tem nem `GRANT`: a Data API já rejeita antes do RLS entrar em ação. |
| `authenticated` | `SELECT/INSERT/UPDATE/DELETE` só em `packages` e `tarot_cards` (catálogos); `SELECT/INSERT/UPDATE` (sem `DELETE`) em `orders`, `questions`, `drawn_cards`, `readings`; só `SELECT/INSERT` em `payment_events` e em `order_events`; só `SELECT` em `admin_users` | Ter o `GRANT` **não basta** — o RLS (seção de políticas) exige `public.is_admin()` para tudo além de `packages`. Um usuário autenticado que não está em `admin_users` tem o comando tecnicamente permitido pelo `GRANT`, mas o RLS devolve zero linhas (SELECT) ou rejeita a operação (INSERT/UPDATE/DELETE). Em `admin_users`, mesmo um administrador não consegue INSERT/UPDATE/DELETE — não existe esse `GRANT`. Em `orders`, `questions`, `drawn_cards` e `readings`, não existe política de `DELETE` — mesmo um administrador não consegue apagar essas linhas. Em `payment_events`, a política de `UPDATE` existe (para uso futuro) mas hoje é inalcançável — não há `GRANT` de `UPDATE` para `authenticated` nessa tabela. Em `order_events`, nem a política de `UPDATE` existe: é imutável por completo. |
| `service_role` | `SELECT/INSERT/UPDATE/DELETE` só em `packages`, `tarot_cards` (catálogos) e `admin_users`; `SELECT/INSERT/UPDATE` (sem `DELETE`) em `orders`, `questions`, `drawn_cards`, `readings` e `payment_events`; só `SELECT/INSERT` em `order_events` | O `service_role` **ignora RLS por definição do Supabase** — é o papel usado exclusivamente pelas Edge Functions, nunca pelo navegador do cliente. Ele só precisa do `GRANT` porque a Data API confere privilégios antes de saber que RLS seria irrelevante para esse papel. Mesmo assim, `DELETE` foi removido do `GRANT` em `orders`, `questions`, `drawn_cards`, `readings`, `payment_events` e `order_events`, e `UPDATE` também foi removido em `order_events` — a proteção contra exclusão e a imutabilidade da auditoria valem **mesmo para o backend**, não só para o painel administrativo. |

**Um ponto que não pode ser esquecido em nenhuma fase futura**: a chave
`service_role` tem acesso total e sem filtro nenhuma das 9 tabelas — ela
**nunca pode aparecer em código que roda no navegador** (nenhum `.env`
com prefixo `VITE_`, nenhum bundle do front). Ela existe só para as Edge
Functions, que rodam no servidor do Supabase.

---

## Segurança (Row Level Security)

RLS está **ativado em todas as tabelas**. A regra geral do projeto:

- **Visitantes** (sem login) só podem consultar `packages` com `active = true`
  — exatamente o que a home e as páginas de tema precisam mostrar hoje.
- **Todo o resto é bloqueado para visitantes por padrão**: pedidos,
  perguntas, cartas sorteadas, rascunhos de leitura, eventos de pagamento e
  auditoria não podem ser lidos nem escritos diretamente do navegador —
  nenhuma política libera esse acesso.
- **Administradores autenticados** (usuários com uma linha ativa em
  `admin_users`, verificado pela função `is_admin()`) podem consultar e
  gerenciar todas as tabelas operacionais.
- **`admin_users` é a exceção**: administradores só podem *ler* essa
  tabela, nunca escrever nela pelo painel — ver a explicação acima.
- **Operações públicas** (criar pedido, gerar preferência de pagamento,
  processar webhook, sortear cartas, gerar rascunho, liberar leitura)
  acontecem **sempre por Edge Functions**, que usam a chave `service_role`.
  O `service_role` ignora o RLS por definição no Supabase — por isso não
  aparece nenhuma política "pública" nas tabelas operacionais: o acesso
  público real acontece por trás da Edge Function, nunca por uma consulta
  direta do navegador ao banco.
- **Só uma Edge Function validada pode criar um pedido público.** Não existe
  (e não deve existir) uma política de RLS que permita a `anon` inserir
  diretamente em `orders`. Isso é proposital: criar um pedido também precisa
  calcular o valor a partir de `packages` (nunca confiar em um valor vindo
  do navegador) e gerar o token de acesso — regras de negócio que só fazem
  sentido dentro de uma Edge Function controlada, nunca numa tabela aberta
  para escrita direta.

### Por que a função `is_admin()` existe
Em vez de repetir a mesma subconsulta em toda política ("existe uma linha
em `admin_users` para este usuário, com `active = true`?"), essa lógica
fica em uma única função, reaproveitada por todas as políticas. Ela é
`security definer` com `search_path` fixo — uma prática de segurança padrão
do Postgres/Supabase para esse tipo de função, que evita que ela seja
enganada por configurações maliciosas de schema.

### Permissões das funções (`EXECUTE`)
Tanto `is_admin()` quanto `set_updated_at()` têm o `EXECUTE` revogado de
`PUBLIC` e concedido só para `authenticated` e `service_role`:
- `is_admin()` precisa ser chamável por `authenticated`, porque é usada
  dentro das políticas de RLS acima; `anon` nunca precisa dela, já que
  nenhuma política pública depende dela.
- `set_updated_at()` só existe para ser disparada por trigger — nenhum
  código chama essa função diretamente. Revogar o `EXECUTE` de `PUBLIC`
  **não quebra os triggers**: o Postgres não exige que o papel que faz o
  `UPDATE` tenha `EXECUTE` na função do trigger — quem precisa de permissão
  é para fazer o `UPDATE` na tabela, não para "chamar" a função. O `GRANT`
  para `authenticated`/`service_role` aqui é uma camada extra de cuidado,
  não uma exigência técnica para o trigger funcionar.

### Reforço adicional (migration 002 — `harden_database_functions`)
Depois da migration inicial, dois ajustes pontuais de segurança foram
aplicados diretamente no projeto Supabase:

- **`set_updated_at()` agora tem `search_path` fixo em `pg_catalog`.** Toda
  função seria alvo de um ataque de "search_path hijacking" se alguém
  conseguisse criar um objeto com o mesmo nome de uma função/tipo usada
  internamente, num schema que apareça antes na busca do Postgres. Fixar o
  `search_path` (como `is_admin()` já fazia desde a migration inicial)
  fecha essa brecha também em `set_updated_at()`.
- **`rls_auto_enable()` — função interna do Supabase, ligada à opção
  "Ativar RLS automático" usada na criação deste projeto — teve o
  `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`, mantendo só
  `service_role`.** Essa função não foi criada por nenhuma das nossas
  migrations (é provisionada pelo próprio Supabase); o ajuste garante que
  nenhum papel de cliente possa invocá-la diretamente.

---

## Integridade: o que nunca é apagado pela aplicação

Além de RLS e GRANT, esta migration adiciona uma terceira camada de
proteção nos registros operacionais: **nenhum papel — nem `authenticated`
(o painel), nem `service_role` (as Edge Functions) — tem permissão de
`DELETE`** em `orders`, `questions`, `drawn_cards` ou `readings`. Isso vale
tanto no `GRANT` (a Data API rejeita o comando) quanto nas políticas de RLS
(não existe nenhuma política de `DELETE` criada para essas tabelas).

- **Pedidos, perguntas, sorteios e leituras não são apagados pela
  aplicação.** Um pedido problemático não "some" — ele muda de `status`
  (ver a tabela de status mais acima).
- **Cancelamento e expiração são representados por `status`, nunca por
  exclusão.** `orders.status = 'cancelled'` ou `'expired'` são estados
  normais do pedido, não um convite para apagar a linha. O registro
  continua existindo, para fins de histórico e de auditoria.
- **Cartas sorteadas permanecem registradas.** Se um sorteio precisar ser
  refeito por qualquer motivo, isso não é feito apagando linhas de
  `drawn_cards` — é uma decisão administrativa excepcional, feita fora do
  fluxo normal da aplicação (ver último tópico desta seção).
- **`order_events` não pode desaparecer por exclusão em cascata.** A
  chave estrangeira `order_events.order_id` usa `ON DELETE RESTRICT` (não
  `CASCADE`): o Postgres **impede** que um pedido seja apagado enquanto
  existir qualquer evento de auditoria apontando para ele. A mesma
  proteção vale para `questions.order_id`, `drawn_cards.question_id` e
  `readings.question_id` — a cadeia inteira (pedido → pergunta → sorteio →
  leitura) só pode ser removida de trás para frente, e mesmo assim nenhum
  papel tem `DELETE` para fazer isso pela aplicação.
- **Os IDs do Mercado Pago são únicos por pedido.**
  `orders.mercado_pago_preference_id` e `orders.mercado_pago_payment_id`
  têm restrição `UNIQUE` — dois pedidos nunca podem ficar associados à
  mesma preferência ou ao mesmo pagamento do Mercado Pago. Os dois campos
  continuam opcionais (ficam vazios até o Checkout Pro ser iniciado/
  confirmado) — em Postgres, `UNIQUE` permite qualquer quantidade de
  linhas com o valor `NULL` normalmente; a restrição só passa a valer
  quando o campo é de fato preenchido.
- **Uma eventual limpeza de dados é uma ação administrativa excepcional,
  feita direto no banco.** Se um dia for realmente necessário remover
  registros antigos (por exemplo, por uma política de retenção de dados),
  isso não deve — e, do jeito que este esquema está desenhado, tecnicamente
  **não consegue** — ser feito pela aplicação ou pelas Edge Functions. Exige
  acesso direto ao Supabase (SQL Editor, com um usuário com privilégios
  além de `service_role`) e uma decisão humana deliberada, nunca um
  `DELETE` disparado por código.

`packages` e `tarot_cards` são exceções propositais: são catálogos de
referência (não registros de um cliente específico), então mantêm `DELETE`
para administradores — corrigir um pacote cadastrado errado ou remover uma
carta duplicada do catálogo são operações de manutenção legítimas.

---

## O que **não** está nesta etapa

- As 78 cartas de tarô não foram cadastradas (migration futura).
- Nenhuma credencial, variável de ambiente ou chave foi criada.
- Nenhuma Edge Function foi criada — as tabelas existem, mas ainda não há
  código de backend usando-as.
- O site público continua exatamente como está, sem nenhuma alteração.
