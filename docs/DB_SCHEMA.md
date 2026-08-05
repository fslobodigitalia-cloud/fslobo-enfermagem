# Esquema do banco — Entre Nós Tarô

Este documento explica, em português simples, o que cada tabela guarda, o
que cada status significa e como a segurança (RLS) funciona. Corresponde à
migration `supabase/migrations/20260804_001_initial_schema.sql`.

Nada neste documento foi aplicado a um banco real ainda — é a documentação
da Fase 1 (esquema inicial), aguardando autorização para ser aplicada.

---

## Visão geral do fluxo

```
Cliente escolhe pacote e escreve perguntas
        │
        ▼
   pedido (orders) criado — status "pending_payment"
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
   Para cada pergunta (questions): sorteio de 3 cartas no servidor
        │                                   │
        │                                   ▼
        │                            drawn_cards (3 por pergunta)
        ▼
   Rascunho gerado pela IA (Anthropic) ──► readings.draft_json
        │
        ▼
   orders.status = "in_review" — aguardando revisão humana
        │
        ▼
   Administrador revisa no painel, edita se precisar ──► readings.edited_json
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
aprovação e a liberação são sempre um clique manual de um administrador.

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

### `questions` — perguntas do pedido
Cada linha é uma pergunta que o cliente escreveu, numerada por posição
dentro do pedido (1ª, 2ª, 3ª...). Cada pergunta tem seu próprio sorteio de
cartas e sua própria geração de rascunho — perguntas diferentes do mesmo
pedido são tratadas de forma independente.

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
útil para acompanhar custo e detectar falhas.

### `payment_events` — log bruto de pagamento
Cada notificação (webhook) recebida do Mercado Pago é registrada aqui antes
de qualquer processamento. `provider_event_id` é único: se o Mercado Pago
reenviar a mesma notificação (o que é comum e esperado em qualquer
integração de pagamento), ela é reconhecida e não processada duas vezes —
evita cobrar ou liberar a mesma leitura duas vezes por erro de rede.

### `order_events` — auditoria de pedidos
Um histórico de "o que aconteceu com este pedido e quando": mudanças de
status, quem realizou a ação (`actor_user_id`, quando foi uma ação humana)
e detalhes extras em `metadata`. Serve para investigar problemas e para
prestar contas do processo.

### `admin_users` — quem tem acesso ao painel
Lista de administradores. Note que **conceder acesso de administrador não é
uma ação disponível dentro do próprio painel** — só um administrador pode
*ler* essa lista; inserir ou remover alguém dela precisa ser feito por fora
(SQL direto no Supabase, ou um processo separado e controlado). Isso evita
que uma conta comprometida consiga se autopromover ou promover outra conta.

---

## O que cada status significa

### Status do pedido (`order_status`)
| Status | Significado |
|---|---|
| `pending_payment` | Pedido criado, aguardando confirmação do Mercado Pago |
| `paid` | Pagamento confirmado pelo webhook |
| `in_review` | Rascunho(s) gerado(s), aguardando revisão humana |
| `approved` | Revisão humana aprovou o conteúdo |
| `released` | Leitura liberada — cliente já pode ver |
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

### Por que a função `is_admin()` existe
Em vez de repetir a mesma subconsulta em toda política ("existe uma linha
em `admin_users` para este usuário, com `active = true`?"), essa lógica
fica em uma única função, reaproveitada por todas as políticas. Ela é
`security definer` com `search_path` fixo — uma prática de segurança padrão
do Postgres/Supabase para esse tipo de função, que evita que ela seja
enganada por configurações maliciosas de schema.

---

## O que **não** está nesta etapa

- As 78 cartas de tarô não foram cadastradas (migration futura).
- Nenhuma credencial, variável de ambiente ou chave foi criada.
- Nenhuma Edge Function foi criada — as tabelas existem, mas ainda não há
  código de backend usando-as.
- O site público continua exatamente como está, sem nenhuma alteração.
