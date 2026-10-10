# Checkout de cartão de crédito Efí

O Pix atual usa a API Pix e continua em `create-product-order-efi-prod`. O cartão usa **API Cobranças**, tokenização no navegador e os novos endpoints `create-product-card-order` e `efi-card-notification`. Cartão de débito online não faz parte deste contrato; não anunciar débito como disponível sem uma solução confirmada pela Efí.

## Preparação

1. Habilitar a API de Emissão de Cobranças na aplicação Efí, completar a análise KYC para cartão não presente e obter as credenciais do ambiente correto. O `payee_code` (Identificador de conta) é público para tokenização; `client_id` e `client_secret` são segredos exclusivos do servidor. As credenciais Pix não substituem as credenciais da API Cobranças.
2. Aplicar `supabase/migrations/20261009024220_efi_credit_card_checkout.sql` antes de atualizar a função Pix. Essa migration adiciona o vínculo da cobrança, a reivindicação atômica e a confirmação de pagamentos.
3. Configurar os segredos das Edge Functions no projeto Supabase: `EFI_CARD_CLIENT_ID`, `EFI_CARD_CLIENT_SECRET`, `EFI_CARD_ENVIRONMENT=homologation` (ou `production`). Reutilizar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGIN`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME`, `TURNSTILE_EXPECTED_ACTION_PRODUCT_ORDER` e `RATE_LIMIT_HASH_SECRET` já usados pelo Pix. Nunca colocar esses segredos no Git ou em variáveis `VITE_`.
4. Publicar `create-product-card-order`, `efi-card-notification` e a versão atualizada de `create-product-order-efi-prod` no Supabase com `verify_jwt=false` conforme `supabase/config.toml`. A URL de notificação usada na cobrança é `${SUPABASE_URL}/functions/v1/efi-card-notification`.
5. No build do Vercel, configurar `VITE_EFI_PAYEE_CODE`, `VITE_EFI_CARD_ENVIRONMENT=sandbox` para homologação (`production` para produção) e `VITE_EFI_CARD_ENABLED=true` **somente depois** da migration, das funções, dos segredos e dos testes completos. Se o flag ficar ausente ou `false`, o formulário de cartão permanece oculto. A interface de pedidos de cartão já iniciados continua acompanhando a confirmação se o flag for desativado.

## Contrato e conciliação

- O cliente envia apenas `payment_token`, CPF e telefone ao backend; número, validade e CVV são tokenizados pela biblioteca oficial `payment-token-efi` no navegador e não são enviados à loja nem persistidos.
- O backend calcula o valor a partir do catálogo na RPC existente, reserva uma tentativa antes do `POST /v1/charge/one-step` e associa o `custom_id=fs-<public_id>`. O Pix também reserva atomicamente sua forma de pagamento antes de criar cobrança. Em resposta incerta, **não faz outra cobrança** na mesma tentativa. O suporte deve consultar a Efí pelo `custom_id` e conferir cobrança, valor, método, pedido e status antes de qualquer intervenção manual.
- Após criar, a função consulta `GET /v1/charge/:id` e verifica `custom_id`, valor e método. O webhook recebe um token, consulta `GET /v1/notification/:token`, consulta o estado atual da cobrança e só então chama a RPC de conciliação. `approved` ou `paid` libera os arquivos; `unpaid` encerra a tentativa sem liberar e permite que o comprador inicie outra. Reembolsos, cancelamentos ou contestação após aprovação suspendem o acesso futuro.
- A Efí considera a notificação entregue ao consultar o token. Se a gravação no banco falhar depois dessa consulta, o suporte deve reconciliar pelo `custom_id` na API ou no painel Efí; a mensagem mostrada ao comprador orienta contato. Monitorar notificações e pedidos reservados sem `efi_card_charge_id`.

## Homologação antes de produção

- Verificar um cartão de teste aprovado (a Efí documenta terminação diferente de 1/2/3), pedido com produto e adicional, recebimento de notificação, `orders.status=paid`, um único evento `payment_confirmed` e downloads válidos.
- Verificar recusas com os cartões de teste terminados em 1, 2 e 3; o pedido não deve liberar arquivos. Uma nova tentativa exige novo `checkout_request_id`.
- Simular duas submissões simultâneas com o mesmo ID e perda da resposta de criação; deve existir no máximo um `charge_id` por pedido, sem segundo POST da cobrança.
- Verificar resposta de notificação repetida e confirmação após recarga da página; não deve haver eventos de pagamento duplicados.
- Confirmar que o Pix continua gerando QR Code e entregando os mesmos arquivos, inclusive para carrinho e adicionais. A função Pix rejeita pedidos já reservados para cartão.
- Após aprovação KYC e testes de homologação, mudar os segredos para produção, `EFI_CARD_ENVIRONMENT=production` e `VITE_EFI_CARD_ENVIRONMENT=production`, testar uma compra real supervisionada e só então ativar `VITE_EFI_CARD_ENABLED=true` em produção.

Referências: [cartão e tokenização](https://dev.efipay.com.br/docs/api-cobrancas/cartao/), [credenciais](https://dev.efipay.com.br/docs/api-cobrancas/credenciais/), [notificações](https://dev.efipay.com.br/docs/api-cobrancas/notificacoes/) e [status](https://dev.efipay.com.br/docs/api-cobrancas/status/).
