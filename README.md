# Entre Nós Tarô — Landing page

Landing page de página única para venda de leituras de tarô online por quantidade de perguntas.
React + TypeScript + Vite + Tailwind CSS + componentes no padrão shadcn/ui (Radix), Framer Motion e Lucide Icons.

```bash
npm install
npm run dev      # ambiente de desenvolvimento em http://localhost:5173
npm run build    # build de produção em dist/
npm run preview  # pré-visualização do build
npm run assets   # regenera os arquivos de public/brand a partir das imagens originais
```

---

## ⚠️ Antes de publicar — preencha estes campos

Todos ficam em **`src/config/site.ts`** (nenhum dado comercial está espalhado pelos componentes).
Em modo de desenvolvimento o console avisa quais ainda estão pendentes.

| Campo | Onde | O que colocar |
| --- | --- | --- |
| `contact.whatsappNumber` | `site.ts` | Número em formato internacional, só dígitos: `5511987654321` |
| `contact.instagramHandle` | `site.ts` | Usuário do Instagram, sem `@` |
| `contact.email` | `site.ts` | E-mail exibido nas páginas legais |
| `contact.siteUrl` | `site.ts` | Domínio final (canonical, Open Graph, sitemap) |
| `analytics.metaPixelId` | `site.ts` | ID numérico do Meta Pixel |

**Confirmar (valores sugeridos, ajuste se necessário):**

| Campo | Valor atual |
| --- | --- |
| `commercial.deliveryTime` | `em até 24 horas úteis` |
| `commercial.paymentMethod` | `Pix` |

**Também atualize o domínio nestes arquivos estáticos:** `index.html` (canonical e Open Graph),
`public/sitemap.xml` e `public/robots.txt`.

**Páginas legais:** `src/config/legal.ts` contém `RESPONSIBLE` (razão social / CNPJ ou CPF) e
`UPDATED_AT`. O texto é um ponto de partida e deve ser revisado juridicamente.

---

## Assets gerados (`npm run assets`)

Tudo em `public/brand/` é derivado das duas imagens originais na raiz do projeto
(`banner entre nós.png` e `entre_nos_taro_foto_perfil.png`). O script usa `sharp`
para as imagens e `ffmpeg-static` para o vídeo — nenhum binário externo é necessário.

| Arquivo | O que é |
| --- | --- |
| `hero-cartas.mp4` / `hero-cartas-mobile.mp4` | Vídeo cinematográfico de fundo da hero: loop contínuo de 20 s (movimento em seno, o último quadro volta ao primeiro), com zoom lento, deriva de luz dourada e vinheta. Versão horizontal e vertical. |
| `hero-poster.webp` / `hero-poster-mobile.webp` | Poster do vídeo. Aparece de imediato e é o único fundo exibido em `prefers-reduced-motion`. |
| `tema-*.webp` / `.avif` / `-540.webp` | Artes 1080×1350 dos quatro temas — enquadramentos diferentes da própria arte da capa, com gradação de cor e véu de leitura. |
| `logo-*`, `favicon-*`, `icon-*`, `selo-carta.png` | Logotipo, favicons e o selo isolado da carta. |
| `og-entre-nos-taro.jpg` | Imagem de Open Graph 1200×630. |

Para trocar o vídeo por uma filmagem própria, basta substituir os dois `.mp4`
(mantendo os nomes) ou apontar outros caminhos em `brand.heroVideo` no `site.ts`.

## Estrutura

```
src/
  components/       Seções da página, primitivos de UI (ui/) e elementos visuais (common/)
  config/
    site.ts         Marca, contato, pacotes, preços, textos, links legais, Meta Pixel
    legal.ts        Conteúdo das quatro páginas legais
  context/
    SelectionContext.tsx   Tema escolhido, pacote em qualificação e estado do modal
  lib/
    metaPixel.ts    Eventos do Meta Pixel (carregado só após consentimento)
    utmTracking.ts  Captura e preservação de utm_* e fbclid
    whatsapp.ts     Montagem da mensagem e do link wa.me
    consent.ts      Consentimento de medição
    scroll.ts       Rolagem suave com compensação do cabeçalho fixo
    seo.ts          Título/description/canonical por rota + JSON-LD
  pages/
    Index.tsx        Home
    ThemeReading.tsx Página de cada tema — rota /leituras/:slug
    Privacy / Terms / Delivery / Refund / NotFound
scripts/
  generate-assets.mjs   Gera WebP/AVIF, favicons e imagem de Open Graph
```

## Fluxo comercial

A seção de pacotes **não existe mais na home**: os valores vivem dentro da página de
cada tema. O caminho é:

1. Home → carrossel de temas → o visitante escolhe o tema que fala com ele.
2. `/leituras/{tema}` → conteúdo do tema + **os pacotes com os valores**.
   Os CTAs da home (`goToOffer` em `SelectionContext`) rolam até `#pacotes` quando
   ele existe na página; caso contrário, levam ao carrossel de temas.
3. Ao escolher um pacote abre-se o **modal de qualificação** em 5 etapas
   (pacote → tema → intenção → valor → identificação) e só então a tela final com
   o botão do WhatsApp. O tema já chega pré-selecionado a partir da página visitada.
4. O site coleta apenas: primeiro nome, tema, formato preferido e as duas confirmações
   (prazo e valor). **Nunca** pede a pergunta da consulta, documentos, data de nascimento
   ou dados sensíveis.

Para redesenhar como os valores aparecem dentro dos cards, o componente é
`src/components/PricingPackages.tsx` — hoje ele é renderizado apenas em
`src/pages/ThemeReading.tsx`.

## Eventos do Meta Pixel

| Evento | Quando |
| --- | --- |
| `PageView` | Ao carregar, **após** o consentimento |
| `ViewContent` | Seção de pacotes entra na tela |
| `SelectPackage` (personalizado) | Clique em um pacote |
| `InitiateCheckout` | Abertura do modal de qualificação |
| `Lead` | Pacote confirmado, valor confirmado, prazo confirmado e tela final |
| `Contact` | Clique que abre o WhatsApp |
| `Purchase` | **Desativado.** Só pode ser disparado após confirmação real do pagamento — ver `PURCHASE_ENABLED` em `src/lib/metaPixel.ts` |

Nenhum conteúdo de consulta, resposta aberta ou dado sensível é enviado à Meta.

## Depoimentos

O array `testimonials` em `src/config/site.ts` está **vazio de propósito**. Enquanto estiver assim,
a seção "O que esperar" é exibida e nenhum schema de avaliação é gerado. Adicione apenas
depoimentos reais e autorizados.

## Publicação

Aplicação de página única com rotas do lado do cliente — o servidor precisa reescrever
todas as rotas para `index.html`:

- **Vercel** — `vercel.json` já incluído.
- **Netlify** — `public/_redirects` já incluído.
- **Apache / Nginx** — configure o fallback para `/index.html`.
