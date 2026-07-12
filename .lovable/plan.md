## Painel Administrativo FSlobo — Plano de Construção

Escopo enorme. Vou construir em fases seguindo sua própria orientação ("teste um módulo antes de avançar"). Esta primeira entrega foca em **fundação + módulo Produtos 100% funcional**, depois avançamos módulo a módulo.

---

### Fase 1 — Fundação do painel (esta entrega)

**Layout `/admin`**
- Rota `_authenticated/admin` vira layout com `<Outlet />`
- Sidebar lateral (desktop) + drawer (mobile) com os 10 itens: Dashboard, Produtos, Categorias, Pedidos, Clientes, Blog, Cupons, Banners, SEO, Configurações
- Header com busca global, avatar e "voltar à loja"
- Estilo Vercel/Shopify: cards, skeletons, toasts (sonner), modais (shadcn Dialog), confirmações (AlertDialog)
- Guarda de admin no layout (já existe `has_role`) — todas subrotas herdam

**Dashboard (`/admin`)**
- KPIs reais do Supabase: produtos (total, digitais, físicos), pedidos, clientes, categorias, banners, artigos, receita (soma orders pagos), downloads
- Gráfico de receita últimos 30 dias (recharts, já instalado)
- Gráfico de pedidos por status
- Listas: pedidos recentes, mais vendidos, mais visualizados, novos clientes
- Skeleton loading, refetch automático via TanStack Query

**Módulo Produtos completo (CRUD)**
- Listagem `/admin/produtos`: tabela moderna com imagem, nome, categoria, preço, status, tipo, views, data, ações
  - Filtros: categoria, tipo, status, faixa de preço
  - Busca instantânea (debounce)
  - Ordenação por coluna
  - Paginação
- Form `/admin/produtos/novo` e `/admin/produtos/$id`
  - Todos os campos: nome, slug (auto), categoria, tipo (digital/afiliado/físico), descrições, preços, imagem principal + galeria (Storage bucket `products`), vídeo, PDF prévia (bucket `previews`), relacionados, FAQ (JSON), SEO (title/desc/og), status, destaque, ordem
  - Editor rico para descrição (textarea com toolbar simples via markdown — TipTap seria pesado; markdown + preview atende)
- Ações: Salvar, Cancelar, Duplicar, Excluir (soft delete `deleted_at`)
- Toast em todas operações
- Upload de imagens direto ao Storage com preview

**Segurança**
- RLS já existe nas tabelas; adicionar policies de INSERT/UPDATE/DELETE para admins usando `has_role(auth.uid(), 'admin')` onde faltarem
- Buckets de storage: policies permitindo admin escrever, público ler nas capas/produtos

**Loja pública**
- `src/routes/index.tsx` passa a ler produtos reais do Supabase (fallback aos mocks removido) para que "aparece na loja" faça sentido no teste

---

### Fases seguintes (não nesta entrega — após seu teste do módulo Produtos)

2. Categorias (CRUD) + integração loja
3. Pedidos (visualização + mudança de status)
4. Clientes (listagem/edição/exclusão)
5. Blog (editor rico TipTap + tags)
6. Banners (CRUD + slider na home)
7. Cupons (CRUD + aplicação no checkout futuro)
8. SEO global + Configurações da loja (tabela `settings`)

---

### Detalhes técnicos

- **Rotas**: `src/routes/_authenticated/admin.tsx` (layout), `admin.index.tsx` (dashboard), `admin.produtos.index.tsx`, `admin.produtos.novo.tsx`, `admin.produtos.$id.tsx`. Placeholders "Em breve" para os outros 8 módulos com o mesmo layout, para o menu funcionar já.
- **Dados**: TanStack Query em toda leitura; `useMutation` + invalidate para escrita.
- **Storage**: bucket `products` (já existe). Upload via `supabase.storage.from('products').upload()`.
- **Migrations**: adicionar policies faltantes para admin escrever em `products`, `product_images`, `categories`, etc. + policies de storage.
- **UI**: sidebar shadcn (`SidebarProvider`), tabela nativa com shadcn `Table`, filtros com `Select` + `Input`, modal de confirmação `AlertDialog`.
- **Slug**: geração automática client-side com `slugify` (pequeno helper local).
- **Editor rico**: markdown com `react-markdown` para preview (leve). TipTap se você quiser depois.

---

### O que você vai testar após esta entrega

1. Acessar `/admin` como admin — ver dashboard com números reais
2. Ir em Produtos → Novo Produto → preencher tudo → Salvar
3. Ver o produto na listagem `/admin/produtos`
4. Editar, duplicar, excluir
5. Confirmar na home `/` que o produto aparece na loja
6. Verificar no Supabase que os registros estão persistidos

Só depois eu avanço para Categorias/Pedidos/Blog/etc.

**Confirma que posso começar por essa fatia?**
