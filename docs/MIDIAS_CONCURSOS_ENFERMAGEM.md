# Mídias da landing Mapas Mentais Ilustrados (`/produto/concursos-enfermagem`)

Este documento lista os arquivos que `src/pages/MapasMentaisPage.tsx` e
`src/components/mapasMentais/MapasMentaisConversationSection.tsx` esperam encontrar em
`public/concursos-enfermagem/`.

**Status (24/08/2026): os arquivos reais foram colocados manualmente em PNG/MP4, otimizados (WebP +
MP4 comprimido) com `sharp`/`ffmpeg`, e os originais pesados foram MOVIDOS para um backup local
fora do repositório — ver seção "Originais movidos para backup local" abaixo. `public/concursos-
enfermagem/` contém hoje só os 13 WebPs + o MP4 otimizado (o que o código realmente usa); nenhum
PNG nem o MP4 bruto continuam dentro do projeto/repositório.**

## Originais movidos para backup local (fora do repositório)

Os 14 arquivos originais pesados (13 PNGs + o MP4 bruto) **não estão mais em `public/`** — foram
movidos (não copiados: removidos daqui) para:

```
C:\Users\usuario\Documents\sites-clientes\fslobo-enfermagem-media-originais\concursos-enfermagem\
```

com a mesma estrutura de subpasta (`conversas\` dentro dela). Essa pasta fica **fora** da árvore do
projeto — não é lida pelo Vite, não entra no build (`dist/`), e não é rastreada pelo Git. Ela existe
só como cópia de segurança caso seja preciso reconverter algum arquivo no futuro com parâmetros
diferentes. Os `.webp`/MP4 otimizado usados pelo código nunca dependem dela em tempo de execução.

## Hero SEM mídia (decisão intencional)

A Hero desta landing **não tem vídeo nem imagem de fundo, de propósito**. Não existe
`hero-concursos.mp4` no projeto e o código não faz nenhuma tentativa de carregá-lo — o componente
que fazia isso (`HeroBackgroundVideo`) foi removido de `MapasMentaisPage.tsx`. A Hero usa só fundo
navy sólido (`#0a1622`) + gradientes/glows em CSS (`HERO_VIDEO_OVERLAY`, mantido pelo nome
histórico mas hoje puramente decorativo) — nenhum espaço é reservado para vídeo. Se um vídeo de
Hero for adicionado no futuro, isso exige uma alteração de código nova, não é automático.

## Imagens — WebP em uso no código (originais no backup local)

O `.webp` de cada imagem foi gerado a partir do `.png` original via `sharp`
(`quality: 88, effort: 6, smartSubsample: true`, sem redimensionar, com rotação automática por
metadata EXIF e sem metadata desnecessária no arquivo de saída). **O código usa exclusivamente os
`.webp`**, que são os únicos arquivos de imagem que continuam em `public/concursos-enfermagem/` —
os `.png` de origem estão no backup local (ver seção acima), não mais neste diretório.

| Arquivo em uso (código) | Original (agora só no backup local) | Dimensões | PNG original | WebP otimizado | Redução |
|---|---|---|---|---|---|
| `capa-mapas-mentais.webp` | `capa-mapas-mentais.png` | 1080×1350 | 1398,4 KB | 127,5 KB | 90,9% |
| `modulo-1.webp` | `modulo-1.png` | 1080×1350 | 1699,3 KB | 259,8 KB | 84,7% |
| `modulo-2.webp` | `modulo-2.png` | 1080×1350 | 911,4 KB | 52,7 KB | 94,2% |
| `modulo-3.webp` | `modulo-3.png` | 1080×1350 | 1647,7 KB | 244,4 KB | 85,2% |
| `modulo-4.webp` | `modulo-4.png` | 1080×1350 | 980,0 KB | 70,2 KB | 92,8% |
| `modulo-5.webp` | `modulo-5.png` | 1080×1350 | 1596,8 KB | 238,4 KB | 85,1% |
| `modulo-6.webp` | `modulo-6.png` | 1080×1350 | 1055,7 KB | 90,1 KB | 91,5% |
| `modulo-7.webp` | `modulo-7.png` | 1080×1350 | 1528,3 KB | 216,3 KB | 85,8% |
| `modulo-8.webp` | `modulo-8.png` | 1080×1350 | 1133,6 KB | 56,4 KB | 95,0% |
| `modulo-9.webp` | `modulo-9.png` | 1080×1350 | 1482,2 KB | 202,1 KB | 86,4% |
| `conversas/conversa-1.webp` | `conversas/conversa-1.png` | 910×1729 | 1291,8 KB | 86,1 KB | 93,3% |
| `conversas/conversa-2.webp` | `conversas/conversa-2.png` | 921×1707 | 1299,4 KB | 89,4 KB | 93,1% |
| `conversas/conversa-3.webp` | `conversas/conversa-3.png` | 922×1706 | 1323,4 KB | 88,2 KB | 93,3% |

Todos os 13 WebPs ficaram bem abaixo do teto de 600 KB já na primeira tentativa (`quality: 88`) —
nenhum precisou da segunda passada em `quality: 82`. `sharp.metadata()` confirmou `format: "webp"`
genuíno em cada um dos 13 arquivos gerados (não é uma extensão trocada).

> **Nota:** `conversa-2.png` foi substituído externamente (arquivo/dimensões diferentes) durante
> esta mesma etapa, depois da primeira conversão — o `conversa-2.webp` original (gerado a partir do
> PNG antigo) foi perdido nessa troca. Foi regenerado a partir do PNG atual antes da entrega final;
> os números acima já refletem o arquivo atual, não o original da primeira passada.

