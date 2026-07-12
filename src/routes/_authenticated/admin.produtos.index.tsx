import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currency } from "@/lib/slug";

export const Route = createFileRoute("/_authenticated/admin/produtos/")({
  component: List,
});

const PAGE = 20;

function List() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<string>("created_at.desc");

  const cats = useQuery({
    queryKey: ["admin-cats-filter"],
    queryFn: async () => (await supabase.from("categories").select("id, name").is("deleted_at", null).order("name")).data ?? [],
  });

  const data = useQuery({
    queryKey: ["admin-products", { q, type, status, cat, page, sort }],
    queryFn: async () => {
      const [col, dir] = sort.split(".");
      let query = supabase
        .from("products")
        .select("id, title, slug, price, promo_price, status, product_type, cover_url, sales_count, created_at, category_id, categories(name)", { count: "exact" })
        .is("deleted_at", null);
      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
      if (type !== "all") query = query.eq("product_type", type as any);
      if (status !== "all") query = query.eq("status", status);
      if (cat !== "all") query = query.eq("category_id", cat);
      query = query.order(col, { ascending: dir === "asc" });
      query = query.range(page * PAGE, page * PAGE + PAGE - 1);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data.data?.count ?? 0) / PAGE)), [data.data]);

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            {data.data?.count ?? 0} produto(s) cadastrado(s). Apenas produtos com status <b>Publicado</b> aparecem na loja.
          </p>
        </div>
        <Link to="/admin/produtos/novo" className="ml-auto">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 grid gap-3 md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-8" />
        </div>
        <Select value={cat} onValueChange={(x) => { setCat(x); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(x) => { setType(x); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="digital">Digital</SelectItem>
            <SelectItem value="physical">Físico</SelectItem>
            <SelectItem value="affiliate">Afiliado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(x) => { setStatus(x); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14"></TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort(sort === "title.asc" ? "title.desc" : "title.asc")}>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort(sort === "price.asc" ? "price.desc" : "price.asc")}>Preço</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort(sort === "sales_count.asc" ? "sales_count.desc" : "sales_count.asc")}>Vendas</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort(sort === "created_at.asc" ? "created_at.desc" : "created_at.asc")}>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}
                </TableRow>
              ))}
            {!data.isLoading && data.data?.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            )}
            {(data.data?.rows ?? []).map((p: any) => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate({ to: "/admin/produtos/$id", params: { id: p.id } })}
              >
                <TableCell>
                  {p.cover_url ? (
                    <img src={p.cover_url} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted grid place-items-center"><Package className="h-4 w-4 text-muted-foreground" /></div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.categories?.name ?? "—"}</TableCell>
                <TableCell>
                  {p.promo_price ? (
                    <div>
                      <p className="text-sm font-bold">{currency(p.promo_price)}</p>
                      <p className="text-[10px] line-through text-muted-foreground">{currency(p.price)}</p>
                    </div>
                  ) : (
                    <p className="text-sm">{currency(p.price)}</p>
                  )}
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{p.product_type}</Badge></TableCell>
                <TableCell>
                  <Badge variant={p.status === "published" ? "default" : "secondary"} className="text-[10px]">{p.status}</Badge>
                </TableCell>
                <TableCell className="text-xs">{p.sales_count ?? 0}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}