-- ════════════════════════════════════════════════════════════════════════════
--  ENTRE NÓS TARÔ — SINCRONIZAÇÃO DO CATÁLOGO (produtos digitais)
--
--  O projeto Supabase remoto JÁ estava, antes desta migration, no estado
--  descrito abaixo (confirmado por consulta direta a public.products antes
--  de escrever este arquivo) — esta migration só REGISTRA essa mudança no
--  histórico local, de forma aditiva e IDEMPOTENTE (segura para rodar de
--  novo, em qualquer estado de partida: já sincronizado ou ainda no seed
--  original da migration 20260814_008).
--
--  Mudanças, todas dentro de public.products (nenhuma outra tabela, nenhum
--  enum, nenhuma RPC, nenhuma Edge Function tocada):
--
--    1. O produto antes em slug='2500-questoes-concursos' foi RENOMEADO
--       (mesma linha, mesmo id — não é um produto novo) para
--       slug='2000-questoes-enfermagem', name='2000 Questões de
--       Enfermagem', storage_object_path='2000-questoes-enfermagem.pdf'.
--       O UPDATE abaixo casa pelo slug ANTIGO — na primeira execução,
--       renomeia; em qualquer execução seguinte (slug antigo já não
--       existe mais), casa 0 linhas e não faz nada — idempotente por
--       construção, nunca lança erro.
--
--    2. legislacao-sus-ilustrada passou para active=false (produto
--       removido da oferta, mas a linha continua existindo — nunca
--       DELETE; pedidos antigos que porventura o referenciem continuam
--       íntegros).
--
--    3. Os demais campos dos 5 produtos (nome, kind, price_cents, active)
--       são reafirmados explicitamente para o estado final conhecido —
--       nunca dependem só do UPDATE de renomeação acima, cobrindo
--       igualmente quem aplicar esta migration numa base ainda no seed
--       original.
--
--  Estado final esperado (idêntico ao já confirmado no remoto):
--    guia-evolucao-enfermagem   primary  1700  active=true
--    guia-ilustrado-enfermagem  bump     1000  active=true
--    2000-questoes-enfermagem   bump     1000  active=true
--    legislacao-sus-ilustrada   bump     1000  active=false
--    guia-feridas-cronicas      bump     1000  active=true
--
--  Não altera create-product-order, create-pix-order,
--  mercado-pago-webhook, get-order-downloads nem nenhuma migration
--  anterior — a RPC create_or_get_product_order_with_items() já lê preço/
--  ativo/kind de public.products em tempo real, sem nenhuma mudança de
--  código necessária para refletir este catálogo.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Renomeação (idempotente: 0 linhas afetadas se já renomeado).
update public.products
   set slug = '2000-questoes-enfermagem',
       name = '2000 Questões de Enfermagem',
       storage_object_path = '2000-questoes-enfermagem.pdf'
 where slug = '2500-questoes-concursos';

-- 2. Estado final reafirmado explicitamente para cada um dos 5 produtos —
--    seguro rodar de novo a qualquer momento.
update public.products
   set name = 'Guia de Evolução de Enfermagem',
       kind = 'primary',
       price_cents = 1700,
       active = true
 where slug = 'guia-evolucao-enfermagem';

update public.products
   set name = 'Guia Ilustrado de Enfermagem',
       kind = 'bump',
       price_cents = 1000,
       active = true
 where slug = 'guia-ilustrado-enfermagem';

update public.products
   set name = '2000 Questões de Enfermagem',
       kind = 'bump',
       price_cents = 1000,
       active = true,
       storage_object_path = '2000-questoes-enfermagem.pdf'
 where slug = '2000-questoes-enfermagem';

update public.products
   set active = false
 where slug = 'legislacao-sus-ilustrada';

update public.products
   set name = 'Guia de Feridas Crônicas',
       kind = 'bump',
       price_cents = 1000,
       active = true
 where slug = 'guia-feridas-cronicas';


-- ═══════════════════════════ Consultas de validação ════════════════════════
-- Comentadas de propósito — não executam automaticamente com esta migration.

-- Estado final esperado (5 linhas, exatamente como descrito no cabeçalho):
-- select slug, name, kind, price_cents, active
-- from public.products
-- order by display_order;

-- Nenhum produto com slug antigo remanescente (0 linhas = ok):
-- select slug from public.products where slug = '2500-questoes-concursos';