**Total das 13 imagens: ~17,0 MB (PNG) → ~1,8 MB (WebP) — redução de ~89,5%.**

## Vídeo demonstrativo — original no backup local, versão otimizada em uso

| | Arquivo | Localização | Resolução | Codec vídeo | Codec áudio | Duração | Tamanho |
|---|---|---|---|---|---|---|---|
| Original | `video-mapas-mentais.mp4` | backup local (ver seção acima) — não está mais em `public/` | 1080×1920 | H.264 (~9,53 Mbps) | MP3 (~128 kbps) | 23,33s | ~28,20 MB |
| **Otimizado (em uso no código)** | `video-mapas-mentais-otimizado.mp4` | `public/concursos-enfermagem/` | **720×1280** (mesma proporção 9:16) | H.264/libx264, preset medium, CRF 25, yuv420p | AAC 96 kbps | 23,33s (idêntica) | **~9,66 MB** |

Gerado com:
```
ffmpeg -i video-mapas-mentais.mp4 -vf "scale=720:-2" \
  -c:v libx264 -preset medium -crf 25 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart \
  video-mapas-mentais-otimizado.mp4
```
Validado com `ffprobe`: proporção original preservada exatamente (1080/1920 = 720/1280 = 0,5625),
`+faststart` aplicado (moov atom movido para o início — necessário para o vídeo começar a tocar
antes do download completo terminar). **Redução: ~65,7%** (28,20 MB → 9,66 MB), dentro da faixa
alvo de 8–12 MB.

## Lista de arquivos esperados pelo código (paths finais)

| Caminho | Finalidade | Proporção do container |
|---|---|---|
| ~~`hero-concursos.mp4`~~ | **Removido — Hero é CSS-only, sem vídeo** | — |
| `public/concursos-enfermagem/capa-mapas-mentais.webp` | Capa do produto, Hero coluna direita, só desktop (lg+) | Retrato, 3:4 |
| `public/concursos-enfermagem/modulo-1.webp` … `modulo-9.webp` | 9 páginas de exemplo, carrossel "O que você vai ter em mãos" | Retrato, 3:4 (`object-contain`, sem corte) |
| `public/concursos-enfermagem/conversas/conversa-1.webp` … `conversa-3.webp` | 3 prints de conversas/depoimentos reais, prova social | Retrato, 9:16 (`object-contain` + fundo discreto, nunca corta a mensagem) |
| `public/concursos-enfermagem/video-mapas-mentais-otimizado.mp4` | Vídeo demonstrativo da oferta, seção de preço/checkout (`controls`, `playsInline`, `preload="metadata"`, sem autoplay) | Retrato, 9:16 (`object-contain` + fundo navy, vídeo aparece inteiro) |
| `public/concursos-enfermagem/og-mapas-mentais.jpg` | Imagem de Open Graph — **reservada, ainda não colocada nem usada em código** (ver nota abaixo) | Paisagem, 1200×630px |

## Avisos importantes

- **Renomear um `.png` para `.webp` NÃO converte o arquivo.** Os WebPs desta landing foram gerados
  com conversão real via `sharp` (não uma troca de extensão) — confirmado lendo `format` da
  metadata real de cada arquivo de saída.
- **Os arquivos originais (PNG e o MP4 bruto) foram movidos, não apagados**, para o backup local
  fora do repositório (ver seção "Originais movidos para backup local" no topo deste documento). Se
  precisar reconverter com outros parâmetros no futuro, os originais continuam disponíveis lá.
- **Os PDFs vendidos (o material que a cliente recebe após pagar) NUNCA devem ir para `public/`.**
  Qualquer arquivo dentro de `public/` é servido publicamente, sem autenticação, para qualquer
  visitante do site — colocar o PDF ali equivaleria a distribuí-lo de graça. Os PDFs comprados
  continuam exclusivamente no Supabase Storage, no bucket privado `product-files`, e só são
  entregues via signed URL temporária gerada pela Edge Function `get-order-downloads` depois que o
  pagamento é confirmado (ver `supabase/functions/get-order-downloads/index.ts`). Este documento
  trata apenas de mídia de **marketing/apresentação** da página — nunca do arquivo final vendido.
- **`og-mapas-mentais.jpg` ainda não está referenciada no código.** A API atual de
  `useDocumentMeta()` (`src/lib/seo.ts`) não aceita uma imagem de Open Graph customizada por
  página — só `title`/`description`/`path`/`noindex`. Por instrução explícita, a API global de SEO
  não foi alterada só para isso. O arquivo é reservado neste documento para quando essa capacidade
  for adicionada ao `seo.ts` (fora do escopo atual) — até lá, o Open Graph desta página herda o
  `og:image` padrão definido em `index.html`.

## Fallback quando um arquivo não existe ou falha ao carregar

`MapasMentaisPage.tsx` (componentes `MediaImage`/`DemoVideo`) e
`MapasMentaisConversationSection.tsx` (`ConversationImage`) nunca deixam um `<img>`/`<video>` com
`src` vazio nem mostram o ícone de mídia quebrada do navegador: cada um escuta o evento `onError`
do elemento e, se o arquivo não existir (404) ou falhar ao carregar, substitui a mídia por um
painel com a MESMA proporção final — gradiente teal/navy, um ícone apropriado e o texto discreto
"Prévia do material". Isso continua valendo mesmo com os arquivos reais já em uso — protege contra
qualquer arquivo que venha a ser removido/corrompido depois. A Hero não usa mais esse mecanismo
(não tem mídia nenhuma, ver seção acima).
