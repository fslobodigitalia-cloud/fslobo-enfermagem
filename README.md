# FSLobo Enfermagem

Site de venda de materiais digitais educacionais para profissionais e estudantes de
enfermagem — Guia de Evolução de Enfermagem e produtos complementares (order bumps).
React + TypeScript + Vite + Tailwind CSS + componentes no padrão shadcn/ui (Radix),
Framer Motion e Lucide Icons.

```bash
npm install
npm run dev      # ambiente de desenvolvimento em http://localhost:5173
npm run build    # build de produção em dist/
npm run preview  # pré-visualização do build
```

---

## Estrutura

```
src/
  components/
    ui/            Primitivos de UI (Radix/shadcn): button, dialog, input, checkbox...
    checkout/       TurnstileWidget (verificação de segurança do checkout)
    guia/           Seções específicas da página do Guia de Evolução de Enfermagem
    LegalLayout.tsx Layout compartilhado pelas 4 páginas legais
  config/
    site.ts             Marca, contato e política comercial mínimos ainda em uso
    legal.ts            Conteúdo e dados reais do fornecedor das páginas legais
    digitalProducts.ts  Catálogo de exibição do Guia + order bumps (preço real vem do banco)
    guiaQuiz.ts         Perguntas e resultados do quiz da página do Guia
  lib/
    supabase.ts         Cliente Supabase do frontend (só chave publishable/anon)
    productCheckout.ts  Integração com a Edge Function de criação de pedido (Pix)
    orderAccess.ts      Persistência local do acesso a um pedido já criado
    orderDownloads.ts   Integração com a Edge Function de liberação dos downloads
    checkoutAttempt.ts  IDs de uma tentativa de checkout (retry idempotente)
    guiaPixel.ts        Meta Pixel da página do Guia (eventos de conversão)
    whatsapp.ts         Link de suporte via WhatsApp para falhas de pagamento
    seo.ts              Título/description/canonical por rota
    utmTracking.ts      Captura e preservação de utm_* e fbclid
  pages/
    GuiaEvolucaoEnfermagemPage.tsx  Página comercial do Guia (rotas "/" e "/guia-evolucao-enfermagem")
    Privacy / Terms / Delivery / Refund / NotFound
supabase/
  functions/      Edge Functions (checkout Pix, webhook de pagamento, liberação de downloads)
  migrations/     Schema do banco (produtos, pedidos, itens, eventos de pagamento)
```

## Catálogo e checkout

O produto principal e os order bumps exibidos na página vêm de
`src/config/digitalProducts.ts` — **só para exibição/UX**. A fonte real de verdade
para produto ativo e valor cobrado é sempre `public.products` no Supabase, lida no
momento da compra pela Edge Function de criação de pedido; o frontend nunca envia
preço, só os slugs marcados.

O pagamento é feito por **Pix**. Depois da confirmação, o acesso aos arquivos é
liberado automaticamente via signed URL de um bucket privado, sem intervenção manual.

## Supabase

- Cliente do frontend usa exclusivamente a chave pública (`publishable`/`anon`).
- Toda operação de escrita (criar pedido, confirmar pagamento, liberar download)
  acontece por trás de Edge Functions validadas — nunca por escrita direta do
  cliente nas tabelas operacionais.

## Administração

Não há painel administrativo neste projeto — a gestão de pedidos e produtos é feita
por um **CRM separado**, fora deste repositório.

## Publicação

Aplicação de página única com rotas do lado do cliente — o servidor precisa
reescrever todas as rotas para `index.html`:

- **Vercel** — `vercel.json` já incluído.
- **Netlify** — `public/_redirects` já incluído.
- **Apache / Nginx** — configure o fallback para `/index.html`.
